import os
from flask import Flask, jsonify
from visivo.models.project import Project
from visivo.parsers.serializer import Serializer
from visivo.server.source_metadata import (
    check_source_connection,
    gather_source_metadata,
    get_database_schemas,
    get_schema_tables,
    get_source_databases,
    get_table_columns,
)
from visivo.server.views import register_views
from visivo.logger.logger import Logger
from visivo.server.repositories.worksheet_repository import WorksheetRepository
from visivo.telemetry.middleware import init_telemetry_middleware


class FlaskApp:
    def __init__(self, output_dir, project: Project):
        self.app = Flask(__name__, static_folder=output_dir, static_url_path="/data")

        self._project_json = (
            Serializer(project=project).dereference().model_dump_json(exclude_none=True)
        )
        self._project = project

        self.app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
        self.worksheet_repo = WorksheetRepository(os.path.join(output_dir, "worksheets.db"))

        # Initialize telemetry middleware
        init_telemetry_middleware(self.app, project)

        register_views(self.app, self, output_dir)

        @self.app.route("/api/project/sources_metadata", methods=["GET"])
        def sources_metadata():
            try:
                metadata = gather_source_metadata(self._project.sources)
                return jsonify(metadata)
            except Exception as e:
                Logger.instance().error(f"Error gathering source metadata: {str(e)}")
                return jsonify({"message": str(e)}), 500

        # Lazy-loading endpoints for source metadata
        @self.app.route("/api/project/sources/<source_name>/test-connection", methods=["GET"])
        def test_connection(source_name):
            """Test connection to a specific source."""
            try:
                result = check_source_connection(self._project.sources, source_name)
                if isinstance(result, tuple):  # Error response
                    return jsonify(result[0]), result[1]
                return jsonify(result)
            except Exception as e:
                Logger.instance().error(f"Error testing connection for {source_name}: {str(e)}")
                return jsonify({"message": str(e)}), 500

        @self.app.route("/api/project/sources/<source_name>/databases", methods=["GET"])
        def list_source_databases(source_name):
            """List databases for a specific source."""
            try:
                result = get_source_databases(self._project.sources, source_name)
                if isinstance(result, tuple):  # Error response
                    return jsonify(result[0]), result[1]
                return jsonify(result)
            except Exception as e:
                Logger.instance().error(f"Error listing databases for {source_name}: {str(e)}")
                return jsonify({"message": str(e)}), 500

        @self.app.route(
            "/api/project/sources/<source_name>/databases/<database_name>/schemas", methods=["GET"]
        )
        def list_database_schemas(source_name, database_name):
            """List schemas for a specific database."""
            try:
                result = get_database_schemas(self._project.sources, source_name, database_name)
                if isinstance(result, tuple):  # Error response
                    return jsonify(result[0]), result[1]
                return jsonify(result)
            except Exception as e:
                Logger.instance().error(f"Error listing schemas: {str(e)}")
                return jsonify({"message": str(e)}), 500

        @self.app.route(
            "/api/project/sources/<source_name>/databases/<database_name>/tables", methods=["GET"]
        )
        def list_database_tables(source_name, database_name):
            """List tables for a database (no schema)."""
            try:
                result = get_schema_tables(self._project.sources, source_name, database_name)
                if isinstance(result, tuple):  # Error response
                    return jsonify(result[0]), result[1]
                return jsonify(result)
            except Exception as e:
                Logger.instance().error(f"Error listing tables: {str(e)}")
                return jsonify({"message": str(e)}), 500

        @self.app.route(
            "/api/project/sources/<source_name>/databases/<database_name>/schemas/<schema_name>/tables",
            methods=["GET"],
        )
        def list_schema_tables(source_name, database_name, schema_name):
            """List tables for a specific schema."""
            try:
                result = get_schema_tables(
                    self._project.sources, source_name, database_name, schema_name
                )
                if isinstance(result, tuple):  # Error response
                    return jsonify(result[0]), result[1]
                return jsonify(result)
            except Exception as e:
                Logger.instance().error(f"Error listing tables: {str(e)}")
                return jsonify({"message": str(e)}), 500

        @self.app.route(
            "/api/project/sources/<source_name>/databases/<database_name>/tables/<table_name>/columns",
            methods=["GET"],
        )
        def list_table_columns(source_name, database_name, table_name):
            """List columns for a table (no schema)."""
            try:
                result = get_table_columns(
                    self._project.sources, source_name, database_name, table_name
                )
                if isinstance(result, tuple):  # Error response
                    return jsonify(result[0]), result[1]
                return jsonify(result)
            except Exception as e:
                Logger.instance().error(f"Error listing columns: {str(e)}")
                return jsonify({"message": str(e)}), 500

        @self.app.route(
            "/api/project/sources/<source_name>/databases/<database_name>/schemas/<schema_name>/tables/<table_name>/columns",
            methods=["GET"],
        )
        def list_schema_table_columns(source_name, database_name, schema_name, table_name):
            """List columns for a table in a specific schema."""
            try:
                result = get_table_columns(
                    self._project.sources, source_name, database_name, table_name, schema_name
                )
                if isinstance(result, tuple):  # Error response
                    return jsonify(result[0]), result[1]
                return jsonify(result)
            except Exception as e:
                Logger.instance().error(f"Error listing columns: {str(e)}")
                return jsonify({"message": str(e)}), 500

    @property
    def project(self):
        return self._project

    @project.setter
    def project(self, value):
        Logger.instance().debug(f"Setting new project on FlaskApp")
        self._project_json = (
            Serializer(project=value).dereference().model_dump_json(exclude_none=True)
        )
        self._project = value
