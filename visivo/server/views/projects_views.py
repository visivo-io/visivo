from flask import jsonify, request
from pydantic import ValidationError
from visivo.logger.logger import Logger


def register_projects_views(app, flask_app, output_dir):
    """Register project CRUD API endpoints (new pattern)."""

    @app.route("/api/projects/", methods=["GET"])
    def list_all_projects():
        """
        List all projects with status.
        Locally, returns a list with one item (the current project).
        In the cloud, can return multiple projects.
        """
        try:
            projects = flask_app.project_manager.get_all_projects_with_status()
            return jsonify({"projects": projects})
        except Exception as e:
            Logger.instance().error(f"Error listing projects: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/projects/<project_name>/", methods=["GET"])
    def get_project(project_name):
        """
        Get project with status information.
        Locally, project_name should match the current project.
        """
        try:
            # Verify project name matches (locally there's only one project)
            if project_name != flask_app.project.name:
                return jsonify({"error": f"Project '{project_name}' not found"}), 404

            project_data = flask_app.project_manager.get_project_with_status()
            return jsonify(project_data)
        except Exception as e:
            Logger.instance().error(f"Error getting project: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/projects/<project_name>/save/", methods=["POST"])
    def save_project(project_name):
        """
        Save project configuration (defaults) to cache.
        This sets the status to NEW or MODIFIED.
        """
        try:
            # Verify project name matches
            if project_name != flask_app.project.name:
                return jsonify({"error": f"Project '{project_name}' not found"}), 404

            config = request.get_json(silent=True)
            if not config:
                return jsonify({"error": "Project configuration is required"}), 400

            project_data = flask_app.project_manager.save_from_config(config)
            status = flask_app.project_manager.get_status()

            return (
                jsonify(
                    {
                        "message": "Project saved to cache",
                        "project": project_name,
                        "status": status.value if status else None,
                        "data": project_data,
                    }
                ),
                200,
            )
        except ValidationError as e:
            Logger.instance().debug(f"Project validation failed: {e}")
            first_error = e.errors()[0]
            return (
                jsonify(
                    {
                        "error": f"Invalid project configuration: {first_error['loc']}: {first_error['msg']}"
                    }
                ),
                400,
            )
        except Exception as e:
            Logger.instance().error(f"Error saving project: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/projects/<project_name>/", methods=["DELETE"])
    def delete_project(project_name):
        """
        Mark project for deletion (clears cached defaults, reverts to published).
        """
        try:
            # Verify project name matches
            if project_name != flask_app.project.name:
                return jsonify({"error": f"Project '{project_name}' not found"}), 404

            marked = flask_app.project_manager.mark_for_deletion()
            if marked:
                return (
                    jsonify(
                        {
                            "message": f"Project '{project_name}' cache cleared (reverted to published)",
                            "status": "published",
                        }
                    ),
                    200,
                )
            else:
                return jsonify({"error": f"Project '{project_name}' not found"}), 404
        except Exception as e:
            Logger.instance().error(f"Error deleting project: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/projects/<project_name>/validate/", methods=["POST"])
    def validate_project(project_name):
        """
        Validate project configuration without saving.
        """
        try:
            # Verify project name matches
            if project_name != flask_app.project.name:
                return jsonify({"error": f"Project '{project_name}' not found"}), 404

            config = request.get_json(silent=True)
            if not config:
                return jsonify({"error": "Project configuration is required"}), 400

            result = flask_app.project_manager.validate_config(config)
            if result.get("valid"):
                return jsonify(result), 200
            else:
                return jsonify(result), 400
        except Exception as e:
            Logger.instance().error(f"Error validating project: {str(e)}")
            return jsonify({"error": str(e)}), 500
