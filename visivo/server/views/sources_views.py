from flask import jsonify, request
from pydantic import ValidationError
from visivo.logger.logger import Logger
from visivo.server.managers.object_manager import ObjectStatus
from visivo.server.managers.source_op_job_manager import SourceOpJobManager
from visivo.server.source_metadata import (
    validate_source_from_config,
)


def register_source_views(app, flask_app, output_dir):
    @app.route("/api/source-connections/", methods=["POST"])
    def test_source_connection():
        """Start a connection test for an (unsaved) config; poll for the result.

        Validation errors still answer 400 inline — there is no point minting a
        job for a request that was never going to run.
        """
        try:
            source_config = request.get_json(silent=True)
            if source_config is None:
                # Check if it's because of invalid JSON or missing body
                if request.data and len(request.data) > 0:
                    return jsonify({"error": "Invalid JSON in request body"}), 400
                else:
                    return jsonify({"error": "Source configuration is required"}), 400

            job_id = SourceOpJobManager.instance().start(
                "test_connection", lambda: validate_source_from_config(source_config)
            )
            return jsonify({"job_id": job_id, "status": "queued"}), 202
        except Exception as e:
            Logger.instance().error(f"Error starting source connection test: {str(e)}")
            return jsonify({"status": "connection_failed", "error": str(e)}), 500

    @app.route("/api/source-connections/<job_id>/", methods=["GET"])
    def test_source_connection_job(job_id):
        """Poll a test-connection job."""
        job = SourceOpJobManager.instance().get_job(job_id)
        if job is None:
            return jsonify({"error": f"Job {job_id} not found"}), 404
        return jsonify(job.to_dict())

    # ========== New SourceManager-based endpoints ==========

    @app.route("/api/sources/", methods=["GET"])
    def list_all_sources():
        """List all sources (cached + published) with status."""
        try:
            sources = flask_app.source_manager.get_all_sources_with_status()
            return jsonify({"sources": sources})
        except Exception as e:
            Logger.instance().error(f"Error listing sources: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/sources/<source_name>/", methods=["GET"])
    def get_source(source_name):
        """Get source configuration with status information."""
        try:
            result = flask_app.source_manager.get_source_with_status(source_name)
            if not result:
                return jsonify({"error": f"Source '{source_name}' not found"}), 404
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error getting source: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/sources/<source_name>/", methods=["POST"])
    def save_source(source_name):
        """Save a source configuration to cache (draft state)."""
        try:
            source_config = request.get_json(silent=True)
            if not source_config:
                return jsonify({"error": "Source configuration is required"}), 400

            # Ensure name matches URL parameter
            source_config["name"] = source_name

            source = flask_app.source_manager.save_from_config(source_config)
            status = flask_app.source_manager.get_status(source_name)
            return (
                jsonify(
                    {
                        "message": "Source saved to cache",
                        "source": source_name,
                        "status": status.value if status else None,
                    }
                ),
                201 if status == ObjectStatus.NEW else 200,
            )
        except ValidationError as e:
            Logger.instance().debug(f"Source validation failed: {e}")
            first_error = e.errors()[0]
            return (
                jsonify(
                    {
                        "error": f"Invalid source configuration: {first_error['loc']}: {first_error['msg']}"
                    }
                ),
                400,
            )
        except Exception as e:
            Logger.instance().error(f"Error saving source: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/sources/<source_name>/", methods=["DELETE"])
    def delete_source(source_name):
        """Mark a source for deletion (will be removed from YAML on publish)."""
        try:
            marked = flask_app.source_manager.mark_for_deletion(source_name)
            if marked:
                return (
                    jsonify(
                        {
                            "message": f"Source '{source_name}' marked for deletion",
                            "status": "deleted",
                        }
                    ),
                    200,
                )
            else:
                return jsonify({"error": f"Source '{source_name}' not found"}), 404
        except Exception as e:
            Logger.instance().error(f"Error deleting source: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/sources/<source_name>/validate/", methods=["POST"])
    def validate_source(source_name):
        """Validate a source configuration without saving it."""
        try:
            source_config = request.get_json(silent=True)
            if not source_config:
                return jsonify({"error": "Source configuration is required"}), 400

            # Ensure name matches URL parameter
            source_config["name"] = source_name

            result = flask_app.source_manager.validate_config(source_config)
            if result.get("valid"):
                return jsonify(result), 200
            else:
                return jsonify(result), 400
        except Exception as e:
            Logger.instance().error(f"Error validating source: {str(e)}")
            return jsonify({"error": str(e)}), 500
