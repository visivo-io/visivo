import pytest
from unittest.mock import Mock, MagicMock
from flask import Flask

from visivo.server.views.model_views import register_model_views
from visivo.server.managers.object_manager import ObjectStatus


class TestModelViews:
    """Test suite for model API endpoints."""

    @pytest.fixture
    def app(self):
        """Create a test Flask app with model views."""
        app = Flask(__name__)
        app.config["TESTING"] = True

        # Create mock flask_app with model_manager
        flask_app = Mock()
        flask_app.model_manager = Mock()

        register_model_views(app, flask_app, "/tmp/output")

        # Store flask_app on the app for access in tests
        app.flask_app = flask_app

        return app

    @pytest.fixture
    def client(self, app):
        """Create a test client."""
        return app.test_client()

    def test_list_all_models_success(self, client, app):
        """Test listing all models returns models with status."""
        app.flask_app.model_manager.get_all_models_with_status.return_value = [
            {"name": "model1", "status": "published", "config": {"sql": "SELECT 1"}},
            {"name": "model2", "status": "new", "config": {"sql": "SELECT 2"}},
        ]

        response = client.get("/api/models/")

        assert response.status_code == 200
        data = response.get_json()
        assert "models" in data
        assert len(data["models"]) == 2
        assert data["models"][0]["name"] == "model1"

    def test_list_all_models_empty(self, client, app):
        """Test listing models when none exist."""
        app.flask_app.model_manager.get_all_models_with_status.return_value = []

        response = client.get("/api/models/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["models"] == []

    def test_get_model_success(self, client, app):
        """Test getting a specific model."""
        app.flask_app.model_manager.get_model_with_status.return_value = {
            "name": "test_model",
            "status": "published",
            "child_item_names": ["my_source"],
            "config": {"sql": "SELECT * FROM test"},
        }

        response = client.get("/api/models/test_model/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["name"] == "test_model"
        assert data["status"] == "published"
        assert "my_source" in data["child_item_names"]

    def test_get_model_not_found(self, client, app):
        """Test getting a model that doesn't exist."""
        app.flask_app.model_manager.get_model_with_status.return_value = None

        response = client.get("/api/models/nonexistent/")

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data

    def test_save_model_success(self, client, app):
        """Test saving a model configuration."""
        mock_model = Mock()
        mock_model.name = "new_model"
        app.flask_app.model_manager.save_from_config.return_value = mock_model
        app.flask_app.model_manager.get_status.return_value = ObjectStatus.NEW

        response = client.post(
            "/api/models/new_model/save/",
            json={"sql": "SELECT * FROM test"},
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["model"] == "new_model"
        assert data["status"] == "new"

    def test_save_model_no_config(self, client, app):
        """Test saving a model without configuration."""
        response = client.post("/api/models/test/save/", content_type="application/json")

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    def test_delete_model_success(self, client, app):
        """Test marking a model for deletion."""
        app.flask_app.model_manager.mark_for_deletion.return_value = True

        response = client.delete("/api/models/test_model/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["status"] == "deleted"

    def test_delete_model_not_found(self, client, app):
        """Test deleting a model that doesn't exist."""
        app.flask_app.model_manager.mark_for_deletion.return_value = False

        response = client.delete("/api/models/nonexistent/")

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data

    def test_validate_model_valid(self, client, app):
        """Test validating a valid model configuration."""
        app.flask_app.model_manager.validate_config.return_value = {
            "valid": True,
            "name": "test_model",
        }

        response = client.post(
            "/api/models/test_model/validate/",
            json={"sql": "SELECT * FROM test"},
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["valid"] is True

    def test_validate_model_invalid(self, client, app):
        """Test validating an invalid model configuration."""
        app.flask_app.model_manager.validate_config.return_value = {
            "valid": False,
            "error": "Invalid configuration",
        }

        response = client.post(
            "/api/models/test_model/validate/",
            json={"invalid": "config"},
            content_type="application/json",
        )

        assert response.status_code == 400
        data = response.get_json()
        assert data["valid"] is False

    def test_validate_model_no_config(self, client, app):
        """Test validating without configuration."""
        response = client.post("/api/models/test_model/validate/", content_type="application/json")

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data
