import pytest
import json
import os
import tempfile
from unittest.mock import Mock, patch
from flask import Flask

from visivo.constants import DEFAULT_RUN_ID
from visivo.server.views.source_schema_jobs_views import register_source_schema_jobs_views
from visivo.server.managers.preview_run_manager import PreviewRunManager, RunStatus, PreviewRun


class TestSourceSchemaJobsViews:
    """Test suite for source schema jobs API endpoints."""

    @pytest.fixture
    def temp_output_dir(self):
        """Create a temporary output directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir

    @pytest.fixture
    def sample_schema(self, temp_output_dir):
        """Create a sample cached schema file in the main run_id location."""
        schema_dir = os.path.join(temp_output_dir, DEFAULT_RUN_ID, "schemas", "test_source")
        os.makedirs(schema_dir, exist_ok=True)

        schema_data = {
            "source_name": "test_source",
            "source_type": "sqlite",
            "generated_at": "2024-01-01T00:00:00",
            "tables": {
                "users": {
                    "columns": {
                        "id": {"type": "INTEGER", "nullable": False},
                        "name": {"type": "VARCHAR", "nullable": True},
                        "email": {"type": "VARCHAR", "nullable": True},
                    },
                    "metadata": {},
                },
                "orders": {
                    "columns": {
                        "id": {"type": "INTEGER", "nullable": False},
                        "user_id": {"type": "INTEGER", "nullable": False},
                        "total": {"type": "DECIMAL", "nullable": True},
                    },
                    "metadata": {},
                },
            },
            "sqlglot_schema": {
                "users": {"id": "INT", "name": "VARCHAR", "email": "VARCHAR"},
                "orders": {"id": "INT", "user_id": "INT", "total": "DECIMAL"},
            },
            "metadata": {"total_tables": 2, "total_columns": 6, "databases": []},
        }

        with open(os.path.join(schema_dir, "schema.json"), "w") as f:
            json.dump(schema_data, f)

        return schema_data

    @pytest.fixture
    def sample_preview_schema(self, temp_output_dir):
        """Create a sample cached schema file in the preview run_id location."""
        preview_run_id = "preview-test_source"
        schema_dir = os.path.join(temp_output_dir, preview_run_id, "schemas", "test_source")
        os.makedirs(schema_dir, exist_ok=True)

        schema_data = {
            "source_name": "test_source",
            "source_type": "sqlite",
            "generated_at": "2024-01-02T00:00:00",
            "tables": {
                "users": {
                    "columns": {
                        "id": {"type": "INTEGER", "nullable": False},
                        "name": {"type": "VARCHAR", "nullable": True},
                    },
                    "metadata": {},
                },
            },
            "sqlglot_schema": {
                "users": {"id": "INT", "name": "VARCHAR"},
            },
            "metadata": {"total_tables": 1, "total_columns": 2, "databases": []},
        }

        with open(os.path.join(schema_dir, "schema.json"), "w") as f:
            json.dump(schema_data, f)

        return schema_data

    @pytest.fixture
    def mock_source(self):
        """Create a mock source."""
        source = Mock()
        source.name = "test_source"
        source.type = "sqlite"
        return source

    @pytest.fixture
    def mock_project(self, mock_source):
        """Create a mock project with sources."""
        project = Mock()
        project.sources = [mock_source]
        project.find_source = Mock(return_value=mock_source)
        return project

    @pytest.fixture
    def app(self, temp_output_dir, mock_project):
        """Create a test Flask app with source schema jobs views."""
        app = Flask(__name__)
        app.config["TESTING"] = True

        flask_app = Mock()
        flask_app.project = mock_project

        register_source_schema_jobs_views(app, flask_app, temp_output_dir)

        app.flask_app = flask_app
        app.output_dir = temp_output_dir

        return app

    @pytest.fixture
    def client(self, app):
        """Create a test client."""
        return app.test_client()


class TestListSourceSchemaJobs(TestSourceSchemaJobsViews):
    """Tests for GET /api/source-schema-jobs/"""

    def test_list_sources_no_cached_schemas(self, client, app):
        """Test listing sources when no schemas are cached."""
        response = client.get("/api/source-schema-jobs/")

        assert response.status_code == 200
        data = response.get_json()
        assert len(data) == 1
        assert data[0]["source_name"] == "test_source"
        assert data[0]["source_type"] == "sqlite"
        assert data[0]["has_cached_schema"] is False

    def test_list_sources_with_cached_schema(self, client, app, sample_schema):
        """Test listing sources with cached schema."""
        response = client.get("/api/source-schema-jobs/")

        assert response.status_code == 200
        data = response.get_json()
        assert len(data) == 1
        assert data[0]["source_name"] == "test_source"
        assert data[0]["has_cached_schema"] is True
        assert data[0]["total_tables"] == 2
        assert data[0]["total_columns"] == 6

    def test_list_sources_empty_project(self, client, app):
        """Test listing sources when project has no sources."""
        app.flask_app.project.sources = []

        response = client.get("/api/source-schema-jobs/")

        assert response.status_code == 200
        data = response.get_json()
        assert len(data) == 0


class TestGetSourceSchema(TestSourceSchemaJobsViews):
    """Tests for GET /api/source-schema-jobs/<name>/"""

    def test_get_schema_exists(self, client, sample_schema):
        """Test getting a cached schema."""
        response = client.get("/api/source-schema-jobs/test_source/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["source_name"] == "test_source"
        assert data["source_type"] == "sqlite"
        assert "tables" in data
        assert "users" in data["tables"]

    def test_get_schema_not_found(self, client):
        """Test getting a schema that doesn't exist."""
        response = client.get("/api/source-schema-jobs/nonexistent/")

        assert response.status_code == 404
        data = response.get_json()
        assert "message" in data
        assert "nonexistent" in data["message"]


class TestListSourceTables(TestSourceSchemaJobsViews):
    """Tests for GET /api/source-schema-jobs/<name>/tables/"""

    def test_list_tables_success(self, client, sample_schema):
        """Test listing tables for a source."""
        response = client.get("/api/source-schema-jobs/test_source/tables/")

        assert response.status_code == 200
        data = response.get_json()
        assert len(data) == 2
        table_names = [t["name"] for t in data]
        assert "users" in table_names
        assert "orders" in table_names

    def test_list_tables_with_search(self, client, sample_schema):
        """Test listing tables with search filter."""
        response = client.get("/api/source-schema-jobs/test_source/tables/?search=user")

        assert response.status_code == 200
        data = response.get_json()
        assert len(data) == 1
        assert data[0]["name"] == "users"

    def test_list_tables_schema_not_found(self, client):
        """Test listing tables when schema doesn't exist."""
        response = client.get("/api/source-schema-jobs/nonexistent/tables/")

        assert response.status_code == 404


class TestListTableColumns(TestSourceSchemaJobsViews):
    """Tests for GET /api/source-schema-jobs/<name>/tables/<table>/columns/"""

    def test_list_columns_success(self, client, sample_schema):
        """Test listing columns for a table."""
        response = client.get("/api/source-schema-jobs/test_source/tables/users/columns/")

        assert response.status_code == 200
        data = response.get_json()
        assert len(data) == 3
        column_names = [c["name"] for c in data]
        assert "id" in column_names
        assert "name" in column_names
        assert "email" in column_names

    def test_list_columns_with_search(self, client, sample_schema):
        """Test listing columns with search filter."""
        response = client.get("/api/source-schema-jobs/test_source/tables/users/columns/?search=id")

        assert response.status_code == 200
        data = response.get_json()
        assert len(data) == 1
        assert data[0]["name"] == "id"

    def test_list_columns_table_not_found(self, client, sample_schema):
        """Test listing columns for a non-existent table."""
        response = client.get("/api/source-schema-jobs/test_source/tables/nonexistent/columns/")

        assert response.status_code == 404

    def test_list_columns_schema_not_found(self, client):
        """Test listing columns when schema doesn't exist."""
        response = client.get("/api/source-schema-jobs/nonexistent/tables/users/columns/")

        assert response.status_code == 404


class TestGenerateSourceSchema(TestSourceSchemaJobsViews):
    """Tests for POST /api/source-schema-jobs/ (RESTful API)"""

    @patch("visivo.server.views.source_schema_jobs_views.PreviewRunManager")
    @patch("visivo.server.views.source_schema_jobs_views.threading.Thread")
    def test_generate_schema_success(self, mock_thread, mock_run_manager_class, client, app):
        """Test triggering schema generation with RESTful API."""
        mock_run_manager = Mock()
        mock_run_manager_class.instance.return_value = mock_run_manager
        mock_run_manager.find_existing_run.return_value = None
        mock_run_manager.create_run.return_value = "test-job-id"

        mock_thread_instance = Mock()
        mock_thread.return_value = mock_thread_instance

        response = client.post(
            "/api/source-schema-jobs/",
            json={"config": {"source_name": "test_source"}, "run": True},
        )

        assert response.status_code == 202
        data = response.get_json()
        assert "run_instance_id" in data
        assert data["run_instance_id"] == "test-job-id"
        mock_thread_instance.start.assert_called_once()

    @patch("visivo.server.views.source_schema_jobs_views.PreviewRunManager")
    def test_generate_schema_returns_existing_job(self, mock_run_manager_class, client, app):
        """Test that existing running job is returned."""
        mock_run_manager = Mock()
        mock_run_manager_class.instance.return_value = mock_run_manager
        mock_run_manager.find_existing_run.return_value = "existing-job-id"

        response = client.post(
            "/api/source-schema-jobs/",
            json={"config": {"source_name": "test_source"}, "run": True},
        )

        assert response.status_code == 202
        data = response.get_json()
        assert data["run_instance_id"] == "existing-job-id"

    def test_generate_schema_source_not_found(self, client, app):
        """Test generating schema for non-existent source."""
        app.flask_app.project.find_source.return_value = None

        response = client.post(
            "/api/source-schema-jobs/",
            json={"config": {"source_name": "nonexistent"}, "run": True},
        )

        assert response.status_code == 404
        data = response.get_json()
        assert "nonexistent" in data["message"]

    def test_generate_schema_missing_config(self, client, app):
        """Test generating schema without config field."""
        response = client.post(
            "/api/source-schema-jobs/",
            json={"run": True},
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "config" in data["message"]

    def test_generate_schema_missing_source_name(self, client, app):
        """Test generating schema without source_name in config."""
        response = client.post(
            "/api/source-schema-jobs/",
            json={"config": {}, "run": True},
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "source_name" in data["message"]

    def test_generate_schema_missing_run_flag(self, client, app):
        """Test generating schema without run flag."""
        response = client.post(
            "/api/source-schema-jobs/",
            json={"config": {"source_name": "test_source"}},
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "run" in data["message"]


class TestGetSchemaGenerationStatus(TestSourceSchemaJobsViews):
    """Tests for GET /api/source-schema-jobs/<job_id>/ (job status)"""

    @patch("visivo.server.views.source_schema_jobs_views.PreviewRunManager")
    def test_get_status_running(self, mock_run_manager_class, client):
        """Test getting status of a running job."""
        mock_run_manager = Mock()
        mock_run_manager_class.instance.return_value = mock_run_manager

        mock_run = Mock()
        mock_run.status = RunStatus.RUNNING
        mock_run.config = {"source_name": "test_source"}
        mock_run.to_dict.return_value = {
            "run_instance_id": "12345678-1234-1234-1234-123456789abc",
            "status": "running",
            "progress": 0.5,
            "progress_message": "Connecting to source",
        }
        mock_run_manager.get_run.return_value = mock_run

        response = client.get("/api/source-schema-jobs/12345678-1234-1234-1234-123456789abc/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["status"] == "running"
        assert data["progress"] == 0.5

    @patch("visivo.server.views.source_schema_jobs_views.PreviewRunManager")
    def test_get_status_completed(self, mock_run_manager_class, client, sample_schema):
        """Test getting status of a completed job."""
        mock_run_manager = Mock()
        mock_run_manager_class.instance.return_value = mock_run_manager

        mock_run = Mock()
        mock_run.status = RunStatus.COMPLETED
        mock_run.config = {"source_name": "test_source"}
        mock_run.to_dict.return_value = {
            "run_instance_id": "12345678-1234-1234-1234-123456789abc",
            "status": "completed",
            "progress": 1.0,
            "progress_message": "Complete",
        }
        mock_run_manager.get_run.return_value = mock_run

        response = client.get("/api/source-schema-jobs/12345678-1234-1234-1234-123456789abc/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["status"] == "completed"
        assert "result" in data
        assert data["result"]["total_tables"] == 2

    @patch("visivo.server.views.source_schema_jobs_views.PreviewRunManager")
    def test_get_status_job_not_found(self, mock_run_manager_class, client):
        """Test getting status of a non-existent job."""
        mock_run_manager = Mock()
        mock_run_manager_class.instance.return_value = mock_run_manager
        mock_run_manager.get_run.return_value = None

        response = client.get("/api/source-schema-jobs/12345678-1234-1234-1234-123456789abc/")

        assert response.status_code == 404


class TestSchemaFallbackBehavior(TestSourceSchemaJobsViews):
    """Tests for run_id fallback behavior (main -> preview)."""

    def test_get_schema_from_preview_when_main_missing(self, client, sample_preview_schema):
        """Test that preview schema is returned when main is missing."""
        response = client.get("/api/source-schema-jobs/test_source/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["source_name"] == "test_source"
        assert data["generated_at"] == "2024-01-02T00:00:00"
        assert data["metadata"]["total_tables"] == 1

    def test_get_schema_prefers_main_over_preview(
        self, client, sample_schema, sample_preview_schema
    ):
        """Test that main schema is preferred when both exist."""
        response = client.get("/api/source-schema-jobs/test_source/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["generated_at"] == "2024-01-01T00:00:00"
        assert data["metadata"]["total_tables"] == 2

    def test_list_tables_from_preview(self, client, sample_preview_schema):
        """Test listing tables from preview schema."""
        response = client.get("/api/source-schema-jobs/test_source/tables/")

        assert response.status_code == 200
        data = response.get_json()
        assert len(data) == 1
        assert data[0]["name"] == "users"

    def test_list_columns_from_preview(self, client, sample_preview_schema):
        """Test listing columns from preview schema."""
        response = client.get("/api/source-schema-jobs/test_source/tables/users/columns/")

        assert response.status_code == 200
        data = response.get_json()
        assert len(data) == 2
        column_names = [c["name"] for c in data]
        assert "id" in column_names
        assert "name" in column_names

    def test_list_sources_with_preview_schema(self, client, app, sample_preview_schema):
        """Test listing sources finds preview schema when main is missing."""
        response = client.get("/api/source-schema-jobs/")

        assert response.status_code == 200
        data = response.get_json()
        assert len(data) == 1
        assert data[0]["has_cached_schema"] is True
        assert data[0]["total_tables"] == 1
        assert data[0]["total_columns"] == 2

    @patch("visivo.server.views.source_schema_jobs_views.PreviewRunManager")
    def test_status_completed_with_preview_schema(
        self, mock_run_manager_class, client, sample_preview_schema
    ):
        """Test status endpoint returns preview schema data when main is missing."""
        mock_run_manager = Mock()
        mock_run_manager_class.instance.return_value = mock_run_manager

        mock_run = Mock()
        mock_run.status = RunStatus.COMPLETED
        mock_run.config = {"source_name": "test_source"}
        mock_run.to_dict.return_value = {
            "run_instance_id": "12345678-1234-1234-1234-123456789abc",
            "status": "completed",
            "progress": 1.0,
            "progress_message": "Complete",
        }
        mock_run_manager.get_run.return_value = mock_run

        response = client.get("/api/source-schema-jobs/12345678-1234-1234-1234-123456789abc/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["status"] == "completed"
        assert "result" in data
        assert data["result"]["total_tables"] == 1
