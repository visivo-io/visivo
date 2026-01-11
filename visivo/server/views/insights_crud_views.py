from flask import jsonify, request
from pydantic import ValidationError
from visivo.logger.logger import Logger


def register_insights_crud_views(app, flask_app, output_dir):
    """Register insight CRUD API endpoints."""

    @app.route("/api/insights/", methods=["GET"])
    def list_all_insights():
        """List all insights (cached + published) with status."""
        try:
            insights = flask_app.insight_manager.get_all_insights_with_status()
            return jsonify({"insights": insights})
        except Exception as e:
            Logger.instance().error(f"Error listing insights: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/insights/<insight_name>/", methods=["GET"])
    def get_insight_crud(insight_name):
        """Get insight configuration with status information."""
        try:
            result = flask_app.insight_manager.get_insight_with_status(insight_name)
            if not result:
                return jsonify({"error": f"Insight '{insight_name}' not found"}), 404
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error getting insight: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/insights/<insight_name>/save/", methods=["POST"])
    def save_insight_crud(insight_name):
        """Save an insight configuration to cache (draft state)."""
        try:
            insight_config = request.get_json(silent=True)
            if not insight_config:
                return jsonify({"error": "Insight configuration is required"}), 400

            # Ensure name matches URL parameter
            insight_config["name"] = insight_name

            insight = flask_app.insight_manager.save_from_config(insight_config)
            status = flask_app.insight_manager.get_status(insight_name)
            return (
                jsonify(
                    {
                        "message": "Insight saved to cache",
                        "insight": insight_name,
                        "status": status.value if status else None,
                    }
                ),
                200,
            )
        except ValidationError as e:
            Logger.instance().debug(f"Insight validation failed: {e}")
            first_error = e.errors()[0]
            return (
                jsonify(
                    {
                        "error": f"Invalid insight configuration: {first_error['loc']}: {first_error['msg']}"
                    }
                ),
                400,
            )
        except Exception as e:
            Logger.instance().error(f"Error saving insight: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/insights/<insight_name>/", methods=["DELETE"])
    def delete_insight_crud(insight_name):
        """Mark an insight for deletion (will be removed from YAML on publish)."""
        try:
            marked = flask_app.insight_manager.mark_for_deletion(insight_name)
            if marked:
                return (
                    jsonify(
                        {
                            "message": f"Insight '{insight_name}' marked for deletion",
                            "status": "deleted",
                        }
                    ),
                    200,
                )
            else:
                return jsonify({"error": f"Insight '{insight_name}' not found"}), 404
        except Exception as e:
            Logger.instance().error(f"Error deleting insight: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/insights/<insight_name>/validate/", methods=["POST"])
    def validate_insight_crud(insight_name):
        """Validate an insight configuration without saving it."""
        try:
            insight_config = request.get_json(silent=True)
            if not insight_config:
                return jsonify({"error": "Insight configuration is required"}), 400

            # Ensure name matches URL parameter
            insight_config["name"] = insight_name

            result = flask_app.insight_manager.validate_config(insight_config)
            if result.get("valid"):
                return jsonify(result), 200
            else:
                return jsonify(result), 400
        except Exception as e:
            Logger.instance().error(f"Error validating insight: {str(e)}")
            return jsonify({"error": str(e)}), 500
