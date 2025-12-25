from flask import jsonify, request
from pydantic import ValidationError
from visivo.logger.logger import Logger


def register_dimension_views(app, flask_app, output_dir):
    """Register dimension-related API endpoints."""

    @app.route("/api/dimensions/", methods=["GET"])
    def list_all_dimensions():
        """List all dimensions (cached + published) with status."""
        try:
            # Get cached models to include their model-scoped dimensions
            cached_models = list(flask_app.model_manager.cached_objects.values())
            # Build model statuses dict
            model_statuses = {}
            for model_name in flask_app.model_manager.cached_objects.keys():
                status = flask_app.model_manager.get_status(model_name)
                if status:
                    model_statuses[model_name] = status

            dimensions = flask_app.dimension_manager.get_all_dimensions_with_status(
                cached_models=cached_models, model_statuses=model_statuses
            )
            return jsonify({"dimensions": dimensions})
        except Exception as e:
            Logger.instance().error(f"Error listing dimensions: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/dimensions/<dimension_name>/", methods=["GET"])
    def get_dimension(dimension_name):
        """Get dimension configuration with status information."""
        try:
            result = flask_app.dimension_manager.get_dimension_with_status(dimension_name)
            if not result:
                return jsonify({"error": f"Dimension '{dimension_name}' not found"}), 404
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error getting dimension: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/dimensions/<dimension_name>/save/", methods=["POST"])
    def save_dimension(dimension_name):
        """Save a dimension configuration to cache (draft state)."""
        try:
            dimension_config = request.get_json(silent=True)
            if not dimension_config:
                return jsonify({"error": "Dimension configuration is required"}), 400

            # Ensure name matches URL parameter
            dimension_config["name"] = dimension_name

            dimension = flask_app.dimension_manager.save_from_config(dimension_config)
            status = flask_app.dimension_manager.get_status(dimension_name)
            return (
                jsonify(
                    {
                        "message": "Dimension saved to cache",
                        "dimension": dimension_name,
                        "status": status.value if status else None,
                    }
                ),
                200,
            )
        except ValidationError as e:
            Logger.instance().debug(f"Dimension validation failed: {e}")
            first_error = e.errors()[0]
            return (
                jsonify(
                    {
                        "error": f"Invalid dimension configuration: {first_error['loc']}: {first_error['msg']}"
                    }
                ),
                400,
            )
        except Exception as e:
            Logger.instance().error(f"Error saving dimension: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/dimensions/<dimension_name>/", methods=["DELETE"])
    def delete_dimension(dimension_name):
        """Mark a dimension for deletion (will be removed from YAML on publish)."""
        try:
            marked = flask_app.dimension_manager.mark_for_deletion(dimension_name)
            if marked:
                return (
                    jsonify(
                        {
                            "message": f"Dimension '{dimension_name}' marked for deletion",
                            "status": "deleted",
                        }
                    ),
                    200,
                )
            else:
                return jsonify({"error": f"Dimension '{dimension_name}' not found"}), 404
        except Exception as e:
            Logger.instance().error(f"Error deleting dimension: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/dimensions/<dimension_name>/validate/", methods=["POST"])
    def validate_dimension(dimension_name):
        """Validate a dimension configuration without saving it."""
        try:
            dimension_config = request.get_json(silent=True)
            if not dimension_config:
                return jsonify({"error": "Dimension configuration is required"}), 400

            # Ensure name matches URL parameter
            dimension_config["name"] = dimension_name

            result = flask_app.dimension_manager.validate_config(dimension_config)
            if result.get("valid"):
                return jsonify(result), 200
            else:
                return jsonify(result), 400
        except Exception as e:
            Logger.instance().error(f"Error validating dimension: {str(e)}")
            return jsonify({"error": str(e)}), 500
