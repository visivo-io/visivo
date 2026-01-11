import json
import os
from flask import jsonify, request

from visivo.logger.logger import Logger
from visivo.models.base.named_model import alpha_hash


def register_insight_views(app, flask_app, output_dir):

    @app.route("/api/insight-jobs/", methods=["GET"])
    def get_insights_api():
        try:
            insight_names = request.args.getlist("insight_names")
            project_id = request.args.get("project_id")

            if not insight_names:
                return jsonify({"message": "insight_names parameter is required"}), 400

            insights = []
            missing_insights = []

            for name in insight_names:
                # Use alpha_hash to match backend name_hash() method
                name_hash = alpha_hash(name)
                insight_file = os.path.join(output_dir, "insights", f"{name_hash}.json")

                if not os.path.exists(insight_file):
                    Logger.instance().info(f"Insight file not found: {insight_file}")
                    missing_insights.append(name)
                    continue

                try:
                    with open(insight_file, "r") as f:
                        file_contents = json.load(f)

                    # Start with ID
                    insight_data = {"id": name}

                    # Merge file contents
                    insight_data.update(file_contents)

                    # Convert file paths to proper API URLs
                    if "files" in insight_data:
                        for file_ref in insight_data["files"]:
                            if "signed_data_file_url" in file_ref:
                                file_path = file_ref["signed_data_file_url"]
                                # Convert absolute paths to API URLs
                                # file_path format: {output_dir}/files/{hash}.parquet
                                # Extract hash (filename without extension)
                                filename = os.path.basename(file_path)
                                file_hash = os.path.splitext(filename)[
                                    0
                                ]  # Remove .parquet extension
                                file_ref["signed_data_file_url"] = f"/api/files/{file_hash}/"

                    insights.append(insight_data)
                    Logger.instance().debug(
                        f"Loaded insight '{name}' with {len(insight_data.get('files', []))} files"
                    )

                except json.JSONDecodeError as e:
                    Logger.instance().error(
                        f"Invalid JSON in insight file {insight_file}: {str(e)}"
                    )
                    return jsonify({"message": f"Invalid JSON in insight '{name}'"}), 500
                except Exception as e:
                    Logger.instance().error(f"Error loading insight '{name}': {str(e)}")
                    return jsonify({"message": f"Error loading insight '{name}': {str(e)}"}), 500

            if missing_insights:
                Logger.instance().info(f"Missing insight files: {missing_insights}")
                if not insights:
                    return (
                        jsonify({"message": f"No insight files found for: {missing_insights}"}),
                        404,
                    )

            return jsonify(insights)

        except Exception as e:
            Logger.instance().error(f"Error fetching insights data: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/insight-jobs/hash", methods=["POST"])
    def compute_insight_hash():
        """Compute name_hash for a given insight or model name.

        This ensures the frontend uses the same hashing logic as the backend.
        POST body: {"name": "insight_or_model_name"}
        Returns: {"name_hash": "m..."}
        """
        try:
            data = request.get_json()
            if not data or "name" not in data:
                return jsonify({"message": "name field is required in request body"}), 400

            name = data["name"]
            # Use alpha_hash to match backend name_hash() method
            name_hash = alpha_hash(name)

            Logger.instance().debug(f"Computed hash for '{name}': {name_hash}")
            return jsonify({"name": name, "name_hash": name_hash})

        except Exception as e:
            Logger.instance().error(f"Error computing hash: {str(e)}")
            return jsonify({"message": str(e)}), 500
