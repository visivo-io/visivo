from flask import jsonify, request
from pydantic import ValidationError
from visivo.logger.logger import Logger


def register_metric_views(app, flask_app, output_dir):
    """Register metric-related API endpoints."""

    @app.route("/api/metrics/", methods=["GET"])
    def list_all_metrics():
        """List all metrics (cached + published) with status."""
        try:
            # Get cached models to include their model-scoped metrics
            cached_models = list(flask_app.model_manager.cached_objects.values())
            # Build model statuses dict
            model_statuses = {}
            for model_name in flask_app.model_manager.cached_objects.keys():
                status = flask_app.model_manager.get_status(model_name)
                if status:
                    model_statuses[model_name] = status

            metrics = flask_app.metric_manager.get_all_metrics_with_status(
                cached_models=cached_models, model_statuses=model_statuses
            )
            return jsonify({"metrics": metrics})
        except Exception as e:
            Logger.instance().error(f"Error listing metrics: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/metrics/<metric_name>/", methods=["GET"])
    def get_metric(metric_name):
        """Get metric configuration with status information."""
        try:
            result = flask_app.metric_manager.get_metric_with_status(metric_name)
            if not result:
                return jsonify({"error": f"Metric '{metric_name}' not found"}), 404
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error getting metric: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/metrics/<metric_name>/save/", methods=["POST"])
    def save_metric(metric_name):
        """Save a metric configuration to cache (draft state)."""
        try:
            metric_config = request.get_json(silent=True)
            if not metric_config:
                return jsonify({"error": "Metric configuration is required"}), 400

            # Ensure name matches URL parameter
            metric_config["name"] = metric_name

            metric = flask_app.metric_manager.save_from_config(metric_config)
            status = flask_app.metric_manager.get_status(metric_name)
            return (
                jsonify(
                    {
                        "message": "Metric saved to cache",
                        "metric": metric_name,
                        "status": status.value if status else None,
                    }
                ),
                200,
            )
        except ValidationError as e:
            Logger.instance().debug(f"Metric validation failed: {e}")
            first_error = e.errors()[0]
            return (
                jsonify(
                    {
                        "error": f"Invalid metric configuration: {first_error['loc']}: {first_error['msg']}"
                    }
                ),
                400,
            )
        except Exception as e:
            Logger.instance().error(f"Error saving metric: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/metrics/<metric_name>/", methods=["DELETE"])
    def delete_metric(metric_name):
        """Mark a metric for deletion (will be removed from YAML on publish)."""
        try:
            marked = flask_app.metric_manager.mark_for_deletion(metric_name)
            if marked:
                return (
                    jsonify(
                        {
                            "message": f"Metric '{metric_name}' marked for deletion",
                            "status": "deleted",
                        }
                    ),
                    200,
                )
            else:
                return jsonify({"error": f"Metric '{metric_name}' not found"}), 404
        except Exception as e:
            Logger.instance().error(f"Error deleting metric: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/metrics/<metric_name>/validate/", methods=["POST"])
    def validate_metric(metric_name):
        """Validate a metric configuration without saving it."""
        try:
            metric_config = request.get_json(silent=True)
            if not metric_config:
                return jsonify({"error": "Metric configuration is required"}), 400

            # Ensure name matches URL parameter
            metric_config["name"] = metric_name

            result = flask_app.metric_manager.validate_config(metric_config)
            if result.get("valid"):
                return jsonify(result), 200
            else:
                return jsonify(result), 400
        except Exception as e:
            Logger.instance().error(f"Error validating metric: {str(e)}")
            return jsonify({"error": str(e)}), 500
