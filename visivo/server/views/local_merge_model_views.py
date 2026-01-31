from flask import jsonify, request
from pydantic import ValidationError
from visivo.logger.logger import Logger


def register_local_merge_model_views(app, flask_app, output_dir):
    """Register LocalMergeModel CRUD API endpoints."""

    @app.route("/api/local-merge-models/", methods=["GET"])
    def list_all_local_merge_models():
        try:
            models = flask_app.local_merge_model_manager.get_all_with_status()
            return jsonify({"local_merge_models": models})
        except Exception as e:
            Logger.instance().error(f"Error listing local merge models: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/local-merge-models/<model_name>/", methods=["GET"])
    def get_local_merge_model(model_name):
        try:
            result = flask_app.local_merge_model_manager.get_with_status(model_name)
            if not result:
                return (
                    jsonify({"error": f"LocalMergeModel '{model_name}' not found"}),
                    404,
                )
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error getting local merge model: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/local-merge-models/<model_name>/save/", methods=["POST"])
    def save_local_merge_model(model_name):
        try:
            config = request.get_json(silent=True)
            if not config:
                return (
                    jsonify({"error": "LocalMergeModel configuration is required"}),
                    400,
                )

            config["name"] = model_name

            model = flask_app.local_merge_model_manager.save_from_config(config)
            status = flask_app.local_merge_model_manager.get_status(model_name)
            return (
                jsonify(
                    {
                        "message": "LocalMergeModel saved to cache",
                        "model": model_name,
                        "status": status.value if status else None,
                    }
                ),
                200,
            )
        except ValidationError as e:
            Logger.instance().debug(f"LocalMergeModel validation failed: {e}")
            first_error = e.errors()[0]
            return (
                jsonify(
                    {
                        "error": f"Invalid LocalMergeModel configuration: {first_error['loc']}: {first_error['msg']}"
                    }
                ),
                400,
            )
        except Exception as e:
            Logger.instance().error(f"Error saving local merge model: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/local-merge-models/<model_name>/", methods=["DELETE"])
    def delete_local_merge_model(model_name):
        try:
            marked = flask_app.local_merge_model_manager.mark_for_deletion(model_name)
            if marked:
                return (
                    jsonify(
                        {
                            "message": f"LocalMergeModel '{model_name}' marked for deletion",
                            "status": "deleted",
                        }
                    ),
                    200,
                )
            else:
                return (
                    jsonify({"error": f"LocalMergeModel '{model_name}' not found"}),
                    404,
                )
        except Exception as e:
            Logger.instance().error(f"Error deleting local merge model: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/local-merge-models/<model_name>/validate/", methods=["POST"])
    def validate_local_merge_model(model_name):
        try:
            config = request.get_json(silent=True)
            if not config:
                return (
                    jsonify({"error": "LocalMergeModel configuration is required"}),
                    400,
                )

            config["name"] = model_name

            result = flask_app.local_merge_model_manager.validate_config(config)
            if result.get("valid"):
                return jsonify(result), 200
            else:
                return jsonify(result), 400
        except Exception as e:
            Logger.instance().error(f"Error validating local merge model: {str(e)}")
            return jsonify({"error": str(e)}), 500
