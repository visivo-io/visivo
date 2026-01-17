import pytest
from unittest.mock import Mock
from flask import Flask

from visivo.server.views.input_views import register_input_views
from visivo.server.managers.object_manager import ObjectStatus


class TestInputViews:
    """Test suite for input API endpoints."""

    @pytest.fixture
    def app(self):
        """Create a test Flask app with input views."""
        app = Flask(__name__)
        app.config["TESTING"] = True

        # Create mock flask_app with input_manager
        flask_app = Mock()
        flask_app.input_manager = Mock()

        register_input_views(app, flask_app, "/tmp/output")

        # Store flask_app on the app for access in tests
        app.flask_app = flask_app

        return app

    @pytest.fixture
    def client(self, app):
        """Create a test client."""
        return app.test_client()

    def test_list_all_inputs_success(self, client, app):
        """Test listing all inputs returns inputs with status."""
        app.flask_app.input_manager.get_all_inputs_with_status.return_value = [
            {
                "name": "input1",
                "status": "published",
                "config": {"type": "single-select", "options": ["A", "B"]},
            },
            {
                "name": "input2",
                "status": "new",
                "config": {"type": "multi-select", "options": ["X", "Y"]},
            },
        ]

        response = client.get("/api/inputs/")

        assert response.status_code == 200
        data = response.get_json()
        assert "inputs" in data
        assert len(data["inputs"]) == 2
        assert data["inputs"][0]["name"] == "input1"

    def test_list_all_inputs_empty(self, client, app):
        """Test listing inputs when none exist."""
        app.flask_app.input_manager.get_all_inputs_with_status.return_value = []

        response = client.get("/api/inputs/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["inputs"] == []

    def test_list_all_inputs_error(self, client, app):
        """Test listing inputs handles errors gracefully."""
        app.flask_app.input_manager.get_all_inputs_with_status.side_effect = Exception(
            "Database error"
        )

        response = client.get("/api/inputs/")

        assert response.status_code == 500
        data = response.get_json()
        assert "error" in data

    def test_get_input_success(self, client, app):
        """Test getting a specific input."""
        app.flask_app.input_manager.get_input_with_status.return_value = {
            "name": "test_input",
            "status": "published",
            "child_item_names": [],
            "config": {"type": "single-select", "options": ["A", "B", "C"]},
        }

        response = client.get("/api/inputs/test_input/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["name"] == "test_input"
        assert data["status"] == "published"

    def test_get_input_not_found(self, client, app):
        """Test getting an input that doesn't exist."""
        app.flask_app.input_manager.get_input_with_status.return_value = None

        response = client.get("/api/inputs/nonexistent/")

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data

    def test_get_input_error(self, client, app):
        """Test getting an input handles errors gracefully."""
        app.flask_app.input_manager.get_input_with_status.side_effect = Exception("Database error")

        response = client.get("/api/inputs/test_input/")

        assert response.status_code == 500
        data = response.get_json()
        assert "error" in data

    def test_save_input_single_select_success(self, client, app):
        """Test saving a single-select input configuration."""
        mock_input = Mock()
        mock_input.name = "new_input"
        mock_input.type = "single-select"
        app.flask_app.input_manager.save_from_config.return_value = mock_input
        app.flask_app.input_manager.get_status.return_value = ObjectStatus.NEW

        response = client.post(
            "/api/inputs/new_input/save/",
            json={"type": "single-select", "options": ["A", "B"]},
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["input"] == "new_input"
        assert data["type"] == "single-select"
        assert data["status"] == "new"

    def test_save_input_multi_select_success(self, client, app):
        """Test saving a multi-select input configuration."""
        mock_input = Mock()
        mock_input.name = "multi_input"
        mock_input.type = "multi-select"
        app.flask_app.input_manager.save_from_config.return_value = mock_input
        app.flask_app.input_manager.get_status.return_value = ObjectStatus.NEW

        response = client.post(
            "/api/inputs/multi_input/save/",
            json={"type": "multi-select", "options": ["X", "Y", "Z"]},
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["input"] == "multi_input"
        assert data["type"] == "multi-select"

    def test_save_input_no_config(self, client, app):
        """Test saving an input without configuration."""
        response = client.post("/api/inputs/test/save/", content_type="application/json")

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    def test_save_input_validation_error(self, client, app):
        """Test saving an input with invalid configuration."""
        from pydantic import BaseModel, ValidationError

        # Create a real ValidationError by trying to validate invalid data
        class TestModel(BaseModel):
            type: str

        try:
            TestModel(type=123)  # This will raise ValidationError
        except ValidationError as e:
            real_error = e

        app.flask_app.input_manager.save_from_config.side_effect = real_error

        response = client.post(
            "/api/inputs/bad_input/save/",
            json={"type": "invalid-type"},
            content_type="application/json",
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    def test_save_input_error(self, client, app):
        """Test saving an input handles errors gracefully."""
        app.flask_app.input_manager.save_from_config.side_effect = Exception("Save error")

        response = client.post(
            "/api/inputs/test/save/",
            json={"type": "single-select", "options": ["A"]},
            content_type="application/json",
        )

        assert response.status_code == 500
        data = response.get_json()
        assert "error" in data

    def test_delete_input_success(self, client, app):
        """Test marking an input for deletion."""
        app.flask_app.input_manager.mark_for_deletion.return_value = True

        response = client.delete("/api/inputs/test_input/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["status"] == "deleted"
        assert "marked for deletion" in data["message"]

    def test_delete_input_not_found(self, client, app):
        """Test deleting an input that doesn't exist."""
        app.flask_app.input_manager.mark_for_deletion.return_value = False

        response = client.delete("/api/inputs/nonexistent/")

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data

    def test_delete_input_error(self, client, app):
        """Test deleting an input handles errors gracefully."""
        app.flask_app.input_manager.mark_for_deletion.side_effect = Exception("Delete error")

        response = client.delete("/api/inputs/test_input/")

        assert response.status_code == 500
        data = response.get_json()
        assert "error" in data

    def test_validate_input_valid(self, client, app):
        """Test validating a valid input configuration."""
        app.flask_app.input_manager.validate_config.return_value = {
            "valid": True,
            "name": "test_input",
            "type": "single-select",
        }

        response = client.post(
            "/api/inputs/test_input/validate/",
            json={"type": "single-select", "options": ["A", "B"]},
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["valid"] is True

    def test_validate_input_invalid(self, client, app):
        """Test validating an invalid input configuration."""
        app.flask_app.input_manager.validate_config.return_value = {
            "valid": False,
            "error": "Invalid configuration",
        }

        response = client.post(
            "/api/inputs/test_input/validate/",
            json={"type": "invalid", "options": []},
            content_type="application/json",
        )

        assert response.status_code == 400
        data = response.get_json()
        assert data["valid"] is False

    def test_validate_input_no_config(self, client, app):
        """Test validating without configuration."""
        response = client.post("/api/inputs/test_input/validate/", content_type="application/json")

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    def test_validate_input_error(self, client, app):
        """Test validating an input handles errors gracefully."""
        app.flask_app.input_manager.validate_config.side_effect = Exception("Validation error")

        response = client.post(
            "/api/inputs/test/validate/",
            json={"type": "single-select", "options": ["A"]},
            content_type="application/json",
        )

        assert response.status_code == 500
        data = response.get_json()
        assert "error" in data

    def test_save_input_ensures_name_matches_url(self, client, app):
        """Test that save endpoint ensures name matches URL parameter."""
        mock_input = Mock()
        mock_input.name = "url_name"
        mock_input.type = "single-select"
        app.flask_app.input_manager.save_from_config.return_value = mock_input
        app.flask_app.input_manager.get_status.return_value = ObjectStatus.NEW

        # Send a config with a different name - should be overwritten by URL param
        response = client.post(
            "/api/inputs/url_name/save/",
            json={"name": "different_name", "type": "single-select", "options": ["A"]},
            content_type="application/json",
        )

        assert response.status_code == 200
        # Verify the call was made with name matching URL
        call_args = app.flask_app.input_manager.save_from_config.call_args
        assert call_args[0][0]["name"] == "url_name"

    def test_validate_input_ensures_name_matches_url(self, client, app):
        """Test that validate endpoint ensures name matches URL parameter."""
        app.flask_app.input_manager.validate_config.return_value = {
            "valid": True,
            "name": "url_name",
            "type": "single-select",
        }

        # Send a config with a different name - should be overwritten by URL param
        response = client.post(
            "/api/inputs/url_name/validate/",
            json={"name": "different_name", "type": "single-select", "options": ["A"]},
            content_type="application/json",
        )

        assert response.status_code == 200
        # Verify the call was made with name matching URL
        call_args = app.flask_app.input_manager.validate_config.call_args
        assert call_args[0][0]["name"] == "url_name"
