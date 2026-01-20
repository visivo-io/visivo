from flask import jsonify, request
from pydantic import ValidationError
from visivo.logger.logger import Logger


def register_inputs_views(app, flask_app, output_dir):
    """Register input CRUD API endpoints."""

    @app.route("/api/inputs/", methods=["GET"])
    def list_all_inputs():
        """List all inputs (cached + published) with status."""
        try:
            inputs = flask_app.input_manager.get_all_inputs_with_status()
            return jsonify({"inputs": inputs})
        except Exception as e:
            Logger.instance().error(f"Error listing inputs: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/inputs/<input_name>/", methods=["GET"])
    def get_input_crud(input_name):
        """Get input configuration with status information."""
        try:
            result = flask_app.input_manager.get_input_with_status(input_name)
            if not result:
                return jsonify({"error": f"Input '{input_name}' not found"}), 404
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error getting input: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/inputs/<input_name>/save/", methods=["POST"])
    def save_input_crud(input_name):
        """Save an input configuration to cache (draft state)."""
        try:
            input_config = request.get_json(silent=True)
            if not input_config:
                return jsonify({"error": "Input configuration is required"}), 400

            # Ensure name matches URL parameter
            input_config["name"] = input_name

            input_obj = flask_app.input_manager.save_from_config(input_config)
            status = flask_app.input_manager.get_status(input_name)
            return (
                jsonify(
                    {
                        "message": "Input saved to cache",
                        "input": input_name,
                        "status": status.value if status else None,
                    }
                ),
                200,
            )
        except ValidationError as e:
            Logger.instance().debug(f"Input validation failed: {e}")
            first_error = e.errors()[0]
            return (
                jsonify(
                    {
                        "error": f"Invalid input configuration: {first_error['loc']}: {first_error['msg']}"
                    }
                ),
                400,
            )
        except Exception as e:
            Logger.instance().error(f"Error saving input: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/inputs/<input_name>/", methods=["DELETE"])
    def delete_input_crud(input_name):
        """Mark an input for deletion (will be removed from YAML on publish)."""
        try:
            marked = flask_app.input_manager.mark_for_deletion(input_name)
            if marked:
                return (
                    jsonify(
                        {
                            "message": f"Input '{input_name}' marked for deletion",
                            "status": "deleted",
                        }
                    ),
                    200,
                )
            else:
                return jsonify({"error": f"Input '{input_name}' not found"}), 404
        except Exception as e:
            Logger.instance().error(f"Error deleting input: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/inputs/<input_name>/validate/", methods=["POST"])
    def validate_input_crud(input_name):
        """Validate an input configuration without saving it."""
        try:
            input_config = request.get_json(silent=True)
            if not input_config:
                return jsonify({"error": "Input configuration is required"}), 400

            # Ensure name matches URL parameter
            input_config["name"] = input_name

            result = flask_app.input_manager.validate_config(input_config)
            if result.get("valid"):
                return jsonify(result), 200
            else:
                return jsonify(result), 400
        except Exception as e:
            Logger.instance().error(f"Error validating input: {str(e)}")
            return jsonify({"error": str(e)}), 500
