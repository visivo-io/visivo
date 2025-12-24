from flask import jsonify, request
from pydantic import ValidationError
from visivo.logger.logger import Logger
from visivo.server.source_metadata import (
    check_source_connection,
    gather_source_metadata,
    get_database_schemas,
    get_schema_tables,
    get_source_databases,
    get_table_columns,
    validate_source_from_config,
)


def register_source_views(app, flask_app, output_dir):
    @app.route("/api/project/sources_metadata/", methods=["GET"])
    def sources_metadata():
        try:
            # Use source_manager to include both cached and published sources
            metadata = gather_source_metadata(flask_app.source_manager.get_sources_list())
            return jsonify(metadata)
        except Exception as e:
            Logger.instance().error(f"Error gathering source metadata: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/project/sources/<source_name>/test-connection/", methods=["GET"])
    def test_connection(source_name):
        """Test connection to a specific source."""
        try:
            # Use source_manager to include both cached and published sources
            result = check_source_connection(
                flask_app.source_manager.get_sources_list(), source_name
            )
            if isinstance(result, tuple):  # Error response
                return jsonify(result[0]), result[1]
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error testing connection for {source_name}: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/project/sources/<source_name>/databases/", methods=["GET"])
    def list_source_databases(source_name):
        """List databases for a specific source."""
        try:
            # Use source_manager to include both cached and published sources
            result = get_source_databases(flask_app.source_manager.get_sources_list(), source_name)
            if isinstance(result, tuple):  # Error response
                return jsonify(result[0]), result[1]
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error listing databases for {source_name}: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route(
        "/api/project/sources/<source_name>/databases/<database_name>/schemas/", methods=["GET"]
    )
    def list_database_schemas(source_name, database_name):
        """List schemas for a specific database."""
        try:
            # Use source_manager to include both cached and published sources
            result = get_database_schemas(
                flask_app.source_manager.get_sources_list(), source_name, database_name
            )
            if isinstance(result, tuple):  # Error response
                return jsonify(result[0]), result[1]
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error listing schemas: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route(
        "/api/project/sources/<source_name>/databases/<database_name>/tables/", methods=["GET"]
    )
    def list_database_tables(source_name, database_name):
        """List tables for a database (no schema)."""
        try:
            # Use source_manager to include both cached and published sources
            result = get_schema_tables(
                flask_app.source_manager.get_sources_list(), source_name, database_name
            )
            if isinstance(result, tuple):  # Error response
                return jsonify(result[0]), result[1]
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error listing tables: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route(
        "/api/project/sources/<source_name>/databases/<database_name>/schemas/<schema_name>/tables/",
        methods=["GET"],
    )
    def list_schema_tables(source_name, database_name, schema_name):
        """List tables for a specific schema."""
        try:
            # Use source_manager to include both cached and published sources
            result = get_schema_tables(
                flask_app.source_manager.get_sources_list(),
                source_name,
                database_name,
                schema_name,
            )
            if isinstance(result, tuple):  # Error response
                return jsonify(result[0]), result[1]
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error listing tables: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route(
        "/api/project/sources/<source_name>/databases/<database_name>/tables/<table_name>/columns/",
        methods=["GET"],
    )
    def list_table_columns(source_name, database_name, table_name):
        """List columns for a table (no schema)."""
        try:
            # Use source_manager to include both cached and published sources
            result = get_table_columns(
                flask_app.source_manager.get_sources_list(),
                source_name,
                database_name,
                table_name,
            )
            if isinstance(result, tuple):  # Error response
                return jsonify(result[0]), result[1]
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error listing columns: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route(
        "/api/project/sources/<source_name>/databases/<database_name>/schemas/<schema_name>/tables/<table_name>/columns/",
        methods=["GET"],
    )
    def list_schema_table_columns(source_name, database_name, schema_name, table_name):
        """List columns for a table in a specific schema."""
        try:
            # Use source_manager to include both cached and published sources
            result = get_table_columns(
                flask_app.source_manager.get_sources_list(),
                source_name,
                database_name,
                table_name,
                schema_name,
            )
            if isinstance(result, tuple):  # Error response
                return jsonify(result[0]), result[1]
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error listing columns: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/sources/test-connection/", methods=["POST"])
    def test_source_connection():
        """Test a source connection from configuration without adding to project."""
        try:
            source_config = request.get_json(silent=True)
            if source_config is None:
                # Check if it's because of invalid JSON or missing body
                if request.data and len(request.data) > 0:
                    return jsonify({"error": "Invalid JSON in request body"}), 400
                else:
                    return jsonify({"error": "Source configuration is required"}), 400

            result = validate_source_from_config(source_config)
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error testing source connection: {str(e)}")
            return jsonify({"status": "connection_failed", "error": str(e)}), 500

    # ========== New SourceManager-based endpoints ==========

    @app.route("/api/sources/", methods=["GET"])
    def list_all_sources():
        """List all sources (cached + published) with status."""
        try:
            sources = flask_app.source_manager.get_all_sources_with_status()
            return jsonify({"sources": sources})
        except Exception as e:
            Logger.instance().error(f"Error listing sources: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/sources/<source_name>/", methods=["GET"])
    def get_source(source_name):
        """Get source configuration with status information."""
        try:
            result = flask_app.source_manager.get_source_with_status(source_name)
            if not result:
                return jsonify({"error": f"Source '{source_name}' not found"}), 404
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error getting source: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/sources/<source_name>/save/", methods=["POST"])
    def save_source(source_name):
        """Save a source configuration to cache (draft state)."""
        try:
            source_config = request.get_json(silent=True)
            if not source_config:
                return jsonify({"error": "Source configuration is required"}), 400

            # Ensure name matches URL parameter
            source_config["name"] = source_name

            source = flask_app.source_manager.save_from_config(source_config)
            status = flask_app.source_manager.get_status(source_name)
            return (
                jsonify(
                    {
                        "message": "Source saved to cache",
                        "source": source_name,
                        "status": status.value if status else None,
                    }
                ),
                200,
            )
        except ValidationError as e:
            Logger.instance().debug(f"Source validation failed: {e}")
            first_error = e.errors()[0]
            return (
                jsonify(
                    {
                        "error": f"Invalid source configuration: {first_error['loc']}: {first_error['msg']}"
                    }
                ),
                400,
            )
        except Exception as e:
            Logger.instance().error(f"Error saving source: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/sources/<source_name>/", methods=["DELETE"])
    def delete_source(source_name):
        """Mark a source for deletion (will be removed from YAML on publish)."""
        try:
            marked = flask_app.source_manager.mark_for_deletion(source_name)
            if marked:
                return (
                    jsonify(
                        {
                            "message": f"Source '{source_name}' marked for deletion",
                            "status": "deleted",
                        }
                    ),
                    200,
                )
            else:
                return jsonify({"error": f"Source '{source_name}' not found"}), 404
        except Exception as e:
            Logger.instance().error(f"Error deleting source: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/sources/<source_name>/validate/", methods=["POST"])
    def validate_source(source_name):
        """Validate a source configuration without saving it."""
        try:
            source_config = request.get_json(silent=True)
            if not source_config:
                return jsonify({"error": "Source configuration is required"}), 400

            # Ensure name matches URL parameter
            source_config["name"] = source_name

            result = flask_app.source_manager.validate_config(source_config)
            if result.get("valid"):
                return jsonify(result), 200
            else:
                return jsonify(result), 400
        except Exception as e:
            Logger.instance().error(f"Error validating source: {str(e)}")
            return jsonify({"error": str(e)}), 500
