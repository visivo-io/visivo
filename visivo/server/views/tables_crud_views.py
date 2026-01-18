from flask import jsonify, request
from pydantic import ValidationError
from visivo.logger.logger import Logger


def register_tables_crud_views(app, flask_app, output_dir):
    """Register table CRUD API endpoints."""

    @app.route("/api/tables/", methods=["GET"])
    def list_all_tables():
        """List all tables (cached + published) with status."""
        try:
            tables = flask_app.table_manager.get_all_tables_with_status()
            return jsonify({"tables": tables})
        except Exception as e:
            Logger.instance().error(f"Error listing tables: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/tables/<table_name>/", methods=["GET"])
    def get_table_crud(table_name):
        """Get table configuration with status information."""
        try:
            result = flask_app.table_manager.get_table_with_status(table_name)
            if not result:
                return jsonify({"error": f"Table '{table_name}' not found"}), 404
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error getting table: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/tables/<table_name>/save/", methods=["POST"])
    def save_table_crud(table_name):
        """Save a table configuration to cache (draft state)."""
        try:
            table_config = request.get_json(silent=True)
            if not table_config:
                return jsonify({"error": "Table configuration is required"}), 400

            # Ensure name matches URL parameter
            table_config["name"] = table_name

            table = flask_app.table_manager.save_from_config(table_config)
            status = flask_app.table_manager.get_status(table_name)
            return (
                jsonify(
                    {
                        "message": "Table saved to cache",
                        "table": table_name,
                        "status": status.value if status else None,
                    }
                ),
                200,
            )
        except ValidationError as e:
            Logger.instance().debug(f"Table validation failed: {e}")
            first_error = e.errors()[0]
            return (
                jsonify(
                    {
                        "error": f"Invalid table configuration: {first_error['loc']}: {first_error['msg']}"
                    }
                ),
                400,
            )
        except Exception as e:
            Logger.instance().error(f"Error saving table: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/tables/<table_name>/", methods=["DELETE"])
    def delete_table_crud(table_name):
        """Mark a table for deletion (will be removed from YAML on publish)."""
        try:
            marked = flask_app.table_manager.mark_for_deletion(table_name)
            if marked:
                return (
                    jsonify(
                        {
                            "message": f"Table '{table_name}' marked for deletion",
                            "status": "deleted",
                        }
                    ),
                    200,
                )
            else:
                return jsonify({"error": f"Table '{table_name}' not found"}), 404
        except Exception as e:
            Logger.instance().error(f"Error deleting table: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/tables/<table_name>/validate/", methods=["POST"])
    def validate_table_crud(table_name):
        """Validate a table configuration without saving it."""
        try:
            table_config = request.get_json(silent=True)
            if not table_config:
                return jsonify({"error": "Table configuration is required"}), 400

            # Ensure name matches URL parameter
            table_config["name"] = table_name

            result = flask_app.table_manager.validate_config(table_config)
            if result.get("valid"):
                return jsonify(result), 200
            else:
                return jsonify(result), 400
        except Exception as e:
            Logger.instance().error(f"Error validating table: {str(e)}")
            return jsonify({"error": str(e)}), 500
