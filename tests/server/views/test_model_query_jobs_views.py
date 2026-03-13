import pytest
import time
import tempfile
from unittest.mock import Mock, patch, MagicMock

from flask import Flask

from visivo.server.views.model_query_jobs_views import register_model_query_jobs_views
from visivo.server.managers.model_query_job_manager import ModelQueryJobManager


class TestModelQueryJobsViews:
    """Test suite for model query job API endpoints."""

    @pytest.fixture(autouse=True)
    def reset_singleton(self):
        """Reset the ModelQueryJobManager singleton before each test."""
        ModelQueryJobManager._instance = None
        yield
        ModelQueryJobManager._instance = None

    @pytest.fixture
    def temp_output_dir(self):
        """Create a temporary output directory for test files."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir

    @pytest.fixture
    def mock_source(self):
        """Create a mock source that returns test data."""
        source = Mock()
        source.name = "test_source"
        source.read_sql = Mock(return_value=[{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}])
        return source

    @pytest.fixture
    def app(self, temp_output_dir, mock_source):
        """Create a test Flask app with model query job views."""
        app = Flask(__name__)
        app.config["TESTING"] = True

        flask_app = Mock()
        flask_app.project = Mock()
        flask_app.project.models = []
        flask_app.project.path = temp_output_dir
        flask_app.project.sources = [mock_source]

        register_model_query_jobs_views(app, flask_app, temp_output_dir)

        app.flask_app = flask_app
        app.output_dir = temp_output_dir
        app.mock_source = mock_source

        return app

    @pytest.fixture
    def client(self, app):
        """Create a test client."""
        return app.test_client()

    def test_start_query_job_success(self, client, app):
        """Test starting a query job successfully."""
        response = client.post(
            "/api/model-query-jobs/",
            json={"source_name": "test_source", "sql": "SELECT * FROM test"},
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

    def test_start_query_job_no_body(self, client, app):
        """Test starting a query job without request body."""
        response = client.post("/api/model-query-jobs/", content_type="application/json")

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    def test_get_job_status_success(self, client, app):
        """Test getting job status."""
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

    def test_cancel_job_success(self, client, app):
        """Test cancelling a job."""
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

    def test_query_job_completion_with_results(self, client, app):
        """Test that a job completes and returns results when source query succeeds."""
        start_response = client.post(
            "/api/model-query-jobs/",
            json={"source_name": "test_source", "sql": "SELECT id, name FROM users"},
            content_type="application/json",
        )
        assert start_response.status_code == 202
        job_id = start_response.get_json()["job_id"]

        max_attempts = 50
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

    def test_query_failure_when_source_not_found(self, client, app):
        """Test that query fails when source is not found in project."""
        # Remove the mock source
        app.flask_app.project.sources = []

        start_response = client.post(
            "/api/model-query-jobs/",
            json={"source_name": "nonexistent_source", "sql": "SELECT * FROM test"},
            content_type="application/json",
        )
        job_id = start_response.get_json()["job_id"]

        max_attempts = 50
        for _ in range(max_attempts):
            status_response = client.get(f"/api/model-query-jobs/{job_id}/")
            data = status_response.get_json()
            if data["status"] in ("completed", "failed"):
                break
            time.sleep(0.1)

        assert data["status"] == "failed"
        assert "error" in data
        assert "not found" in data["error"].lower()

    def test_query_failure_when_source_raises(self, client, app):
        """Test that query fails gracefully when source raises an exception."""
        app.mock_source.read_sql.side_effect = Exception("Database connection error")

        start_response = client.post(
            "/api/model-query-jobs/",
            json={"source_name": "test_source", "sql": "SELECT * FROM table"},
            content_type="application/json",
        )
        job_id = start_response.get_json()["job_id"]

        max_attempts = 50
        for _ in range(max_attempts):
            status_response = client.get(f"/api/model-query-jobs/{job_id}/")
            data = status_response.get_json()
            if data["status"] in ("completed", "failed"):
                break
            time.sleep(0.1)

        assert data["status"] == "failed"
        assert "error" in data
        assert "Database connection error" in data["error"]

    def test_config_contains_source_and_sql(self, client, app):
        """Test that job config correctly stores source_name and sql."""
        response = client.post(
            "/api/model-query-jobs/",
            json={"source_name": "my_source", "sql": "SELECT 1"},
            content_type="application/json",
        )

        assert response.status_code == 202
        job_manager = ModelQueryJobManager.instance()
        job_id = response.get_json()["job_id"]
        job = job_manager.get_job(job_id)
        assert job.config["source_name"] == "my_source"
        assert job.config["sql"] == "SELECT 1"

    def test_query_with_different_source(self, client, app):
        """Test querying a different source than the default."""
        other_source = Mock()
        other_source.name = "other_source"
        other_source.read_sql = Mock(return_value=[{"value": 42}])
        app.flask_app.project.sources.append(other_source)

        start_response = client.post(
            "/api/model-query-jobs/",
            json={"source_name": "other_source", "sql": "SELECT 42 as value"},
            content_type="application/json",
        )
        assert start_response.status_code == 202
        job_id = start_response.get_json()["job_id"]

        max_attempts = 50
        for _ in range(max_attempts):
            status_response = client.get(f"/api/model-query-jobs/{job_id}/")
            data = status_response.get_json()
            if data["status"] in ("completed", "failed"):
                break
            time.sleep(0.1)

        assert data["status"] == "completed"
        assert data["result"]["source_name"] == "other_source"
        assert data["result"]["rows"] == [{"value": 42}]

    def test_empty_result_set(self, client, app):
        """Test handling of empty result set."""
        app.mock_source.read_sql.return_value = []

        start_response = client.post(
            "/api/model-query-jobs/",
            json={"source_name": "test_source", "sql": "SELECT * FROM empty_table"},
            content_type="application/json",
        )
        job_id = start_response.get_json()["job_id"]

        max_attempts = 50
        for _ in range(max_attempts):
            status_response = client.get(f"/api/model-query-jobs/{job_id}/")
            data = status_response.get_json()
            if data["status"] in ("completed", "failed"):
                break
            time.sleep(0.1)

        assert data["status"] == "completed"
        assert data["result"]["row_count"] == 0
        assert data["result"]["rows"] == []
