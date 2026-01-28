import json
import os
import threading
from flask import jsonify, request

from visivo.logger.logger import Logger
from visivo.models.base.named_model import alpha_hash
from visivo.server.managers.preview_job_manager import PreviewJobManager, JobStatus
from visivo.server.jobs.preview_job_executor import execute_insight_preview_job
from visivo.constants import DEFAULT_RUN_ID


def register_insight_views(app, flask_app, output_dir):

    @app.route("/api/insight-jobs/", methods=["GET"])
    def get_insights_api():
        try:
            insight_names = request.args.getlist("insight_names")
            project_id = request.args.get("project_id")
            run_id = request.args.get("run_id", DEFAULT_RUN_ID)

            if not insight_names:
                return jsonify({"message": "insight_names parameter is required"}), 400

            insights = []
            missing_insights = []

            for name in insight_names:
                name_hash = alpha_hash(name)
                insight_file = os.path.join(output_dir, run_id, "insights", f"{name_hash}.json")

                if not os.path.exists(insight_file):
                    Logger.instance().info(f"Insight file not found: {insight_file}")
                    missing_insights.append(name)
                    continue

                try:
                    with open(insight_file, "r") as f:
                        file_contents = json.load(f)

                    insight_data = {"id": name}
                    insight_data.update(file_contents)

                    if "files" in insight_data:
                        for file_ref in insight_data["files"]:
                            if "signed_data_file_url" in file_ref:
                                file_path = file_ref["signed_data_file_url"]
                                filename = os.path.basename(file_path)
                                file_hash = os.path.splitext(filename)[0]
                                file_ref["signed_data_file_url"] = (
                                    f"/api/files/{file_hash}/{run_id}/"
                                )

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
            name_hash = alpha_hash(name)

            Logger.instance().debug(f"Computed hash for '{name}': {name_hash}")
            return jsonify({"name": name, "name_hash": name_hash})

        except Exception as e:
            Logger.instance().error(f"Error computing hash: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/insight-jobs/", methods=["POST"])
    def run_insight_preview():
        """Execute a preview job for an unsaved/modified insight.

        POST body: {
            "config": {...},  # Insight configuration
            "run": true       # Flag to execute the job
        }
        Returns: {"job_id": "uuid"}
        """
        try:
            data = request.get_json()
            if not data:
                return jsonify({"message": "Request body is required"}), 400

            # Check if this is a preview job execution request
            if not data.get("run"):
                return jsonify({"message": "run parameter must be true to execute preview"}), 400

            config = data.get("config")
            if not config:
                return jsonify({"message": "config field is required"}), 400

            # Create job via PreviewJobManager (or get existing job if already running)
            job_manager = PreviewJobManager.instance()
            existing_job_id = job_manager.find_existing_job(config, object_type="insight")

            if existing_job_id:
                # Job with this config already exists and is running
                Logger.instance().info(f"Returning existing preview job {existing_job_id}")
                return jsonify({"job_id": existing_job_id}), 202  # 202 Accepted

            # Create new job
            job_id = job_manager.create_job(config, object_type="insight")

            # Execute job in background thread
            thread = threading.Thread(
                target=execute_insight_preview_job,
                args=(job_id, config, flask_app, output_dir, job_manager),
                daemon=True,
            )
            thread.start()

            Logger.instance().info(f"Started preview job {job_id}")
            return jsonify({"job_id": job_id}), 202  # 202 Accepted

        except Exception as e:
            Logger.instance().error(f"Error creating preview job: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/insight-jobs/<job_id>/", methods=["GET"])
    def get_insight_job_status(job_id):
        """Get status and result of a preview job.

        Returns: {
            "job_id": "uuid",
            "status": "queued|running|completed|failed",
            "progress": 0.0-1.0,
            "progress_message": "...",
            "error": "..." (if failed),
            "result": {...} (only present when status is "completed")
        }
        """
        try:
            job_manager = PreviewJobManager.instance()
            job = job_manager.get_job(job_id)

            if not job:
                return jsonify({"message": f"Job {job_id} not found"}), 404

            return jsonify(job.to_dict())

        except Exception as e:
            Logger.instance().error(f"Error getting job status: {str(e)}")
            return jsonify({"message": str(e)}), 500
