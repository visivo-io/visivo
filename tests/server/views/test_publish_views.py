import pytest
from unittest.mock import Mock, patch
from flask import Flask

from visivo.server.views.publish_views import register_publish_views
from visivo.server.managers.object_manager import ObjectStatus


class TestPublishViews:
    """Test suite for publish API endpoints."""

    @pytest.fixture
    def app(self):
        """Create a test Flask app with publish views."""
        app = Flask(__name__)
        app.config["TESTING"] = True

        # Create mock flask_app with all managers
        flask_app = Mock()
        flask_app.source_manager = Mock()
        flask_app.model_manager = Mock()
        flask_app.dimension_manager = Mock()
        flask_app.metric_manager = Mock()
        flask_app.relation_manager = Mock()
        flask_app.project = Mock()
        flask_app.project.project_file_path = "/tmp/project.yaml"
        flask_app.hot_reload_server = None

        # Default to no unpublished changes and empty cached_objects for new managers
        flask_app.dimension_manager.has_unpublished_changes.return_value = False
        flask_app.dimension_manager.cached_objects = {}
        flask_app.metric_manager.has_unpublished_changes.return_value = False
        flask_app.metric_manager.cached_objects = {}
        flask_app.relation_manager.has_unpublished_changes.return_value = False
        flask_app.relation_manager.cached_objects = {}

        register_publish_views(app, flask_app, "/tmp/output")

        # Store flask_app on the app for access in tests
        app.flask_app = flask_app

        return app

    @pytest.fixture
    def client(self, app):
        """Create a test client."""
        return app.test_client()

    def test_publish_status_has_changes(self, client, app):
        """Test publish status when there are unpublished changes."""
        app.flask_app.source_manager.has_unpublished_changes.return_value = True
        app.flask_app.model_manager.has_unpublished_changes.return_value = False

        response = client.get("/api/publish/status/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["has_unpublished_changes"] is True

    def test_publish_status_no_changes(self, client, app):
        """Test publish status when there are no unpublished changes."""
        app.flask_app.source_manager.has_unpublished_changes.return_value = False
        app.flask_app.model_manager.has_unpublished_changes.return_value = False

        response = client.get("/api/publish/status/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["has_unpublished_changes"] is False

    def test_publish_status_model_changes(self, client, app):
        """Test publish status when only models have changes."""
        app.flask_app.source_manager.has_unpublished_changes.return_value = False
        app.flask_app.model_manager.has_unpublished_changes.return_value = True

        response = client.get("/api/publish/status/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["has_unpublished_changes"] is True

    def test_pending_changes_empty(self, client, app):
        """Test pending changes when none exist."""
        app.flask_app.source_manager.cached_objects = {}
        app.flask_app.model_manager.cached_objects = {}

        response = client.get("/api/publish/pending/")

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

        response = client.get("/api/publish/pending/")

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

        response = client.get("/api/publish/pending/")

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

        response = client.get("/api/publish/pending/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["pending"] == []
        assert data["count"] == 0

    def test_pending_changes_deleted_source(self, client, app):
        """Test pending changes with deleted source (None value)."""
        app.flask_app.source_manager.cached_objects = {"deleted_source": None}
        app.flask_app.source_manager.get_status.return_value = ObjectStatus.DELETED
        app.flask_app.model_manager.cached_objects = {}

        response = client.get("/api/publish/pending/")

        assert response.status_code == 200
        data = response.get_json()
        assert len(data["pending"]) == 1
        assert data["pending"][0]["name"] == "deleted_source"
        assert data["pending"][0]["status"] == "deleted"

    @patch("visivo.server.views.publish_views.ProjectWriter")
    def test_publish_no_changes(self, mock_writer_class, client, app):
        """Test publishing when there are no changes."""
        app.flask_app.source_manager.cached_objects = {}
        app.flask_app.source_manager.get_status.return_value = ObjectStatus.PUBLISHED
        app.flask_app.model_manager.cached_objects = {}
        app.flask_app.model_manager.get_status.return_value = ObjectStatus.PUBLISHED

        response = client.post("/api/publish/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["published_count"] == 0
        assert "No changes to publish" in data["message"]

    @patch("visivo.server.views.publish_views.ProjectWriter")
    def test_publish_success(self, mock_writer_class, client, app):
        """Test successful publish with changes."""
        mock_source = Mock()
        mock_source.model_dump.return_value = {"name": "new_source", "type": "sqlite"}

        app.flask_app.source_manager.cached_objects = {"new_source": mock_source}
        app.flask_app.source_manager.published_objects = {}
        app.flask_app.source_manager.get_status.return_value = ObjectStatus.NEW
        app.flask_app.model_manager.cached_objects = {}
        app.flask_app.model_manager.get_status.return_value = ObjectStatus.PUBLISHED

        mock_writer = Mock()
        mock_writer_class.return_value = mock_writer

        response = client.post("/api/publish/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["published_count"] == 1
        assert "successfully" in data["message"]

        # Verify caches were cleared
        app.flask_app.source_manager.clear_cache.assert_called_once()
        app.flask_app.model_manager.clear_cache.assert_called_once()
