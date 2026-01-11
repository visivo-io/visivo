from flask import jsonify, request
from pydantic import ValidationError
from visivo.logger.logger import Logger


def register_charts_crud_views(app, flask_app, output_dir):
    """Register chart CRUD API endpoints."""

    @app.route("/api/charts/", methods=["GET"])
    def list_all_charts():
        """List all charts (cached + published) with status."""
        try:
            charts = flask_app.chart_manager.get_all_charts_with_status()
            return jsonify({"charts": charts})
        except Exception as e:
            Logger.instance().error(f"Error listing charts: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/charts/<chart_name>/", methods=["GET"])
    def get_chart_crud(chart_name):
        """Get chart configuration with status information."""
        try:
            result = flask_app.chart_manager.get_chart_with_status(chart_name)
            if not result:
                return jsonify({"error": f"Chart '{chart_name}' not found"}), 404
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error getting chart: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/charts/<chart_name>/save/", methods=["POST"])
    def save_chart_crud(chart_name):
        """Save a chart configuration to cache (draft state)."""
        try:
            chart_config = request.get_json(silent=True)
            if not chart_config:
                return jsonify({"error": "Chart configuration is required"}), 400

            # Ensure name matches URL parameter
            chart_config["name"] = chart_name

            chart = flask_app.chart_manager.save_from_config(chart_config)
            status = flask_app.chart_manager.get_status(chart_name)
            return (
                jsonify(
                    {
                        "message": "Chart saved to cache",
                        "chart": chart_name,
                        "status": status.value if status else None,
                    }
                ),
                200,
            )
        except ValidationError as e:
            Logger.instance().debug(f"Chart validation failed: {e}")
            first_error = e.errors()[0]
            return (
                jsonify(
                    {
                        "error": f"Invalid chart configuration: {first_error['loc']}: {first_error['msg']}"
                    }
                ),
                400,
            )
        except Exception as e:
            Logger.instance().error(f"Error saving chart: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/charts/<chart_name>/", methods=["DELETE"])
    def delete_chart_crud(chart_name):
        """Mark a chart for deletion (will be removed from YAML on publish)."""
        try:
            marked = flask_app.chart_manager.mark_for_deletion(chart_name)
            if marked:
                return (
                    jsonify(
                        {
                            "message": f"Chart '{chart_name}' marked for deletion",
                            "status": "deleted",
                        }
                    ),
                    200,
                )
            else:
                return jsonify({"error": f"Chart '{chart_name}' not found"}), 404
        except Exception as e:
            Logger.instance().error(f"Error deleting chart: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/charts/<chart_name>/validate/", methods=["POST"])
    def validate_chart_crud(chart_name):
        """Validate a chart configuration without saving it."""
        try:
            chart_config = request.get_json(silent=True)
            if not chart_config:
                return jsonify({"error": "Chart configuration is required"}), 400

            # Ensure name matches URL parameter
            chart_config["name"] = chart_name

            result = flask_app.chart_manager.validate_config(chart_config)
            if result.get("valid"):
                return jsonify(result), 200
            else:
                return jsonify(result), 400
        except Exception as e:
            Logger.instance().error(f"Error validating chart: {str(e)}")
            return jsonify({"error": str(e)}), 500
