import pytest
import json
from unittest.mock import Mock, patch
from visivo.server.flask_app import FlaskApp
from tests.factories.model_factories import ProjectFactory, SourceFactory


class TestFlaskSourceEndpoints:
    """Test suite for Flask source metadata API endpoints."""

    def setup_method(self):
        """Set up test fixtures."""
        # Create real project with factories (has working dag() method)
        self.project = ProjectFactory.build()
        # Store the sources list for assertions
        self.sources_list = self.project.sources

        # Create temp directory
        import tempfile

        self.temp_dir = tempfile.mkdtemp()

        # Mock serializer to avoid dereferencing issues
        with patch("visivo.server.flask_app.Serializer") as mock_serializer:
            mock_serializer_instance = Mock()
            mock_serializer_instance.dereference.return_value = Mock()
            mock_serializer_instance.dereference.return_value.model_dump_json.return_value = (
                json.dumps(
                    {
                        "name": "test_project",
                        "sources": [{"name": "test_source", "type": "postgresql"}],
                    }
                )
            )
            mock_serializer.return_value = mock_serializer_instance

            # Create FlaskApp instance
            self.flask_app = FlaskApp(output_dir=self.temp_dir, project=self.project)

        # Mock the source_manager.get_sources_list() to return our sources
        self.flask_app.source_manager.get_sources_list = Mock(return_value=self.sources_list)

        self.client = self.flask_app.app.test_client()

    def teardown_method(self):
        """Clean up temp directory."""
        import shutil

        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _await_job(self, response, base_path):
        """Start-response -> the job's terminal poll body.

        Source ops are asynchronous on both servers: 202 {job_id}, then poll
        <base_path><job_id>/ until terminal. The op itself runs on a background
        thread, so poll rather than assume it has already finished.
        """
        import time

        assert response.status_code == 202, response.data
        job_id = json.loads(response.data)["job_id"]

        deadline = time.time() + 5
        while time.time() < deadline:
            poll = self.client.get(f"{base_path}{job_id}/")
            assert poll.status_code == 200, poll.data
            body = json.loads(poll.data)
            if body["status"] in ("completed", "failed", "cancelled"):
                return body
            time.sleep(0.01)
        raise AssertionError(f"job {job_id} never reached a terminal state")

    def test_test_source_connection_success(self):
        """Test POST /api/source-connections/ with valid config."""
        with patch("visivo.server.views.sources_views.validate_source_from_config") as mock_test:
            mock_test.return_value = {"status": "connected", "source": "test_source"}

            source_config = {
                "name": "test_source",
                "type": "postgresql",
                "host": "localhost",
                "database": "test_db",
            }

            response = self.client.post(
                "/api/source-connections/",
                json=source_config,
                headers={"Content-Type": "application/json"},
            )

            job = self._await_job(response, "/api/source-connections/")
            assert job["status"] == "completed"
            assert job["result"]["status"] == "connected"
            mock_test.assert_called_once_with(source_config)

    def test_test_source_connection_failure(self):
        """Test POST /api/source-connections/ with connection failure."""
        with patch("visivo.server.views.sources_views.validate_source_from_config") as mock_test:
            mock_test.return_value = {"status": "connection_failed", "error": "Connection timeout"}

            source_config = {
                "name": "bad_source",
                "type": "postgresql",
                "host": "nonexistent",
                "database": "test_db",
            }

            response = self.client.post(
                "/api/source-connections/",
                json=source_config,
                headers={"Content-Type": "application/json"},
            )

            # A refused connection is a job that COMPLETED and reported a
            # failure — distinct from a job that failed, which means the op
            # itself blew up. Collapsing the two would hide real crashes.
            job = self._await_job(response, "/api/source-connections/")
            assert job["status"] == "completed"
            assert job["result"]["status"] == "connection_failed"
            assert "Connection timeout" in job["result"]["error"]
            mock_test.assert_called_once_with(source_config)

    def test_test_source_connection_no_config(self):
        """Test POST /api/source-connections/ with missing config."""
        response = self.client.post(
            "/api/source-connections/", headers={"Content-Type": "application/json"}
        )

        assert response.status_code == 400
        data = json.loads(response.data)
        assert "Source configuration is required" in data["error"]

    def test_test_source_connection_invalid_json(self):
        """Test POST /api/source-connections/ with invalid JSON."""
        response = self.client.post(
            "/api/source-connections/",
            data="invalid json",
            headers={"Content-Type": "application/json"},
        )

        assert response.status_code == 400
        data = json.loads(response.data)
        assert "Invalid JSON in request body" in data["error"]

    def test_test_source_connection_exception(self):
        """Test POST /api/source-connections/ with unexpected exception."""
        with patch("visivo.server.views.sources_views.validate_source_from_config") as mock_test:
            mock_test.side_effect = Exception("Unexpected error")

            source_config = {"name": "test_source", "type": "postgresql", "host": "localhost"}

            response = self.client.post(
                "/api/source-connections/",
                json=source_config,
                headers={"Content-Type": "application/json"},
            )

            # An op that crashes now fails its JOB rather than the start
            # response. The viewer maps a failed job to
            # {status: 'connection_failed', error}, so what the user sees is
            # unchanged; what changed is that the crash is attributable.
            job = self._await_job(response, "/api/source-connections/")
            assert job["status"] == "failed"
            assert "Unexpected error" in job["error"]
