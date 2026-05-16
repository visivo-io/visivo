"""Tests for the /api/project/draft_mode/ endpoint and resolver."""

import os
import tempfile

import pytest

from visivo.server.draft_mode import resolve_draft_mode_enabled
from visivo.server.flask_app import FlaskApp
from visivo.commands.utils import create_file_database

from tests.factories.model_factories import (
    DefaultsFactory,
    ProjectFactory,
    SourceFactory,
)


# --- Resolver unit tests -----------------------------------------------------


class TestResolveDraftModeEnabled:
    """Unit tests for resolve_draft_mode_enabled."""

    def test_none_project_returns_false(self):
        """A None project is treated as fresh (immediate write)."""
        assert resolve_draft_mode_enabled(None) is False

    def test_fresh_project_returns_false(self):
        """A project with no models, insights, or dashboards is fresh."""
        project = ProjectFactory(sources=[], dashboards=[], models=[], insights=[])
        assert resolve_draft_mode_enabled(project) is False

    def test_project_with_dashboards_returns_true(self):
        """A project that has dashboards is in draft mode by default."""
        # ProjectFactory's default deps create a sources+dashboards combo that
        # validates fine; we only need to confirm the resolver flips True.
        project = ProjectFactory()
        assert resolve_draft_mode_enabled(project) is True

    def test_explicit_true_overrides_fresh_project(self):
        """defaults.draft_mode_enabled=True wins even on a fresh project."""
        defaults = DefaultsFactory(draft_mode_enabled=True, source_name=None)
        project = ProjectFactory(
            sources=[], dashboards=[], models=[], insights=[], defaults=defaults,
        )
        assert resolve_draft_mode_enabled(project) is True

    def test_explicit_false_overrides_project_with_content(self):
        """defaults.draft_mode_enabled=False wins even with dashboards present."""
        defaults = DefaultsFactory(draft_mode_enabled=False)
        project = ProjectFactory(defaults=defaults)
        assert resolve_draft_mode_enabled(project) is False

    def test_explicit_none_falls_back_to_auto_derived(self):
        """defaults.draft_mode_enabled=None still uses auto-derivation."""
        defaults = DefaultsFactory(draft_mode_enabled=None, source_name=None)
        project = ProjectFactory(
            sources=[], dashboards=[], models=[], insights=[], defaults=defaults
        )
        assert resolve_draft_mode_enabled(project) is False


# --- Endpoint integration tests ---------------------------------------------


@pytest.fixture
def output_dir():
    """Create a temporary output directory."""
    return tempfile.mkdtemp()


def _make_client(project, output_dir):
    abs_output_dir = os.path.abspath(output_dir)
    flask_app = FlaskApp(abs_output_dir, project)
    flask_app.app.config["TESTING"] = True
    return flask_app.app.test_client()


class TestDraftModeEndpoint:
    """Integration tests for GET /api/project/draft_mode/."""

    def test_draft_mode_endpoint_returns_false_for_fresh_project(self, output_dir):
        """A project with no objects defaults to immediate-write."""
        source = SourceFactory(database=f"{output_dir}/test.sqlite")
        create_file_database(url=source.url(), output_dir=output_dir)
        # Fresh project: a source can exist (the user just created it),
        # but no models/insights/dashboards yet.
        project = ProjectFactory(sources=[source], dashboards=[], models=[], insights=[])
        client = _make_client(project, output_dir)

        res = client.get("/api/project/draft_mode/")

        assert res.status_code == 200
        body = res.get_json()
        assert body == {"enabled": False}

    def test_draft_mode_endpoint_returns_true_for_project_with_dashboards(self, output_dir):
        """A project with a dashboard auto-enables draft mode."""
        source = SourceFactory(database=f"{output_dir}/test.sqlite")
        create_file_database(url=source.url(), output_dir=output_dir)
        # ProjectFactory's default deps wire a working source<->dashboard graph.
        project = ProjectFactory(sources=[source])
        client = _make_client(project, output_dir)

        res = client.get("/api/project/draft_mode/")

        assert res.status_code == 200
        body = res.get_json()
        assert body == {"enabled": True}

    def test_draft_mode_endpoint_respects_explicit_setting(self, output_dir):
        """defaults.draft_mode_enabled=True wins even with no dashboards."""
        source = SourceFactory(database=f"{output_dir}/test.sqlite")
        create_file_database(url=source.url(), output_dir=output_dir)
        defaults = DefaultsFactory(draft_mode_enabled=True)
        project = ProjectFactory(
            sources=[source], dashboards=[], models=[], insights=[], defaults=defaults,
        )
        client = _make_client(project, output_dir)

        res = client.get("/api/project/draft_mode/")

        assert res.status_code == 200
        body = res.get_json()
        assert body == {"enabled": True}

    def test_draft_mode_endpoint_respects_explicit_false(self, output_dir):
        """defaults.draft_mode_enabled=False wins even with dashboards present."""
        source = SourceFactory(database=f"{output_dir}/test.sqlite")
        create_file_database(url=source.url(), output_dir=output_dir)
        defaults = DefaultsFactory(draft_mode_enabled=False)
        project = ProjectFactory(sources=[source], defaults=defaults)
        client = _make_client(project, output_dir)

        res = client.get("/api/project/draft_mode/")

        assert res.status_code == 200
        body = res.get_json()
        assert body == {"enabled": False}
