import pytest
import json
from unittest.mock import Mock, patch
from visivo.server.flask_app import FlaskApp


class TestFlaskSourceEndpoints:
    """Test suite for Flask source metadata API endpoints."""

    def setup_method(self):
        """Set up test fixtures."""
        # Create mock project with sources
        self.mock_project = Mock()
        self.mock_source = Mock()
        self.mock_source.name = "test_source"
        self.mock_source.type = "postgresql"
        self.mock_source.database = "test_db"
        self.mock_project.sources = [self.mock_source]

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

            # Mock WorksheetRepository to avoid database creation
            with patch("visivo.server.flask_app.WorksheetRepository") as mock_worksheet_repo:
                mock_worksheet_repo.return_value = Mock()

                # Create FlaskApp instance
                self.flask_app = FlaskApp(output_dir=self.temp_dir, project=self.mock_project)

        self.client = self.flask_app.app.test_client()

    def teardown_method(self):
        """Clean up temp directory."""
        import shutil

        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_test_connection_success(self):
        """Test GET /api/project/sources/<name>/test-connection."""
        with patch("visivo.server.views.sources_views.check_source_connection") as mock_test:
            mock_test.return_value = {"source": "test_source", "status": "connected"}

            response = self.client.get("/api/project/sources/test_source/test-connection/")

            assert response.status_code == 200
            data = json.loads(response.data)
            assert data["status"] == "connected"
            mock_test.assert_called_once_with(self.mock_project.sources, "test_source")

    def test_test_connection_not_found(self):
        """Test connection test for non-existent source."""
        with patch("visivo.server.views.sources_views.check_source_connection") as mock_test:
            mock_test.return_value = ({"error": "Source 'bad_source' not found"}, 404)

            response = self.client.get("/api/project/sources/bad_source/test-connection/")

            assert response.status_code == 404
            data = json.loads(response.data)
            assert "not found" in data["error"]

    def test_list_source_databases_success(self):
        """Test GET /api/project/sources/<name>/databases."""
        with patch("visivo.server.views.sources_views.get_source_databases") as mock_get_dbs:
            mock_get_dbs.return_value = {
                "source": "test_source",
                "databases": [{"name": "db1"}, {"name": "db2"}],
                "status": "connected",
            }

            response = self.client.get("/api/project/sources/test_source/databases/")

            assert response.status_code == 200
            data = json.loads(response.data)
            assert len(data["databases"]) == 2
            assert data["databases"][0]["name"] == "db1"

    def test_list_source_databases_error(self):
        """Test database listing error handling."""
        with patch("visivo.server.views.sources_views.get_source_databases") as mock_get_dbs:
            mock_get_dbs.side_effect = Exception("Connection failed")

            response = self.client.get("/api/project/sources/test_source/databases/")

            assert response.status_code == 500
            data = json.loads(response.data)
            assert "Connection failed" in data["message"]

    def test_list_database_schemas_success(self):
        """Test GET /api/project/sources/<name>/databases/<db>/schemas."""
        with patch("visivo.server.views.sources_views.get_database_schemas") as mock_get_schemas:
            mock_get_schemas.return_value = {
                "source": "test_source",
                "database": "test_db",
                "schemas": [{"name": "public"}, {"name": "private"}],
                "has_schemas": True,
            }

            response = self.client.get(
                "/api/project/sources/test_source/databases/test_db/schemas/"
            )

            assert response.status_code == 200
            data = json.loads(response.data)
            assert data["has_schemas"] is True
            assert len(data["schemas"]) == 2

    def test_list_database_schemas_no_schemas(self):
        """Test schema listing for database without schemas."""
        with patch("visivo.server.views.sources_views.get_database_schemas") as mock_get_schemas:
            mock_get_schemas.return_value = {
                "source": "test_source",
                "database": "test_db",
                "schemas": None,
                "has_schemas": False,
            }

            response = self.client.get(
                "/api/project/sources/test_source/databases/test_db/schemas/"
            )

            assert response.status_code == 200
            data = json.loads(response.data)
            assert data["has_schemas"] is False
            assert data["schemas"] is None

    def test_list_database_tables_no_schema(self):
        """Test GET /api/project/sources/<name>/databases/<db>/tables."""
        with patch("visivo.server.views.sources_views.get_schema_tables") as mock_get_tables:
            mock_get_tables.return_value = {
                "source": "test_source",
                "database": "test_db",
                "schema": None,
                "tables": [{"name": "users"}, {"name": "orders"}],
            }

            response = self.client.get("/api/project/sources/test_source/databases/test_db/tables/")

            assert response.status_code == 200
            data = json.loads(response.data)
            assert data["schema"] is None
            assert len(data["tables"]) == 2
            mock_get_tables.assert_called_once_with(
                self.mock_project.sources, "test_source", "test_db"
            )

    def test_list_schema_tables_with_schema(self):
        """Test GET /api/project/sources/<name>/databases/<db>/schemas/<schema>/tables."""
        with patch("visivo.server.views.sources_views.get_schema_tables") as mock_get_tables:
            mock_get_tables.return_value = {
                "source": "test_source",
                "database": "test_db",
                "schema": "public",
                "tables": [{"name": "users"}, {"name": "orders"}],
            }

            response = self.client.get(
                "/api/project/sources/test_source/databases/test_db/schemas/public/tables/"
            )

            assert response.status_code == 200
            data = json.loads(response.data)
            assert data["schema"] == "public"
            assert len(data["tables"]) == 2
            mock_get_tables.assert_called_once_with(
                self.mock_project.sources, "test_source", "test_db", "public"
            )

    def test_list_table_columns_no_schema(self):
        """Test GET /api/project/sources/<name>/databases/<db>/tables/<table>/columns."""
        with patch("visivo.server.views.sources_views.get_table_columns") as mock_get_cols:
            mock_get_cols.return_value = {
                "source": "test_source",
                "database": "test_db",
                "schema": None,
                "table": "users",
                "columns": [
                    {"name": "id", "type": "INTEGER"},
                    {"name": "name", "type": "VARCHAR(255)"},
                ],
            }

            response = self.client.get(
                "/api/project/sources/test_source/databases/test_db/tables/users/columns/"
            )

            assert response.status_code == 200
            data = json.loads(response.data)
            assert data["table"] == "users"
            assert len(data["columns"]) == 2
            assert data["columns"][0]["name"] == "id"
            mock_get_cols.assert_called_once_with(
                self.mock_project.sources, "test_source", "test_db", "users"
            )

    def test_list_table_columns_with_schema(self):
        """Test GET /api/project/sources/<name>/databases/<db>/schemas/<schema>/tables/<table>/columns."""
        with patch("visivo.server.views.sources_views.get_table_columns") as mock_get_cols:
            mock_get_cols.return_value = {
                "source": "test_source",
                "database": "test_db",
                "schema": "public",
                "table": "users",
                "columns": [
                    {"name": "id", "type": "INTEGER"},
                    {"name": "email", "type": "VARCHAR(255)"},
                ],
            }

            response = self.client.get(
                "/api/project/sources/test_source/databases/test_db/schemas/public/tables/users/columns/"
            )

            assert response.status_code == 200
            data = json.loads(response.data)
            assert data["schema"] == "public"
            assert data["table"] == "users"
            assert len(data["columns"]) == 2
            mock_get_cols.assert_called_once_with(
                self.mock_project.sources, "test_source", "test_db", "users", "public"
            )

    def test_sources_metadata_success(self):
        """Test GET /api/project/sources_metadata returns all metadata."""
        with patch("visivo.server.views.sources_views.gather_source_metadata") as mock_gather:
            mock_gather.return_value = {
                "sources": [
                    {
                        "name": "test_source",
                        "type": "postgresql",
                        "status": "connected",
                        "databases": [
                            {
                                "name": "test_db",
                                "schemas": [{"name": "public", "tables": ["users"]}],
                            }
                        ],
                    }
                ]
            }

            response = self.client.get("/api/project/sources_metadata/")

            assert response.status_code == 200
            data = json.loads(response.data)
            assert len(data["sources"]) == 1
            assert data["sources"][0]["name"] == "test_source"
            mock_gather.assert_called_once_with(self.mock_project.sources)

    def test_sources_metadata_error(self):
        """Test sources_metadata error handling."""
        with patch("visivo.server.views.sources_views.gather_source_metadata") as mock_gather:
            mock_gather.side_effect = Exception("Introspection failed")

            response = self.client.get("/api/project/sources_metadata/")

            assert response.status_code == 500
            data = json.loads(response.data)
            assert "Introspection failed" in data["message"]

    def test_endpoint_error_responses(self):
        """Test that all endpoints handle tuple error responses correctly."""
        # Test each endpoint that checks for tuple responses
        endpoints_and_mocks = [
            ("/api/project/sources/test/test-connection/", "check_source_connection"),
            ("/api/project/sources/test/databases/", "get_source_databases"),
            ("/api/project/sources/test/databases/db/schemas/", "get_database_schemas"),
            ("/api/project/sources/test/databases/db/tables/", "get_schema_tables"),
            ("/api/project/sources/test/databases/db/tables/tbl/columns/", "get_table_columns"),
        ]

        for endpoint, mock_name in endpoints_and_mocks:
            with patch(f"visivo.server.views.sources_views.{mock_name}") as mock_func:
                mock_func.return_value = ({"error": "Custom error"}, 400)

                response = self.client.get(endpoint)

                assert response.status_code == 400
                data = json.loads(response.data)
                assert data["error"] == "Custom error"

    def test_endpoint_paths_with_special_characters(self):
        """Test endpoints handle special characters in path parameters."""
        special_names = [
            "source-with-dash",
            "source_with_underscore",
            "source.with.dot",
        ]

        for source_name in special_names:
            with patch("visivo.server.views.sources_views.check_source_connection") as mock_test:
                mock_test.return_value = {"source": source_name, "status": "connected"}

                response = self.client.get(f"/api/project/sources/{source_name}/test-connection/")

                assert response.status_code == 200
                mock_test.assert_called_with(self.mock_project.sources, source_name)

    def test_multiple_path_parameters(self):
        """Test endpoints with multiple path parameters."""
        with patch("visivo.server.views.sources_views.get_schema_tables") as mock_get_tables:
            mock_get_tables.return_value = {
                "source": "my_source",
                "database": "my_db",
                "schema": "my_schema",
                "tables": [],
            }

            response = self.client.get(
                "/api/project/sources/my_source/databases/my_db/schemas/my_schema/tables/"
            )

            assert response.status_code == 200
            mock_get_tables.assert_called_once_with(
                self.mock_project.sources, "my_source", "my_db", "my_schema"
            )
