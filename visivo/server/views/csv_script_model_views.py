from flask import jsonify, request
from pydantic import ValidationError
from visivo.logger.logger import Logger


def register_csv_script_model_views(app, flask_app, output_dir):
    """Register CsvScriptModel CRUD API endpoints."""

    @app.route("/api/csv-script-models/", methods=["GET"])
    def list_all_csv_script_models():
        try:
            models = flask_app.csv_script_model_manager.get_all_with_status()
            return jsonify({"csv_script_models": models})
        except Exception as e:
            Logger.instance().error(f"Error listing csv script models: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/csv-script-models/<model_name>/", methods=["GET"])
    def get_csv_script_model(model_name):
        try:
            result = flask_app.csv_script_model_manager.get_with_status(model_name)
            if not result:
                return (
                    jsonify({"error": f"CsvScriptModel '{model_name}' not found"}),
                    404,
                )
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error getting csv script model: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/csv-script-models/<model_name>/save/", methods=["POST"])
    def save_csv_script_model(model_name):
        try:
            config = request.get_json(silent=True)
            if not config:
                return (
                    jsonify({"error": "CsvScriptModel configuration is required"}),
                    400,
                )

            config["name"] = model_name

            model = flask_app.csv_script_model_manager.save_from_config(config)
            status = flask_app.csv_script_model_manager.get_status(model_name)
            return (
                jsonify(
                    {
                        "message": "CsvScriptModel saved to cache",
                        "model": model_name,
                        "status": status.value if status else None,
                    }
                ),
                200,
            )
        except ValidationError as e:
            Logger.instance().debug(f"CsvScriptModel validation failed: {e}")
            first_error = e.errors()[0]
            return (
                jsonify(
                    {
                        "error": f"Invalid CsvScriptModel configuration: {first_error['loc']}: {first_error['msg']}"
                    }
                ),
                400,
            )
        except Exception as e:
            Logger.instance().error(f"Error saving csv script model: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/csv-script-models/<model_name>/", methods=["DELETE"])
    def delete_csv_script_model(model_name):
        try:
            marked = flask_app.csv_script_model_manager.mark_for_deletion(model_name)
            if marked:
                return (
                    jsonify(
                        {
                            "message": f"CsvScriptModel '{model_name}' marked for deletion",
                            "status": "deleted",
                        }
                    ),
                    200,
                )
            else:
                return (
                    jsonify({"error": f"CsvScriptModel '{model_name}' not found"}),
                    404,
                )
        except Exception as e:
            Logger.instance().error(f"Error deleting csv script model: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/csv-script-models/<model_name>/validate/", methods=["POST"])
    def validate_csv_script_model(model_name):
        try:
            config = request.get_json(silent=True)
            if not config:
                return (
                    jsonify({"error": "CsvScriptModel configuration is required"}),
                    400,
                )

            config["name"] = model_name

            result = flask_app.csv_script_model_manager.validate_config(config)
            if result.get("valid"):
                return jsonify(result), 200
            else:
                return jsonify(result), 400
        except Exception as e:
            Logger.instance().error(f"Error validating csv script model: {str(e)}")
            return jsonify({"error": str(e)}), 500
