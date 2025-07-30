import hashlib
import os

from flask import Response, jsonify, request, send_from_directory

from visivo.logger.logger import Logger


def register_dashboard_views(app, flask_app, output_dir):
    @app.route("/api/dashboards/<hash>/")
    def serve_dashboard_by_hash(hash):
        """API endpoint to serve dashboard JSON by hash"""
        try:
            # Find dashboard name by hash
            if hasattr(flask_app, "_project") and flask_app._project:
                for dashboard in flask_app._project.dashboards:
                    dashboard_name = dashboard.name
                    dashboard_name_hash = hashlib.md5(dashboard_name.encode()).hexdigest()
                    if dashboard_name_hash == hash:
                        thumbnail_path = os.path.join("dashboards", f"{dashboard_name_hash}.png")
                        thumbnail_exists = os.path.exists(os.path.join(output_dir, thumbnail_path))

                        dashboard_data = {
                            "id": dashboard_name,
                            "name": dashboard_name,
                            "signed_thumbnail_file_url": (
                                f"/api/dashboards/{dashboard_name_hash}.png"
                                if thumbnail_exists
                                else None
                            ),
                        }
                        return jsonify(dashboard_data)

            return jsonify({"message": f"Dashboard not found for hash: {hash}"}), 404
        except Exception as e:
            Logger.instance().error(f"Error serving dashboard by hash: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/dashboards/<dashboard_name>/", methods=["GET"])
    def get_dashboard_api(dashboard_name):
        """API endpoint for dashboard data"""
        try:
            dashboard_name_hash = hashlib.md5(dashboard_name.encode()).hexdigest()
            thumbnail_path = os.path.join("dashboards", f"{dashboard_name_hash}.png")
            thumbnail_exists = os.path.exists(os.path.join(output_dir, thumbnail_path))

            return jsonify(
                {
                    "id": dashboard_name,
                    "name": dashboard_name,
                    "signed_thumbnail_file_url": (
                        f"/api/dashboards/{dashboard_name_hash}.png" if thumbnail_exists else None
                    ),
                }
            )
        except Exception as e:
            Logger.instance().error(f"Error fetching dashboard data: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/dashboards/<dashboard_name_hash>.png", methods=["GET"])
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

    @app.route("/api/dashboards/<dashboard_name_hash>.png", methods=["POST"])
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
                    "signed_thumbnail_file_url": f"/api/dashboards/{dashboard_name_hash}.png",
                }
            )

        except Exception as e:
            Logger.instance().error(f"Error creating thumbnail: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/data/dashboards/<dashboard_name>", methods=["GET"])
    def get_dashboard(dashboard_name):
        dashboard_name_hash = hashlib.md5(dashboard_name.encode()).hexdigest()
        thumbnail_path = os.path.join("dashboards", f"{dashboard_name_hash}.png")
        exists = os.path.exists(os.path.join(output_dir, thumbnail_path))

        return {
            "id": dashboard_name,
            "name": dashboard_name,
            "signed_thumbnail_file_url": (
                f"/data/dashboards/{dashboard_name_hash}.png" if exists else None
            ),
        }

    @app.route("/data/dashboards/<dashboard_name_hash>.png", methods=["GET"])
    def get_thumbnail(dashboard_name_hash):
        try:
            thumbnail_path = os.path.join("dashboards", f"{dashboard_name_hash}.png")
            if not os.path.exists(os.path.join(output_dir, thumbnail_path)):
                Logger.instance().debug(f"Thumbnail not found at path: {thumbnail_path}")
                return Response(status=404)

            return send_from_directory(output_dir, thumbnail_path)
        except Exception as e:
            Logger.instance().error(f"Error retrieving thumbnail: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/data/dashboards/<dashboard_name_hash>.png", methods=["POST"])
    def create_thumbnail(dashboard_name_hash):
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
                    "signed_thumbnail_file_url": f"/data/dashboards/{dashboard_name_hash}.png",
                }
            )

        except Exception as e:
            Logger.instance().error(f"Error creating thumbnail: {str(e)}")
            return jsonify({"message": str(e)}), 500
