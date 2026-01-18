from flask import jsonify, request
from pydantic import ValidationError
from visivo.logger.logger import Logger


def register_markdowns_crud_views(app, flask_app, output_dir):
    """Register markdown CRUD API endpoints."""

    @app.route("/api/markdowns/", methods=["GET"])
    def list_all_markdowns():
        """List all markdowns (cached + published) with status."""
        try:
            markdowns = flask_app.markdown_manager.get_all_markdowns_with_status()
            return jsonify({"markdowns": markdowns})
        except Exception as e:
            Logger.instance().error(f"Error listing markdowns: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/markdowns/<markdown_name>/", methods=["GET"])
    def get_markdown_crud(markdown_name):
        """Get markdown configuration with status information."""
        try:
            result = flask_app.markdown_manager.get_markdown_with_status(markdown_name)
            if not result:
                return jsonify({"error": f"Markdown '{markdown_name}' not found"}), 404
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error getting markdown: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/markdowns/<markdown_name>/save/", methods=["POST"])
    def save_markdown_crud(markdown_name):
        """Save a markdown configuration to cache (draft state)."""
        try:
            markdown_config = request.get_json(silent=True)
            if not markdown_config:
                return jsonify({"error": "Markdown configuration is required"}), 400

            # Ensure name matches URL parameter
            markdown_config["name"] = markdown_name

            markdown = flask_app.markdown_manager.save_from_config(markdown_config)
            status = flask_app.markdown_manager.get_status(markdown_name)
            return (
                jsonify(
                    {
                        "message": "Markdown saved to cache",
                        "markdown": markdown_name,
                        "status": status.value if status else None,
                    }
                ),
                200,
            )
        except ValidationError as e:
            Logger.instance().debug(f"Markdown validation failed: {e}")
            first_error = e.errors()[0]
            return (
                jsonify(
                    {
                        "error": f"Invalid markdown configuration: {first_error['loc']}: {first_error['msg']}"
                    }
                ),
                400,
            )
        except Exception as e:
            Logger.instance().error(f"Error saving markdown: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/markdowns/<markdown_name>/", methods=["DELETE"])
    def delete_markdown_crud(markdown_name):
        """Mark a markdown for deletion (will be removed from YAML on publish)."""
        try:
            marked = flask_app.markdown_manager.mark_for_deletion(markdown_name)
            if marked:
                return (
                    jsonify(
                        {
                            "message": f"Markdown '{markdown_name}' marked for deletion",
                            "status": "deleted",
                        }
                    ),
                    200,
                )
            else:
                return jsonify({"error": f"Markdown '{markdown_name}' not found"}), 404
        except Exception as e:
            Logger.instance().error(f"Error deleting markdown: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/markdowns/<markdown_name>/validate/", methods=["POST"])
    def validate_markdown_crud(markdown_name):
        """Validate a markdown configuration without saving it."""
        try:
            markdown_config = request.get_json(silent=True)
            if not markdown_config:
                return jsonify({"error": "Markdown configuration is required"}), 400

            # Ensure name matches URL parameter
            markdown_config["name"] = markdown_name

            result = flask_app.markdown_manager.validate_config(markdown_config)
            if result.get("valid"):
                return jsonify(result), 200
            else:
                return jsonify(result), 400
        except Exception as e:
            Logger.instance().error(f"Error validating markdown: {str(e)}")
            return jsonify({"error": str(e)}), 500
