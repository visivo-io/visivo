"""Model Query Jobs API endpoints for async SQL query execution."""

import threading
from flask import jsonify, request

from visivo.logger.logger import Logger
from visivo.server.managers.model_query_job_manager import ModelQueryJobManager
from visivo.server.jobs.model_query_job_executor import execute_model_query_job


def register_model_query_jobs_views(app, flask_app, output_dir):

    @app.route("/api/model-query-jobs/", methods=["POST"])
    def start_model_query_job():
        """Start a new SQL query execution job.

        POST body: {
            "source_name": "source_name",  # Required: name of source to query
            "sql": "SELECT * FROM ..."     # Required: SQL query to execute
        }
        Returns: {"job_id": "uuid", "status": "queued"}
        """
        try:
            Logger.instance().info("Received POST to /api/model-query-jobs/")
            data = request.get_json(silent=True)

            if not data:
                return jsonify({"error": "Request body is required"}), 400

            source_name = data.get("source_name")
            sql = data.get("sql")

            if not source_name:
                return jsonify({"error": "source_name is required"}), 400

            if not sql:
                return jsonify({"error": "sql is required"}), 400

            # Create the job configuration
            # Source validation is handled by FilteredRunner during execution
            config = {
                "source_name": source_name,
                "sql": sql,
            }

            # Create job via ModelQueryJobManager
            job_manager = ModelQueryJobManager.instance()
            job_id = job_manager.create_job(config)

            # Execute job in background thread
            thread = threading.Thread(
                target=execute_model_query_job,
                args=(job_id, config, flask_app, output_dir, job_manager),
                daemon=True,
            )
            thread.start()

            Logger.instance().info(f"Started model query job {job_id}")
            return jsonify({"job_id": job_id, "status": "queued"}), 202

        except Exception as e:
            Logger.instance().error(f"Error creating model query job: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/model-query-jobs/<job_id>/", methods=["GET"])
    def get_model_query_job_status(job_id):
        """Get status and result of a query job.

        Returns: {
            "job_id": "uuid",
            "status": "queued|running|completed|failed|cancelled",
            "progress": 0.0-1.0,
            "progress_message": "...",
            "error": "..." (if failed),
            "result": {...} (only present when status is "completed")
        }

        Result format when completed:
        {
            "columns": ["col1", "col2", ...],
            "rows": [{"col1": val1, "col2": val2}, ...],
            "row_count": 100,
            "execution_time_ms": 150,
            "source_name": "my_source"
        }
        """
        try:
            job_manager = ModelQueryJobManager.instance()
            job = job_manager.get_job(job_id)

            if not job:
                return jsonify({"error": f"Job {job_id} not found"}), 404

            return jsonify(job.to_dict())

        except Exception as e:
            Logger.instance().error(f"Error getting model query job status: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/model-query-jobs/<job_id>/", methods=["DELETE"])
    def cancel_model_query_job(job_id):
        """Cancel a running query job.

        Returns: {"message": "Job cancelled", "job_id": "uuid"}
        """
        try:
            job_manager = ModelQueryJobManager.instance()
            job = job_manager.get_job(job_id)

            if not job:
                return jsonify({"error": f"Job {job_id} not found"}), 404

            job_manager.cancel_job(job_id)

            Logger.instance().info(f"Cancelled model query job {job_id}")
            return jsonify({"message": "Job cancelled", "job_id": job_id})

        except Exception as e:
            Logger.instance().error(f"Error cancelling model query job: {str(e)}")
            return jsonify({"error": str(e)}), 500
