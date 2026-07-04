import pytest
from unittest.mock import Mock, patch
from flask import Flask

from visivo.server.views.commit_views import register_commit_views
from visivo.server.managers.object_manager import ObjectStatus


class TestCommitViews:
    """Test suite for commit API endpoints."""

    @pytest.fixture
    def app(self):
        """Create a test Flask app with commit views."""
        app = Flask(__name__)
        app.config["TESTING"] = True

        # Create mock flask_app with all managers
        flask_app = Mock()
        flask_app.source_manager = Mock()
        flask_app.model_manager = Mock()
        flask_app.dimension_manager = Mock()
        flask_app.metric_manager = Mock()
        flask_app.relation_manager = Mock()
        flask_app.insight_manager = Mock()
        flask_app.markdown_manager = Mock()
        flask_app.chart_manager = Mock()
        flask_app.table_manager = Mock()
        flask_app.project = Mock()
        flask_app.project.project_file_path = "/tmp/project.yaml"
        flask_app.hot_reload_server = None

        # Default to no unpublished changes and empty cached_objects for all managers
        flask_app.source_manager.has_unpublished_changes.return_value = False
        flask_app.source_manager.cached_objects = {}
        flask_app.model_manager.has_unpublished_changes.return_value = False
        flask_app.model_manager.cached_objects = {}
        flask_app.dimension_manager.has_unpublished_changes.return_value = False
        flask_app.dimension_manager.cached_objects = {}
        flask_app.metric_manager.has_unpublished_changes.return_value = False
        flask_app.metric_manager.cached_objects = {}
        flask_app.relation_manager.has_unpublished_changes.return_value = False
        flask_app.relation_manager.cached_objects = {}
        flask_app.insight_manager.has_unpublished_changes.return_value = False
        flask_app.insight_manager.cached_objects = {}
        flask_app.markdown_manager.has_unpublished_changes.return_value = False
        flask_app.markdown_manager.cached_objects = {}
        flask_app.chart_manager.has_unpublished_changes.return_value = False
        flask_app.chart_manager.cached_objects = {}
        flask_app.table_manager.has_unpublished_changes.return_value = False
        flask_app.table_manager.cached_objects = {}
        flask_app.dashboard_manager.has_unpublished_changes.return_value = False
        flask_app.dashboard_manager.cached_objects = {}
        flask_app.csv_script_model_manager.has_unpublished_changes.return_value = False
        flask_app.csv_script_model_manager.cached_objects = {}
        flask_app.local_merge_model_manager.has_unpublished_changes.return_value = False
        flask_app.local_merge_model_manager.cached_objects = {}
        flask_app.input_manager.has_unpublished_changes.return_value = False
        flask_app.input_manager.cached_objects = {}
        flask_app._cached_defaults = None

        register_commit_views(app, flask_app, "/tmp/output")

        # Store flask_app on the app for access in tests
        app.flask_app = flask_app

        return app

    @pytest.fixture
    def client(self, app):
        """Create a test client."""
        return app.test_client()

    def test_commit_status_has_changes(self, client, app):
        """Test commit status when there are uncommitted changes."""
        app.flask_app.source_manager.has_unpublished_changes.return_value = True
        app.flask_app.model_manager.has_unpublished_changes.return_value = False

        response = client.get("/api/commit/status/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["has_unpublished_changes"] is True

    def test_commit_status_no_changes(self, client, app):
        """Test commit status when there are no uncommitted changes."""
        app.flask_app.source_manager.has_unpublished_changes.return_value = False
        app.flask_app.model_manager.has_unpublished_changes.return_value = False

        response = client.get("/api/commit/status/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["has_unpublished_changes"] is False

    def test_commit_status_model_changes(self, client, app):
        """Test commit status when only models have changes."""
        app.flask_app.source_manager.has_unpublished_changes.return_value = False
        app.flask_app.model_manager.has_unpublished_changes.return_value = True

        response = client.get("/api/commit/status/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["has_unpublished_changes"] is True

    def test_pending_changes_empty(self, client, app):
        """Test pending changes when none exist."""
        app.flask_app.source_manager.cached_objects = {}
        app.flask_app.model_manager.cached_objects = {}

        response = client.get("/api/commit/pending/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["pending"] == []
        assert data["count"] == 0

    def test_pending_changes_with_sources(self, client, app):
        """Test pending changes with source modifications."""
        mock_source = Mock()
        mock_source.type = "sqlite"

        app.flask_app.source_manager.cached_objects = {"test_source": mock_source}
        app.flask_app.source_manager.get_status.return_value = ObjectStatus.NEW
        app.flask_app.model_manager.cached_objects = {}

        response = client.get("/api/commit/pending/")

        assert response.status_code == 200
        data = response.get_json()
        assert len(data["pending"]) == 1
        assert data["count"] == 1
        assert data["pending"][0]["name"] == "test_source"
        assert data["pending"][0]["type"] == "source"
        assert data["pending"][0]["status"] == "new"

    def test_pending_changes_with_models(self, client, app):
        """Test pending changes with model modifications."""
        mock_model = Mock()

        app.flask_app.source_manager.cached_objects = {}
        app.flask_app.model_manager.cached_objects = {"test_model": mock_model}
        app.flask_app.model_manager.get_status.return_value = ObjectStatus.MODIFIED

        response = client.get("/api/commit/pending/")

        assert response.status_code == 200
        data = response.get_json()
        assert len(data["pending"]) == 1
        assert data["count"] == 1
        assert data["pending"][0]["name"] == "test_model"
        assert data["pending"][0]["type"] == "model"
        assert data["pending"][0]["status"] == "modified"

    def test_pending_changes_excludes_published(self, client, app):
        """Test that published objects are not included in pending changes."""
        mock_source = Mock()
        mock_source.type = "sqlite"

        app.flask_app.source_manager.cached_objects = {"published_source": mock_source}
        app.flask_app.source_manager.get_status.return_value = ObjectStatus.PUBLISHED
        app.flask_app.model_manager.cached_objects = {}

        response = client.get("/api/commit/pending/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["pending"] == []
        assert data["count"] == 0

    def test_pending_changes_deleted_source(self, client, app):
        """Test pending changes with deleted source (None value)."""
        app.flask_app.source_manager.cached_objects = {"deleted_source": None}
        app.flask_app.source_manager.get_status.return_value = ObjectStatus.DELETED
        app.flask_app.model_manager.cached_objects = {}

        response = client.get("/api/commit/pending/")

        assert response.status_code == 200
        data = response.get_json()
        assert len(data["pending"]) == 1
        assert data["pending"][0]["name"] == "deleted_source"
        assert data["pending"][0]["status"] == "deleted"

    @patch("visivo.server.views.commit_views.ProjectWriter")
    def test_commit_no_changes(self, mock_writer_class, client, app):
        """Test committing when there are no changes."""
        app.flask_app.source_manager.cached_objects = {}
        app.flask_app.source_manager.get_status.return_value = ObjectStatus.PUBLISHED
        app.flask_app.model_manager.cached_objects = {}
        app.flask_app.model_manager.get_status.return_value = ObjectStatus.PUBLISHED

        response = client.post("/api/commit/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["published_count"] == 0
        assert "No changes to commit" in data["message"]

    @patch("visivo.server.views.commit_views.ProjectWriter")
    def test_commit_success(self, mock_writer_class, client, app):
        """Test successful commit with changes."""
        mock_source = Mock()
        mock_source.model_dump.return_value = {"name": "new_source", "type": "sqlite"}

        app.flask_app.source_manager.cached_objects = {"new_source": mock_source}
        app.flask_app.source_manager.published_objects = {}
        app.flask_app.source_manager.get_status.return_value = ObjectStatus.NEW
        app.flask_app.model_manager.cached_objects = {}
        app.flask_app.model_manager.get_status.return_value = ObjectStatus.PUBLISHED

        mock_writer = Mock()
        mock_writer_class.return_value = mock_writer

        response = client.post("/api/commit/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["published_count"] == 1
        assert "successfully" in data["message"]

        # Verify caches were cleared
        app.flask_app.source_manager.clear_cache.assert_called_once()
        app.flask_app.model_manager.clear_cache.assert_called_once()

    @patch("visivo.server.views.commit_views.ProjectWriter")
    def test_commit_pauses_watcher_around_write_and_refresh(self, mock_writer_class, client, app):
        """The YAML write + synchronous project refresh must be serialized
        with the file watcher — a concurrent watcher recompile races the git
        include cache and leaves the served project stale (VIS-806)."""
        mock_source = Mock()
        mock_source.model_dump.return_value = {"name": "new_source", "type": "sqlite"}
        app.flask_app.source_manager.cached_objects = {"new_source": mock_source}
        app.flask_app.source_manager.published_objects = {}
        app.flask_app.source_manager.get_status.return_value = ObjectStatus.NEW
        app.flask_app.model_manager.cached_objects = {}
        app.flask_app.model_manager.get_status.return_value = ObjectStatus.PUBLISHED
        mock_writer_class.return_value = Mock()

        hot_reload = Mock()
        app.flask_app.hot_reload_server = hot_reload

        response = client.post("/api/commit/")

        assert response.status_code == 200
        ordered = [
            c[0]
            for c in hot_reload.method_calls
            if c[0] in ("pause_file_watcher", "on_project_change", "resume_file_watcher")
        ]
        assert ordered == ["pause_file_watcher", "on_project_change", "resume_file_watcher"]

    @patch("visivo.server.views.commit_views.ProjectWriter")
    def test_commit_resumes_watcher_when_refresh_throws(self, mock_writer_class, client, app):
        """resume_file_watcher must run even when the refresh fails — a stuck
        pause would silently disable hot reload for the rest of the session."""
        mock_source = Mock()
        mock_source.model_dump.return_value = {"name": "new_source", "type": "sqlite"}
        app.flask_app.source_manager.cached_objects = {"new_source": mock_source}
        app.flask_app.source_manager.published_objects = {}
        app.flask_app.source_manager.get_status.return_value = ObjectStatus.NEW
        app.flask_app.model_manager.cached_objects = {}
        app.flask_app.model_manager.get_status.return_value = ObjectStatus.PUBLISHED
        mock_writer_class.return_value = Mock()

        hot_reload = Mock()
        hot_reload.on_project_change.side_effect = RuntimeError("compile blew up")
        app.flask_app.hot_reload_server = hot_reload

        response = client.post("/api/commit/")

        assert response.status_code == 500
        hot_reload.resume_file_watcher.assert_called_once()

    @patch("visivo.server.views.commit_views.ProjectWriter")
    def test_commit_resyncs_served_state_when_write_fails(self, mock_writer_class, client, app):
        """A ProjectWriter.write() that fails mid-loop leaves partial YAML on
        disk. The watcher is paused and paused events are DROPPED (not queued),
        so served state would silently diverge from disk. The endpoint must
        trigger the recompile path (on_project_change) before returning 500 so
        served state resyncs to whatever landed (finding #5). Before the fix, no
        resync happened on the write-failure path."""
        mock_source = Mock()
        mock_source.model_dump.return_value = {"name": "new_source", "type": "sqlite"}
        app.flask_app.source_manager.cached_objects = {"new_source": mock_source}
        app.flask_app.source_manager.published_objects = {}
        app.flask_app.source_manager.get_status.return_value = ObjectStatus.NEW
        app.flask_app.model_manager.cached_objects = {}
        app.flask_app.model_manager.get_status.return_value = ObjectStatus.PUBLISHED

        writer = Mock()
        writer.write.side_effect = RuntimeError("disk full mid-write")
        mock_writer_class.return_value = writer

        hot_reload = Mock()
        app.flask_app.hot_reload_server = hot_reload

        response = client.post("/api/commit/")

        assert response.status_code == 500
        # Served state resynced from disk despite the failure...
        hot_reload.on_project_change.assert_called_once_with(one_shot=False)
        # ...the watcher is un-paused...
        hot_reload.resume_file_watcher.assert_called_once()
        # ...and the failed write did not clear the draft caches.
        app.flask_app.source_manager.clear_cache.assert_not_called()

    def test_discard_no_changes(self, client, app):
        """Discard with an empty draft cache reports zero discards."""
        response = client.post("/api/commit/discard/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["discarded_count"] == 0
        assert "discarded" in data["message"].lower()
        app.flask_app.source_manager.clear_cache.assert_called_once()

    def test_discard_with_changes(self, client, app):
        """Discard counts every unpublished draft and clears all caches."""
        mock_source = Mock()
        mock_source.type = "sqlite"
        app.flask_app.source_manager.cached_objects = {"new_source": mock_source}
        app.flask_app.source_manager.get_status.return_value = ObjectStatus.NEW
        app.flask_app.model_manager.cached_objects = {"edited_model": Mock()}
        app.flask_app.model_manager.get_status.return_value = ObjectStatus.MODIFIED
        app.flask_app._cached_defaults = Mock()

        response = client.post("/api/commit/discard/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["discarded_count"] == 3
        app.flask_app.source_manager.clear_cache.assert_called_once()
        app.flask_app.model_manager.clear_cache.assert_called_once()
        app.flask_app.dashboard_manager.clear_cache.assert_called_once()
        assert app.flask_app._cached_defaults is None

    def test_discard_excludes_published(self, client, app):
        """Cached objects already in the published state don't inflate the count."""
        app.flask_app.source_manager.cached_objects = {"published_source": Mock()}
        app.flask_app.source_manager.get_status.return_value = ObjectStatus.PUBLISHED

        response = client.post("/api/commit/discard/")

        assert response.status_code == 200
        assert response.get_json()["discarded_count"] == 0
        app.flask_app.source_manager.clear_cache.assert_called_once()

    def test_discard_counts_deletions(self, client, app):
        """A draft deletion (None entry) counts as a discarded change."""
        app.flask_app.dashboard_manager.cached_objects = {"doomed_dashboard": None}
        app.flask_app.dashboard_manager.get_status.return_value = ObjectStatus.DELETED

        response = client.post("/api/commit/discard/")

        assert response.status_code == 200
        assert response.get_json()["discarded_count"] == 1
        app.flask_app.dashboard_manager.clear_cache.assert_called_once()
