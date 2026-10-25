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
            "/api/sources/new_source/",
            json={"type": "sqlite", "database": "test.db"},
            content_type="application/json",
        )

        assert response.status_code == 201
        data = response.get_json()
        assert data["source"] == "new_source"
        assert data["status"] == "new"

    def test_save_source_no_config(self, client, app):
        """Test saving a source without configuration."""
        response = client.post("/api/sources/test/", content_type="application/json")

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


class TestSourcesViewsErrors:
    """Each route answers an error status with the error text instead of raising."""

    @pytest.fixture
    def app(self):
        app = Flask(__name__)
        app.config["TESTING"] = True
        flask_app = Mock()
        flask_app.source_manager = Mock()
        register_source_views(app, flask_app, "/tmp/output")
        app.flask_app = flask_app
        return app

    @pytest.fixture
    def client(self, app):
        return app.test_client()

    def test_a_connection_test_that_cannot_start_is_a_500(self, client, mocker):
        mocker.patch(
            "visivo.server.views.sources_views.SourceOpJobManager.instance",
            side_effect=RuntimeError("no workers"),
        )

        response = client.post("/api/source-connections/", json={"name": "s"})

        assert response.status_code == 500
        assert response.get_json() == {"status": "connection_failed", "error": "no workers"}

    def test_polling_an_unknown_connection_job_is_a_404(self, client):
        response = client.get("/api/source-connections/no-such-job/")

        assert response.status_code == 404
        assert response.get_json() == {"error": "Job no-such-job not found"}

    def test_the_connection_test_uses_the_project_folder(self, client, app, tmp_path):
        import time

        app.flask_app.source_manager.project_dir = str(tmp_path)
        start = client.post(
            "/api/source-connections/",
            json={"name": "s", "type": "sqlite", "database": "missing.db"},
        )
        job_id = start.get_json()["job_id"]
        deadline = time.time() + 5
        while time.time() < deadline:
            job = client.get(f"/api/source-connections/{job_id}/").get_json()
            if job["status"] in ("completed", "failed", "cancelled"):
                break
            time.sleep(0.01)

        assert job["result"]["error"] == f"File not found: {tmp_path / 'missing.db'}"
        assert not (tmp_path / "missing.db").exists()

    @pytest.mark.parametrize(
        "method,path,manager_method",
        [
            ("get", "/api/sources/", "get_all_sources_with_status"),
            ("get", "/api/sources/s/", "get_source_with_status"),
            ("delete", "/api/sources/s/", "mark_for_deletion"),
        ],
    )
    def test_a_manager_failure_is_a_500(self, client, app, method, path, manager_method):
        getattr(app.flask_app.source_manager, manager_method).side_effect = RuntimeError("boom")

        response = getattr(client, method)(path)

        assert response.status_code == 500
        assert response.get_json() == {"error": "boom"}

    def test_a_failed_save_is_a_500(self, client, app):
        app.flask_app.source_manager.save_from_config.side_effect = RuntimeError("disk full")

        response = client.post("/api/sources/s/", json={"type": "sqlite", "database": "x.db"})

        assert response.status_code == 500
        assert response.get_json() == {"error": "disk full"}

    def test_an_invalid_config_on_save_is_a_400_naming_the_field(self, client, app):
        from pydantic import TypeAdapter, ValidationError

        from visivo.models.sources.fields import SourceField

        try:
            TypeAdapter(SourceField).validate_python({"name": "s", "type": "sqlite"})
        except ValidationError as error:
            app.flask_app.source_manager.save_from_config.side_effect = error

        response = client.post("/api/sources/s/", json={"type": "sqlite"})

        assert response.status_code == 400
        assert "database" in response.get_json()["error"]

    def test_a_failed_validation_call_is_a_500(self, client, app):
        app.flask_app.source_manager.validate_config.side_effect = RuntimeError("bad state")

        response = client.post("/api/sources/s/validate/", json={"type": "sqlite"})

        assert response.status_code == 500
        assert response.get_json() == {"error": "bad state"}
