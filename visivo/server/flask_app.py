import os
from flask import Flask
from visivo.models.project import Project
from visivo.parsers.serializer import Serializer
from visivo.server.views import register_views
from visivo.logger.logger import Logger
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
from visivo.server.managers.csv_script_model_manager import CsvScriptModelManager
from visivo.server.managers.local_merge_model_manager import LocalMergeModelManager
from visivo.server.managers.project_manager import ProjectManager
from visivo.server.managers.run_manager import RunManager


class FlaskApp:

    def __init__(self, output_dir, project: Project, working_dir=None):
        self.app = Flask(__name__, static_folder=output_dir, static_url_path="/data")

        self._project_json = (
            Serializer(project=project).dereference().model_dump_json(exclude_none=True)
        )
        self._project = project

        self._working_dir = working_dir
        self.output_dir = output_dir
        self.hot_reload_server = None  # Will be set by serve_phase
        self._cached_defaults = None
        # In-memory run registry for the run-on-save loop (mirrors the cloud Run
        # model so the viewer's run-poller / Runs view work locally).
        self.run_manager = RunManager()

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

        self.source_manager = SourceManager()
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

        self.csv_script_model_manager = CsvScriptModelManager()
        self.csv_script_model_manager.load(dag)

        self.local_merge_model_manager = LocalMergeModelManager()
        self.local_merge_model_manager.load(dag)

        # Initialize project manager (doesn't use DAG, just stores project and cache dir)
        self.project_manager = ProjectManager(project, output_dir)

        # Initialize telemetry middleware
        init_telemetry_middleware(self.app, project)

        register_views(self.app, self, output_dir)

    def _all_object_managers(self):
        return [
            self.source_manager,
            self.model_manager,
            self.dimension_manager,
            self.metric_manager,
            self.relation_manager,
            self.insight_manager,
            self.input_manager,
            self.markdown_manager,
            self.chart_manager,
            self.table_manager,
            self.dashboard_manager,
            self.csv_script_model_manager,
            self.local_merge_model_manager,
        ]

    def has_draft_changes(self) -> bool:
        """True when any manager holds an unpublished draft (or defaults are cached)."""
        return (
            any(m.has_unpublished_changes() for m in self._all_object_managers())
            or self._cached_defaults is not None
        )

    def clear_draft_caches(self) -> None:
        """Drop every draft cache (Q15 last-write-wins on external YAML edits)."""
        for manager in self._all_object_managers():
            manager.clear_cache()
        self._cached_defaults = None

    def matches_served_project(self, project: Project) -> bool:
        """True when ``project`` serializes identically to the currently served project.

        Used by the watcher recompile to tell a genuine external YAML edit
        (which drops drafts, last-write-wins) apart from a no-op save/touch that
        recompiles to the same project (drafts must be preserved). Compares the
        dereferenced serialized form, matching how ``_project_json`` is built.
        """
        candidate_json = (
            Serializer(project=project).dereference().model_dump_json(exclude_none=True)
        )
        return candidate_json == self._project_json

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
        self.csv_script_model_manager.load(dag)
        self.local_merge_model_manager.load(dag)
        # Project manager doesn't use load(), it gets the new project directly
        self.project_manager.project = value
