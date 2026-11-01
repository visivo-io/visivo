"""A project's first source becomes its default (VIS-1653).

A SQL model with no `source` is only valid when the project names a default
(`ModelsHaveSourcesValidator`), so a new project that gains its first source and
no default fails to compile the moment anything references it — which is the
first thing a new user does.

The seed lands in the SAME draft store the defaults endpoint writes
(`FlaskApp._cached_defaults`), which is what `changed_project_settings` reports
and what the commit path writes to YAML. `ProjectManager` keeps a second,
parallel copy that only `/api/projects/` reads — seeding that one would show the
default in the UI and never commit it.

The rule hangs off the shared save path, so every writer gets it. These tests go
through three: the manager, the HTTP route a person's editor calls, and the
agent's `write_source` tool.
"""

import json
import os

import pytest

from tests.factories.model_factories import ProjectFactory, SourceFactory
from visivo.agent.tools import call
from visivo.models.defaults import Defaults


def _config(name, database):
    return {"name": name, "type": "sqlite", "database": database}


class TestAdoptDefaultSource:
    """The rule itself."""

    def _app(self, project, output_dir):
        from visivo.server.flask_app import FlaskApp

        abs_output_dir = os.path.abspath(output_dir)
        app = FlaskApp(abs_output_dir, project, working_dir=abs_output_dir)
        app.app.config["TESTING"] = True
        return app

    def test_a_project_with_no_default_adopts_the_name(self, output_dir):
        app = self._app(ProjectFactory(sources=[], dashboards=[], defaults=None), output_dir)

        assert app.adopt_default_source("warehouse") is True
        assert app._cached_defaults.source_name == "warehouse"

    def test_an_existing_default_is_never_overwritten(self, output_dir):
        chosen = SourceFactory(name="chosen")
        project = ProjectFactory(
            sources=[chosen], dashboards=[], defaults=Defaults(source_name="chosen")
        )
        app = self._app(project, output_dir)

        assert app.adopt_default_source("other") is False
        assert app._cached_defaults is None

    def test_other_defaults_survive_the_write(self, output_dir):
        project = ProjectFactory(sources=[], dashboards=[], defaults=Defaults(threads=4))
        app = self._app(project, output_dir)

        app.adopt_default_source("warehouse")

        assert app._cached_defaults.source_name == "warehouse"
        assert app._cached_defaults.threads == 4

    def test_it_lands_where_the_commit_path_looks(self, output_dir):
        """The whole point of this store rather than ProjectManager's: a seed
        that is not in `changed_project_settings` never reaches the YAML."""
        app = self._app(ProjectFactory(sources=[], dashboards=[], defaults=None), output_dir)

        app.adopt_default_source("warehouse")

        changed = app.changed_project_settings()
        assert "defaults" in changed
        assert changed["defaults"].source_name == "warehouse"
        assert app.has_draft_changes() is True


class TestThroughTheSavePath:
    """Every writer goes through `SourceManager.save`, so the hook fires for all."""

    def _app(self, project, output_dir):
        from visivo.server.flask_app import FlaskApp

        abs_output_dir = os.path.abspath(output_dir)
        app = FlaskApp(abs_output_dir, project, working_dir=abs_output_dir)
        app.app.config["TESTING"] = True
        return app

    def test_the_first_source_becomes_the_default(self, output_dir):
        app = self._app(ProjectFactory(sources=[], dashboards=[], defaults=None), output_dir)

        app.source_manager.save_from_config(_config("warehouse", "w.sqlite"))

        assert app._cached_defaults.source_name == "warehouse"

    def test_the_second_source_changes_nothing(self, output_dir):
        app = self._app(ProjectFactory(sources=[], dashboards=[], defaults=None), output_dir)

        app.source_manager.save_from_config(_config("warehouse", "w.sqlite"))
        app.source_manager.save_from_config(_config("lake", "l.sqlite"))

        assert app._cached_defaults.source_name == "warehouse"

    def test_a_project_that_already_has_a_source_is_left_alone(self, output_dir):
        """Nothing is "first" here, so no default is invented — the ambiguity
        this avoids is exactly why it is not inferred at validation time."""
        existing = SourceFactory(name="existing")
        app = self._app(
            ProjectFactory(sources=[existing], dashboards=[], defaults=None), output_dir
        )

        app.source_manager.save_from_config(_config("second", "s.sqlite"))

        assert app._cached_defaults is None

    def test_a_default_chosen_in_the_draft_tier_survives_the_first_source(self, output_dir):
        """A published project cannot name a source it does not have, so the
        only way to pick a default before the first source exists is through
        the draft tier — which is what the editor writes to."""
        app = self._app(ProjectFactory(sources=[], dashboards=[], defaults=None), output_dir)
        app.app.test_client().post("/api/defaults/", json={"source_name": "chosen"})

        app.source_manager.save_from_config(_config("warehouse", "w.sqlite"))

        assert app._cached_defaults.source_name == "chosen"


class TestThroughTheWriters:
    """Two writers, one rule — the point of putting it in the save path."""

    @pytest.fixture
    def empty_project_app(self, output_dir):
        """A FlaskApp whose project has no sources and no defaults."""
        from visivo.server.flask_app import FlaskApp

        abs_output_dir = os.path.abspath(output_dir)
        project = ProjectFactory(sources=[], dashboards=[], defaults=None)
        app = FlaskApp(abs_output_dir, project, working_dir=abs_output_dir)
        app.app.config["TESTING"] = True
        return app

    def _default_source(self, app):
        """Read it back the way the editor does, not off the attribute."""
        body = app.app.test_client().get("/api/defaults/").get_json()
        return body.get("source_name")

    def test_the_editors_route_seeds_it(self, empty_project_app):
        client = empty_project_app.app.test_client()

        response = client.post(
            "/api/sources/warehouse/",
            data=json.dumps(_config("warehouse", "w.sqlite")),
            content_type="application/json",
        )

        assert response.status_code == 201
        assert self._default_source(empty_project_app) == "warehouse"

    def test_the_agents_tool_seeds_it_too(self, empty_project_app):
        call(
            empty_project_app,
            "write_source",
            {"config": _config("warehouse", "w.sqlite")},
        )

        assert self._default_source(empty_project_app) == "warehouse"


class TestTheErrorItActuallyFixes:
    """The reported symptom, reproduced and then shown gone.

    Seeding the default is only worth anything if it reaches the project that
    gets validated. `inject_cached_objects` overlays every manager's drafts;
    `defaults` has no manager, so it needs its own line — without it the seed
    shows in the editor and the run still fails.
    """

    def _app(self, output_dir):
        from visivo.server.flask_app import FlaskApp

        abs_output_dir = os.path.abspath(output_dir)
        project = ProjectFactory(sources=[], dashboards=[], models=[], defaults=None)
        app = FlaskApp(abs_output_dir, project, working_dir=abs_output_dir)
        app.app.config["TESTING"] = True
        return app

    def _commit_error(self, app):
        from visivo.server.views.commit_views import _validate_pending_project

        return _validate_pending_project(app)

    def test_drafting_a_source_then_a_sourceless_model_is_valid(self, output_dir):
        app = self._app(output_dir)
        client = app.app.test_client()

        client.post("/api/sources/warehouse/", json=_config("warehouse", "w.sqlite"))
        client.post(
            "/api/models/orders/",
            json={"name": "orders", "sql": "select 1 as a"},
        )

        assert self._commit_error(app) is None

    def test_without_the_seed_it_is_the_reported_error(self, output_dir):
        """Pins the symptom: the same drafts, with no default adopted, produce
        the sentence the user saw."""
        app = self._app(output_dir)
        client = app.app.test_client()

        client.post("/api/sources/warehouse/", json=_config("warehouse", "w.sqlite"))
        client.post(
            "/api/models/orders/",
            json={"name": "orders", "sql": "select 1 as a"},
        )
        app._cached_defaults = None  # as if the source had never adopted one

        error = self._commit_error(app)
        assert error is not None
        assert "does not specify a source and project does not specify default source" in error
