from flask import jsonify, request
from pydantic import ValidationError
from visivo.logger.logger import Logger


def register_model_views(app, flask_app, output_dir):
    """Register model-related API endpoints."""

    @app.route("/api/models/", methods=["GET"])
    def list_all_models():
        """List all models (cached + published) with status."""
        try:
            models = flask_app.model_manager.get_all_models_with_status()
            return jsonify({"models": models})
        except Exception as e:
            Logger.instance().error(f"Error listing models: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/models/<model_name>/", methods=["GET"])
    def get_model(model_name):
        """Get model configuration with status information."""
        try:
            result = flask_app.model_manager.get_model_with_status(model_name)
            if not result:
                return jsonify({"error": f"Model '{model_name}' not found"}), 404
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error getting model: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/models/<model_name>/save/", methods=["POST"])
    def save_model(model_name):
        """Save a model configuration to cache (draft state)."""
        try:
            model_config = request.get_json(silent=True)
            if not model_config:
                return jsonify({"error": "Model configuration is required"}), 400

            # Ensure name matches URL parameter
            model_config["name"] = model_name

            model = flask_app.model_manager.save_from_config(model_config)
            status = flask_app.model_manager.get_status(model_name)
            return (
                jsonify(
                    {
                        "message": "Model saved to cache",
                        "model": model_name,
                        "status": status.value if status else None,
                    }
                ),
                200,
            )
        except ValidationError as e:
            Logger.instance().debug(f"Model validation failed: {e}")
            first_error = e.errors()[0]
            return (
                jsonify(
                    {
                        "error": f"Invalid model configuration: {first_error['loc']}: {first_error['msg']}"
                    }
                ),
                400,
            )
        except Exception as e:
            Logger.instance().error(f"Error saving model: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/models/<model_name>/", methods=["DELETE"])
    def delete_model(model_name):
        """Mark a model for deletion (will be removed from YAML on publish)."""
        try:
            marked = flask_app.model_manager.mark_for_deletion(model_name)
            if marked:
                return (
                    jsonify(
                        {
                            "message": f"Model '{model_name}' marked for deletion",
                            "status": "deleted",
                        }
                    ),
                    200,
                )
            else:
                return jsonify({"error": f"Model '{model_name}' not found"}), 404
        except Exception as e:
            Logger.instance().error(f"Error deleting model: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/models/<model_name>/validate/", methods=["POST"])
    def validate_model(model_name):
        """Validate a model configuration without saving it."""
        try:
            model_config = request.get_json(silent=True)
            if not model_config:
                return jsonify({"error": "Model configuration is required"}), 400

            # Ensure name matches URL parameter
            model_config["name"] = model_name

            result = flask_app.model_manager.validate_config(model_config)
            if result.get("valid"):
                return jsonify(result), 200
            else:
                return jsonify(result), 400
        except Exception as e:
            Logger.instance().error(f"Error validating model: {str(e)}")
            return jsonify({"error": str(e)}), 500
