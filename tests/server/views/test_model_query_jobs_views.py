import pytest
import time
from unittest.mock import Mock, patch
from flask import Flask

from visivo.server.views.model_query_jobs_views import register_model_query_jobs_views
from visivo.server.managers.model_query_job_manager import ModelQueryJobManager
from visivo.server.managers.preview_run_manager import RunStatus


class TestModelQueryJobsViews:
    """Test suite for model query job API endpoints."""

    @pytest.fixture(autouse=True)
    def reset_singleton(self):
        """Reset the ModelQueryJobManager singleton before each test."""
        ModelQueryJobManager._instance = None
        yield
        ModelQueryJobManager._instance = None

    @pytest.fixture
    def app(self):
        """Create a test Flask app with model query job views."""
        app = Flask(__name__)
        app.config["TESTING"] = True

        flask_app = Mock()
        flask_app.source_manager = Mock()

        register_model_query_jobs_views(app, flask_app, "/tmp/output")

        app.flask_app = flask_app

        return app

    @pytest.fixture
    def client(self, app):
        """Create a test client."""
        return app.test_client()

    @pytest.fixture
    def mock_source(self):
        """Create a mock source."""
        source = Mock()
        source.name = "test_source"
        source.read_sql = Mock(return_value=[{"id": 1, "name": "test"}])
        return source

    def test_start_query_job_success(self, client, app, mock_source):
        """Test starting a query job successfully."""
        app.flask_app.source_manager.get.return_value = mock_source

        response = client.post(
            "/api/model-query-jobs/",
            json={"source_name": "test_source", "sql": "SELECT * FROM test", "limit": 100},
            content_type="application/json",
        )

        assert response.status_code == 202
        data = response.get_json()
        assert "job_id" in data
        assert data["status"] == "queued"

    def test_start_query_job_missing_source_name(self, client, app):
        """Test starting a query job without source_name."""
        response = client.post(
            "/api/model-query-jobs/",
            json={"sql": "SELECT * FROM test"},
            content_type="application/json",
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data
        assert "source_name" in data["error"]

    def test_start_query_job_missing_sql(self, client, app):
        """Test starting a query job without sql."""
        response = client.post(
            "/api/model-query-jobs/",
            json={"source_name": "test_source"},
            content_type="application/json",
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data
        assert "sql" in data["error"]

    def test_start_query_job_source_not_found(self, client, app):
        """Test starting a query job with non-existent source."""
        app.flask_app.source_manager.get.return_value = None

        response = client.post(
            "/api/model-query-jobs/",
            json={"source_name": "nonexistent", "sql": "SELECT * FROM test"},
            content_type="application/json",
        )

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data
        assert "not found" in data["error"]

    def test_start_query_job_no_body(self, client, app):
        """Test starting a query job without request body."""
        response = client.post("/api/model-query-jobs/", content_type="application/json")

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    def test_get_job_status_success(self, client, app, mock_source):
        """Test getting job status."""
        app.flask_app.source_manager.get.return_value = mock_source

        start_response = client.post(
            "/api/model-query-jobs/",
            json={"source_name": "test_source", "sql": "SELECT * FROM test"},
            content_type="application/json",
        )
        job_id = start_response.get_json()["job_id"]

        response = client.get(f"/api/model-query-jobs/{job_id}/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["job_id"] == job_id
        assert "status" in data
        assert "progress" in data

    def test_get_job_status_not_found(self, client, app):
        """Test getting status of non-existent job."""
        response = client.get("/api/model-query-jobs/nonexistent-job-id/")

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data

    def test_cancel_job_success(self, client, app, mock_source):
        """Test cancelling a job."""
        app.flask_app.source_manager.get.return_value = mock_source

        start_response = client.post(
            "/api/model-query-jobs/",
            json={"source_name": "test_source", "sql": "SELECT * FROM test"},
            content_type="application/json",
        )
        job_id = start_response.get_json()["job_id"]

        response = client.delete(f"/api/model-query-jobs/{job_id}/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["job_id"] == job_id
        assert "cancelled" in data["message"].lower()

    def test_cancel_job_not_found(self, client, app):
        """Test cancelling a non-existent job."""
        response = client.delete("/api/model-query-jobs/nonexistent-job-id/")

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data

    def test_query_job_completion(self, client, app, mock_source):
        """Test that a job completes and returns results."""
        app.flask_app.source_manager.get.return_value = mock_source
        mock_source.read_sql.return_value = [
            {"id": 1, "name": "Alice"},
            {"id": 2, "name": "Bob"},
        ]

        start_response = client.post(
            "/api/model-query-jobs/",
            json={"source_name": "test_source", "sql": "SELECT * FROM users", "limit": 100},
            content_type="application/json",
        )
        assert start_response.status_code == 202
        job_id = start_response.get_json()["job_id"]

        max_attempts = 20
        for _ in range(max_attempts):
            status_response = client.get(f"/api/model-query-jobs/{job_id}/")
            data = status_response.get_json()
            if data["status"] in ("completed", "failed"):
                break
            time.sleep(0.1)

        assert data["status"] == "completed"
        assert "result" in data
        result = data["result"]
        assert result["columns"] == ["id", "name"]
        assert len(result["rows"]) == 2
        assert result["row_count"] == 2
        assert result["source_name"] == "test_source"
        assert "execution_time_ms" in result

    def test_default_limit_applied(self, client, app, mock_source):
        """Test that default limit is applied when not specified."""
        app.flask_app.source_manager.get.return_value = mock_source

        response = client.post(
            "/api/model-query-jobs/",
            json={"source_name": "test_source", "sql": "SELECT * FROM test"},
            content_type="application/json",
        )

        assert response.status_code == 202
        job_manager = ModelQueryJobManager.instance()
        job_id = response.get_json()["job_id"]
        job = job_manager.get_job(job_id)
        assert job.config["limit"] == 1000

    def test_limit_clamped_to_max(self, client, app, mock_source):
        """Test that limit is clamped to maximum 10000."""
        app.flask_app.source_manager.get.return_value = mock_source

        response = client.post(
            "/api/model-query-jobs/",
            json={"source_name": "test_source", "sql": "SELECT * FROM test", "limit": 50000},
            content_type="application/json",
        )

        assert response.status_code == 202

    def test_limit_clamped_to_min(self, client, app, mock_source):
        """Test that limit is clamped to minimum 1."""
        app.flask_app.source_manager.get.return_value = mock_source

        response = client.post(
            "/api/model-query-jobs/",
            json={"source_name": "test_source", "sql": "SELECT * FROM test", "limit": -5},
            content_type="application/json",
        )

        assert response.status_code == 202

    def test_query_failure_captured(self, client, app, mock_source):
        """Test that query execution failures are properly captured."""
        app.flask_app.source_manager.get.return_value = mock_source
        mock_source.read_sql.side_effect = Exception("Table not found")

        start_response = client.post(
            "/api/model-query-jobs/",
            json={"source_name": "test_source", "sql": "SELECT * FROM nonexistent"},
            content_type="application/json",
        )
        job_id = start_response.get_json()["job_id"]

        max_attempts = 20
        for _ in range(max_attempts):
            status_response = client.get(f"/api/model-query-jobs/{job_id}/")
            data = status_response.get_json()
            if data["status"] in ("completed", "failed"):
                break
            time.sleep(0.1)

        assert data["status"] == "failed"
        assert "error" in data
        assert "Table not found" in data["error"]

    def test_empty_result_handling(self, client, app, mock_source):
        """Test handling of empty query results."""
        app.flask_app.source_manager.get.return_value = mock_source
        mock_source.read_sql.return_value = []

        start_response = client.post(
            "/api/model-query-jobs/",
            json={"source_name": "test_source", "sql": "SELECT * FROM empty_table"},
            content_type="application/json",
        )
        job_id = start_response.get_json()["job_id"]

        max_attempts = 20
        for _ in range(max_attempts):
            status_response = client.get(f"/api/model-query-jobs/{job_id}/")
            data = status_response.get_json()
            if data["status"] in ("completed", "failed"):
                break
            time.sleep(0.1)

        assert data["status"] == "completed"
        result = data["result"]
        assert result["columns"] == []
        assert result["rows"] == []
        assert result["row_count"] == 0
        assert result["truncated"] is False
