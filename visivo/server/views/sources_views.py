from flask import jsonify
from visivo.logger.logger import Logger
from visivo.server.source_metadata import (
    check_source_connection,
    gather_source_metadata,
    get_database_schemas,
    get_schema_tables,
    get_source_databases,
    get_table_columns,
)


def register_source_views(app, flask_app, output_dir):
    @app.route("/api/project/sources_metadata", methods=["GET"])
    def sources_metadata():
        try:
            metadata = gather_source_metadata(flask_app._project.sources)
            return jsonify(metadata)
        except Exception as e:
            Logger.instance().error(f"Error gathering source metadata: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/project/sources/<source_name>/test-connection", methods=["GET"])
    def test_connection(source_name):
        """Test connection to a specific source."""
        try:
            result = check_source_connection(flask_app._project.sources, source_name)
            if isinstance(result, tuple):  # Error response
                return jsonify(result[0]), result[1]
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error testing connection for {source_name}: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/project/sources/<source_name>/databases", methods=["GET"])
    def list_source_databases(source_name):
        """List databases for a specific source."""
        try:
            result = get_source_databases(flask_app._project.sources, source_name)
            if isinstance(result, tuple):  # Error response
                return jsonify(result[0]), result[1]
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error listing databases for {source_name}: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route(
        "/api/project/sources/<source_name>/databases/<database_name>/schemas", methods=["GET"]
    )
    def list_database_schemas(source_name, database_name):
        """List schemas for a specific database."""
        try:
            result = get_database_schemas(flask_app._project.sources, source_name, database_name)
            if isinstance(result, tuple):  # Error response
                return jsonify(result[0]), result[1]
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error listing schemas: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route(
        "/api/project/sources/<source_name>/databases/<database_name>/tables", methods=["GET"]
    )
    def list_database_tables(source_name, database_name):
        """List tables for a database (no schema)."""
        try:
            result = get_schema_tables(flask_app._project.sources, source_name, database_name)
            if isinstance(result, tuple):  # Error response
                return jsonify(result[0]), result[1]
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error listing tables: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route(
        "/api/project/sources/<source_name>/databases/<database_name>/schemas/<schema_name>/tables",
        methods=["GET"],
    )
    def list_schema_tables(source_name, database_name, schema_name):
        """List tables for a specific schema."""
        try:
            result = get_schema_tables(
                flask_app._project.sources, source_name, database_name, schema_name
            )
            if isinstance(result, tuple):  # Error response
                return jsonify(result[0]), result[1]
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error listing tables: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route(
        "/api/project/sources/<source_name>/databases/<database_name>/tables/<table_name>/columns",
        methods=["GET"],
    )
    def list_table_columns(source_name, database_name, table_name):
        """List columns for a table (no schema)."""
        try:
            result = get_table_columns(
                flask_app._project.sources, source_name, database_name, table_name
            )
            if isinstance(result, tuple):  # Error response
                return jsonify(result[0]), result[1]
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error listing columns: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route(
        "/api/project/sources/<source_name>/databases/<database_name>/schemas/<schema_name>/tables/<table_name>/columns",
        methods=["GET"],
    )
    def list_schema_table_columns(source_name, database_name, schema_name, table_name):
        """List columns for a table in a specific schema."""
        try:
            result = get_table_columns(
                flask_app._project.sources, source_name, database_name, table_name, schema_name
            )
            if isinstance(result, tuple):  # Error response
                return jsonify(result[0]), result[1]
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error listing columns: {str(e)}")
            return jsonify({"message": str(e)}), 500
