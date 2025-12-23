import pytest
from unittest.mock import Mock
from flask import Flask

from visivo.server.views.sources_views import register_source_views
from visivo.server.managers.object_manager import ObjectStatus


class TestSourcesViews:
    """Test suite for source API endpoints."""

    @pytest.fixture
    def app(self):
        """Create a test Flask app with source views."""
        app = Flask(__name__)
        app.config["TESTING"] = True

        # Create mock flask_app with source_manager
        flask_app = Mock()
        flask_app.source_manager = Mock()

        register_source_views(app, flask_app, "/tmp/output")

        # Store flask_app on the app for access in tests
        app.flask_app = flask_app

        return app

    @pytest.fixture
    def client(self, app):
        """Create a test client."""
        return app.test_client()

    def test_list_all_sources_success(self, client, app):
        """Test listing all sources returns sources with status."""
        app.flask_app.source_manager.get_all_sources_with_status.return_value = [
            {"name": "source1", "status": "published", "config": {"type": "sqlite"}},
            {"name": "source2", "status": "new", "config": {"type": "postgresql"}},
        ]

        response = client.get("/api/sources/")

        assert response.status_code == 200
        data = response.get_json()
        assert "sources" in data
        assert len(data["sources"]) == 2
        assert data["sources"][0]["name"] == "source1"

    def test_list_all_sources_empty(self, client, app):
        """Test listing sources when none exist."""
        app.flask_app.source_manager.get_all_sources_with_status.return_value = []

        response = client.get("/api/sources/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["sources"] == []

    def test_get_source_success(self, client, app):
        """Test getting a specific source."""
        app.flask_app.source_manager.get_source_with_status.return_value = {
            "name": "test_source",
            "status": "published",
            "child_item_names": [],
            "config": {"type": "sqlite", "database": "test.db"},
        }

        response = client.get("/api/sources/test_source/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["name"] == "test_source"
        assert data["status"] == "published"
        assert data["config"]["type"] == "sqlite"

    def test_get_source_not_found(self, client, app):
        """Test getting a source that doesn't exist."""
        app.flask_app.source_manager.get_source_with_status.return_value = None

        response = client.get("/api/sources/nonexistent/")

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data

    def test_save_source_success(self, client, app):
        """Test saving a source configuration."""
        mock_source = Mock()
        mock_source.name = "new_source"
        app.flask_app.source_manager.save_from_config.return_value = mock_source
        app.flask_app.source_manager.get_status.return_value = ObjectStatus.NEW

        response = client.post(
            "/api/sources/new_source/save/",
            json={"type": "sqlite", "database": "test.db"},
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["source"] == "new_source"
        assert data["status"] == "new"

    def test_save_source_no_config(self, client, app):
        """Test saving a source without configuration."""
        response = client.post("/api/sources/test/save/", content_type="application/json")

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    def test_delete_source_success(self, client, app):
        """Test marking a source for deletion."""
        app.flask_app.source_manager.mark_for_deletion.return_value = True

        response = client.delete("/api/sources/test_source/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["status"] == "deleted"

    def test_delete_source_not_found(self, client, app):
        """Test deleting a source that doesn't exist."""
        app.flask_app.source_manager.mark_for_deletion.return_value = False

        response = client.delete("/api/sources/nonexistent/")

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data

    def test_validate_source_valid(self, client, app):
        """Test validating a valid source configuration."""
        app.flask_app.source_manager.validate_config.return_value = {
            "valid": True,
            "name": "test_source",
        }

        response = client.post(
            "/api/sources/test_source/validate/",
            json={"type": "sqlite", "database": "test.db"},
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["valid"] is True

    def test_validate_source_invalid(self, client, app):
        """Test validating an invalid source configuration."""
        app.flask_app.source_manager.validate_config.return_value = {
            "valid": False,
            "error": "Invalid configuration",
        }

        response = client.post(
            "/api/sources/test_source/validate/",
            json={"invalid": "config"},
            content_type="application/json",
        )

        assert response.status_code == 400
        data = response.get_json()
        assert data["valid"] is False

    def test_validate_source_no_config(self, client, app):
        """Test validating without configuration."""
        response = client.post(
            "/api/sources/test_source/validate/", content_type="application/json"
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data
