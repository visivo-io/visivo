import json
import os
import threading
from flask import jsonify, request

from visivo.logger.logger import Logger
from visivo.models.base.named_model import alpha_hash
from visivo.server.managers.preview_job_manager import PreviewJobManager, JobStatus


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

            # Create job via PreviewJobManager
            job_manager = PreviewJobManager.instance()
            job_id = job_manager.create_job(config, object_type="insight")

            # Execute job in background thread
            def execute_job():
                from pydantic import TypeAdapter, ValidationError
                from visivo.models.insight import Insight
                from visivo.jobs.filtered_runner import FilteredRunner

                try:
                    # Update status to running
                    job_manager.update_status(
                        job_id, JobStatus.RUNNING, progress=0.1, progress_message="Validating config"
                    )

                    # Validate insight config
                    insight_adapter = TypeAdapter(Insight)
                    insight = insight_adapter.validate_python(config)

                    # If insight doesn't have a name, assign a temporary one
                    if not insight.name:
                        insight.name = f"preview_{job_id[:8]}"

                    # Update progress: preparing
                    job_manager.update_status(
                        job_id,
                        JobStatus.RUNNING,
                        progress=0.2,
                        progress_message="Preparing execution",
                    )

                    # Add the insight to the project DAG temporarily
                    project_dag = flask_app.project.dag()
                    project_dag.add_node(insight)

                    # Get dependent models and add edges
                    from visivo.models.dag import all_descendants_of_type
                    from visivo.models.models.model import Model

                    dependent_models = all_descendants_of_type(
                        type=Model, dag=project_dag, from_node=insight
                    )
                    for model in dependent_models:
                        project_dag.add_edge(model, insight)

                    # Execute with FilteredRunner using run_id for custom file naming
                    # Use dag_filter to run only this specific insight
                    job_manager.update_status(
                        job_id,
                        JobStatus.RUNNING,
                        progress=0.5,
                        progress_message=f"Executing query for {insight.name or 'preview'}",
                    )

                    runner = FilteredRunner(
                        project=flask_app.project,
                        output_dir=output_dir,
                        threads=1,
                        soft_failure=True,
                        dag_filter=f"+{insight.name}+",  # Filter to run only this insight
                        server_url="",
                        working_dir=flask_app.project.path or "",
                        run_id=job_id,
                    )

                    # Run the filtered DAG (this will execute the insight job with dependencies)
                    runner.run()

                    # Check if job succeeded by looking at the DagRunner results
                    # FilteredRunner iterates over filtered DAGs, so we need to check if any failed
                    # For preview, we only have one insight, so we can check the file output
                    insight_path = f"{output_dir}/insights/{job_id}.json"
                    if os.path.exists(insight_path):
                        # Load result metadata
                        job_manager.update_status(
                            job_id,
                            JobStatus.RUNNING,
                            progress=0.9,
                            progress_message="Finalizing results",
                        )

                        import json

                        with open(insight_path, "r") as f:
                            insight_data = json.load(f)

                        # Convert file paths to API URLs
                        for file_info in insight_data.get("files", []):
                            file_path = file_info.get("signed_data_file_url", "")
                            if file_path:
                                filename = os.path.basename(file_path)
                                name_hash = filename.replace(".parquet", "")
                                file_info["signed_data_file_url"] = f"/api/files/{name_hash}/"

                        job_manager.set_result(job_id, insight_data)
                    else:
                        # Job failed - file not created
                        error_msg = f"Preview job failed: output file not created"
                        job_manager.update_status(
                            job_id,
                            JobStatus.FAILED,
                            error=error_msg,
                            error_details={"item_name": insight.name or "preview"},
                        )

                except ValidationError as e:
                    error_msg = f"Invalid insight configuration: {str(e)}"
                    Logger.instance().error(error_msg)
                    job_manager.update_status(
                        job_id,
                        JobStatus.FAILED,
                        error=error_msg,
                        error_details={"errors": e.errors()},
                    )

                except Exception as e:
                    error_msg = f"Preview job failed: {str(e)}"
                    Logger.instance().error(error_msg, exc_info=True)
                    job_manager.update_status(
                        job_id,
                        JobStatus.FAILED,
                        error=error_msg,
                        error_details={"exception": str(e)},
                    )

            # Start background thread
            thread = threading.Thread(target=execute_job, daemon=True)
            thread.start()

            Logger.instance().info(f"Started preview job {job_id}")
            return jsonify({"job_id": job_id}), 202  # 202 Accepted

        except Exception as e:
            Logger.instance().error(f"Error creating preview job: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/insight-jobs/<job_id>/status", methods=["GET"])
    def get_job_status(job_id):
        """Get status of a preview job.

        Returns: {
            "job_id": "uuid",
            "status": "queued|running|completed|failed",
            "progress": 0.0-1.0,
            "progress_message": "...",
            "error": "..." (if failed)
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

    @app.route("/api/insight-jobs/<job_id>/result", methods=["GET"])
    def get_job_result(job_id):
        """Get result of a completed preview job.

        Returns the insight metadata (same format as GET /api/insight-jobs/)
        """
        try:
            job_manager = PreviewJobManager.instance()
            job = job_manager.get_job(job_id)

            if not job:
                return jsonify({"message": f"Job {job_id} not found"}), 404

            if job.status != JobStatus.COMPLETED:
                return (
                    jsonify(
                        {
                            "message": f"Job not completed. Current status: {job.status.value}",
                            "status": job.status.value,
                        }
                    ),
                    400,
                )

            if not job.result:
                return jsonify({"message": "Job completed but no result available"}), 500

            return jsonify(job.result)

        except Exception as e:
            Logger.instance().error(f"Error getting job result: {str(e)}")
            return jsonify({"message": str(e)}), 500
