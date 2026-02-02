import os

from flask import Response, jsonify, request, send_from_directory
from pydantic import ValidationError

from visivo.logger.logger import Logger
from visivo.models.base.named_model import alpha_hash


def register_dashboard_views(app, flask_app, output_dir):
    @app.route("/api/dashboards/<dashboard_name>/", methods=["GET"])
    def get_dashboard_api(dashboard_name):
        """API endpoint for dashboard data"""
        try:
            dashboard_name_hash = alpha_hash(dashboard_name)
            thumbnail_path = os.path.join("dashboards", f"{dashboard_name_hash}.png")
            thumbnail_exists = os.path.exists(os.path.join(output_dir, thumbnail_path))

            return jsonify(
                {
                    "id": dashboard_name,
                    "name": dashboard_name,
                    "signed_thumbnail_file_url": (
                        f"/api/dashboards/{dashboard_name_hash}.png/" if thumbnail_exists else None
                    ),
                }
            )
        except Exception as e:
            Logger.instance().error(f"Error fetching dashboard data: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/dashboards/<dashboard_name_hash>.png/", methods=["GET"])
    def get_thumbnail_api(dashboard_name_hash):
        try:
            thumbnail_path = os.path.join("dashboards", f"{dashboard_name_hash}.png")
            if not os.path.exists(os.path.join(output_dir, thumbnail_path)):
                Logger.instance().debug(f"Thumbnail not found at path: {thumbnail_path}")
                return Response(status=404)

            return send_from_directory(output_dir, thumbnail_path)
        except Exception as e:
            Logger.instance().error(f"Error retrieving thumbnail: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/dashboards/<dashboard_name_hash>.png/", methods=["POST"])
    def create_thumbnail_api(dashboard_name_hash):
        try:
            if "file" not in request.files:
                return jsonify({"message": "No file provided"}), 400

            file = request.files["file"]
            if file.filename == "" or not file.filename.endswith(".png"):
                return jsonify({"message": "Invalid file - must be a PNG"}), 400

            dashboard_dir = os.path.join(output_dir, "dashboards")
            os.makedirs(dashboard_dir, exist_ok=True)

            thumbnail_path = os.path.join(dashboard_dir, f"{dashboard_name_hash}.png")

            file.save(thumbnail_path)

            return jsonify(
                {
                    "signed_thumbnail_file_url": f"/api/dashboards/{dashboard_name_hash}.png/",
                }
            )

        except Exception as e:
            Logger.instance().error(f"Error creating thumbnail: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/dashboards/", methods=["GET"])
    def list_all_dashboards():
        """List all dashboards (cached + published) with status."""
        try:
            dashboards = flask_app.dashboard_manager.get_all_dashboards_with_status()
            return jsonify({"dashboards": dashboards})
        except Exception as e:
            Logger.instance().error(f"Error listing dashboards: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/dashboards/<dashboard_name>/save/", methods=["POST"])
    def save_dashboard_crud(dashboard_name):
        """Save a dashboard configuration to cache (draft state)."""
        try:
            config = request.get_json(silent=True)
            if not config:
                return jsonify({"error": "Dashboard configuration is required"}), 400

            config["name"] = dashboard_name

            dashboard = flask_app.dashboard_manager.save_from_config(config)
            status = flask_app.dashboard_manager.get_status(dashboard_name)
            return (
                jsonify(
                    {
                        "message": "Dashboard saved to cache",
                        "dashboard": dashboard_name,
                        "status": status.value if status else None,
                    }
                ),
                200,
            )
        except ValidationError as e:
            Logger.instance().debug(f"Dashboard validation failed: {e}")
            first_error = e.errors()[0]
            return (
                jsonify(
                    {
                        "error": f"Invalid dashboard configuration: {first_error['loc']}: {first_error['msg']}"
                    }
                ),
                400,
            )
        except Exception as e:
            Logger.instance().error(f"Error saving dashboard: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/dashboards/<dashboard_name>/delete/", methods=["DELETE"])
    def delete_dashboard_crud(dashboard_name):
        """Mark a dashboard for deletion."""
        try:
            marked = flask_app.dashboard_manager.mark_for_deletion(dashboard_name)
            if marked:
                return (
                    jsonify(
                        {
                            "message": f"Dashboard '{dashboard_name}' marked for deletion",
                            "status": "deleted",
                        }
                    ),
                    200,
                )
            else:
                return (
                    jsonify({"error": f"Dashboard '{dashboard_name}' not found"}),
                    404,
                )
        except Exception as e:
            Logger.instance().error(f"Error deleting dashboard: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/dashboards/<dashboard_name>/validate/", methods=["POST"])
    def validate_dashboard_crud(dashboard_name):
        """Validate a dashboard configuration without saving it."""
        try:
            config = request.get_json(silent=True)
            if not config:
                return jsonify({"error": "Dashboard configuration is required"}), 400

            config["name"] = dashboard_name

            result = flask_app.dashboard_manager.validate_config(config)
            if result.get("valid"):
                return jsonify(result), 200
            else:
                return jsonify(result), 400
        except Exception as e:
            Logger.instance().error(f"Error validating dashboard: {str(e)}")
            return jsonify({"error": str(e)}), 500
