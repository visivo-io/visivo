import os
from functools import partial
from flask import Flask
from visivo.models.project import Project
from visivo.parsers.serializer import Serializer
from visivo.server.views import register_views
from visivo.logger.logger import Logger
from visivo.models.defaults import Defaults
from visivo.server.repositories.exploration_repository import ExplorationRepository

from visivo.telemetry.middleware import init_telemetry_middleware
from visivo.server.managers.source_manager import SourceManager
from visivo.server.managers.model_manager import ModelManager
from visivo.server.managers.dimension_manager import DimensionManager
from visivo.server.managers.metric_manager import MetricManager
from visivo.server.managers.relation_manager import RelationManager
from visivo.server.managers.insight_manager import InsightManager
from visivo.server.managers.input_manager import InputManager
from visivo.server.managers.markdown_manager import MarkdownManager
from visivo.server.managers.chart_manager import ChartManager
from visivo.server.managers.table_manager import TableManager
from visivo.server.managers.dashboard_manager import DashboardManager
from visivo.server.managers.project_manager import ProjectManager
from visivo.server.managers.run_manager import RunManager
from visivo.server.managers.staged_manager import StagedManager
from visivo.server.names import name_clash


from visivo.server.constants import resolve_host


def _settings_dump(setting):
    return None if setting is None else setting.model_dump(mode="json", exclude_none=True)


class FlaskApp:

    def __init__(self, output_dir, project: Project, working_dir=None, host=None, port=None):
        self.app = Flask(__name__, static_folder=output_dir, static_url_path="/data")

        # Which Visivo deployment this serve is bound to (VIS-1376). Everything
        # that reaches cloud reads it from here rather than from the import-time
        # constant, which a --host flag cannot change.
        self.host = resolve_host(host)
        # The port this serve is actually on. The device-authorize callback URL
        # is built from it — hardcoding 8000 sent the token nowhere whenever
        # someone served on a different port.
        self.port = port

        self._project_json = (
            Serializer(project=project).dereference().model_dump_json(exclude_none=True)
        )
        self._project = project

        self._working_dir = working_dir
        self.output_dir = output_dir
        self.hot_reload_server = None  # Will be set by serve_phase
        self.project_error = None
        self._cached_defaults = None
        self._cached_theme = None
        # In-memory run registry for the run-on-save loop (mirrors the cloud Run
        # model so the viewer's run-poller / Runs view work locally).
        self.run_manager = RunManager()
        # Which resources currently need a run — the local stand-in for the
        # cloud's data_hash / last_built_data_hash columns. Populated on save
        # whether or not a run fires, so a manual trigger has something to hold
        # the change in and the Runs tab has something to list.
        self.staged_manager = StagedManager()

        self.app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0

        # Explorations are project-root workbench data (NOT a rebuildable
        # target/ artifact), stored under a NEW `.visivo/explorations/` dir,
        # created lazily on first write (see ExplorationRepository). Falls
        # back to cwd like the CLI's own `--working-dir` default so ad-hoc
        # FlaskApp construction (e.g. in tests) never crashes on `None`.
        explorations_root = working_dir or os.getcwd()
        self.exploration_repo = ExplorationRepository(
            os.path.join(explorations_root, ".visivo", "explorations")
        )

        # Initialize object managers with DAG for efficient loading
        dag = project.dag()

        self.source_manager = SourceManager(project_dir=working_dir)
        self.source_manager.load(dag)

        self.model_manager = ModelManager()
        self.model_manager.load(dag)

        self.dimension_manager = DimensionManager()
        self.dimension_manager.load(dag)

        self.metric_manager = MetricManager()
        self.metric_manager.load(dag)

        self.relation_manager = RelationManager()
        self.relation_manager.load(dag)

        self.insight_manager = InsightManager()
        self.insight_manager.load(dag)

        self.input_manager = InputManager()
        self.input_manager.load(dag)

        self.markdown_manager = MarkdownManager()
        self.markdown_manager.load(dag)

        self.chart_manager = ChartManager()
        self.chart_manager.load(dag)

        self.table_manager = TableManager()
        self.table_manager.load(dag)

        self.dashboard_manager = DashboardManager()
        self.dashboard_manager.load(dag)

        for manager in self._all_object_managers():
            manager.name_clash = partial(name_clash, self, manager)

        # Initialize project manager (doesn't use DAG, just stores project and cache dir)
        self.project_manager = ProjectManager(project, output_dir)

        # A project's first source becomes its default (VIS-1653). Wired here
        # rather than inside SourceManager for the same reason `name_clash` is:
        # the manager owns sources, not the project's defaults.
        self.source_manager.on_first_source = self.adopt_default_source

        # Initialize telemetry middleware
        init_telemetry_middleware(self.app, project)

        register_views(self.app, self, output_dir)

    def _object_managers_by_type(self):
        return {
            "source": self.source_manager,
            "model": self.model_manager,
            "dimension": self.dimension_manager,
            "metric": self.metric_manager,
            "relation": self.relation_manager,
            "insight": self.insight_manager,
            "input": self.input_manager,
            "markdown": self.markdown_manager,
            "chart": self.chart_manager,
            "table": self.table_manager,
            "dashboard": self.dashboard_manager,
        }

    def _all_object_managers(self):
        return list(self._object_managers_by_type().values())

    def adopt_default_source(self, source_name: str) -> bool:
        """Make ``source_name`` the project default when there is none yet.

        A SQL model with no ``source`` is only valid if the project names a
        default (``ModelsHaveSourcesValidator``), so a new project that gains
        its first source and no default fails the moment anything references
        it — which is immediately.

        Called only for a project's FIRST source, so there is nothing to choose
        between. Deliberately not inferred at validation time: once a project
        has several sources "the first available one" is an artefact of file
        and include order, so the same project could resolve differently after
        an unrelated edit. Writing it into the draft means the user sees it in
        the diff, and it reaches the YAML on commit like any other edit.

        Returns whether it wrote anything.
        """
        current = self._cached_defaults or self.project.defaults
        if current is not None and current.source_name:
            return False

        base = current.model_dump(exclude_none=True) if current else {}
        self._cached_defaults = Defaults(**{**base, "source_name": source_name})
        Logger.instance().debug(f"Adopted '{source_name}' as the project default source")
        return True

    def changed_project_settings(self) -> dict:
        """Draft project-level settings (``defaults``, ``theme``) that differ from the published ones."""
        changed = {}
        for key, cached in (("defaults", self._cached_defaults), ("theme", self._cached_theme)):
            if cached is None:
                continue
            published = getattr(self.project, key, None)
            dump = {"mode": "json", "exclude_none": True}
            if published is None or cached.model_dump(**dump) != published.model_dump(**dump):
                changed[key] = cached
        return changed

    def has_draft_changes(self) -> bool:
        """True when any manager holds an unpublished draft or a project setting changed."""
        return any(m.has_unpublished_changes() for m in self._all_object_managers()) or bool(
            self.changed_project_settings()
        )

    def drop_stale_drafts(self, project: Project) -> list:
        """Drop the drafts that ``project``, freshly compiled from disk, conflicts with.

        Each manager drops only the drafts whose own object changed on disk, so
        drafts of untouched objects survive a file edit. Draft ``defaults`` and
        ``theme`` drop when that setting changed on disk. Returns
        ``[{"type", "name"}]`` for each dropped draft that held a change.
        """
        dag = project.dag()
        dropped = [
            {"type": type_name, "name": name}
            for type_name, manager in self._object_managers_by_type().items()
            for name in manager.drop_stale_drafts(dag)
        ]
        changed_settings = self.changed_project_settings()
        for key in ("defaults", "theme"):
            cache_attr = f"_cached_{key}"
            if getattr(self, cache_attr) is None:
                continue
            if _settings_dump(getattr(project, key, None)) == _settings_dump(
                getattr(self.project, key, None)
            ):
                continue
            setattr(self, cache_attr, None)
            if key in changed_settings:
                dropped.append({"type": key, "name": key})
        return dropped

    @property
    def project(self):
        return self._project

    @project.setter
    def project(self, value):
        Logger.instance().debug(f"Setting new project on FlaskApp")
        self._project_json = (
            Serializer(project=value).dereference().model_dump_json(exclude_none=True)
        )
        self._project = value
        # Reload object managers with new project DAG (preserves cached objects)
        dag = value.dag()
        self.source_manager.load(dag)
        self.model_manager.load(dag)
        self.dimension_manager.load(dag)
        self.metric_manager.load(dag)
        self.relation_manager.load(dag)
        self.insight_manager.load(dag)
        self.input_manager.load(dag)
        self.markdown_manager.load(dag)
        self.chart_manager.load(dag)
        self.table_manager.load(dag)
        self.dashboard_manager.load(dag)
        # Project manager doesn't use load(), it gets the new project directly
        self.project_manager.project = value
