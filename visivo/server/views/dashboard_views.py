import os

from flask import Response, jsonify, request, send_from_directory
from pydantic import ValidationError

from visivo.logger.logger import Logger


def register_dashboard_views(app, flask_app, output_dir):
    @app.route("/api/dashboards/<dashboard_name>/", methods=["GET"])
    def get_dashboard_api(dashboard_name):
        """API endpoint for dashboard data"""
        try:
            thumbnail_path = os.path.join("dashboards", f"{dashboard_name}.png")
            thumbnail_exists = os.path.exists(os.path.join(output_dir, thumbnail_path))

            return jsonify(
                {
                    "id": dashboard_name,
                    "name": dashboard_name,
                    "signed_thumbnail_file_url": (
                        f"/api/dashboards/{dashboard_name}.png/" if thumbnail_exists else None
                    ),
                }
            )
        except Exception as e:
            Logger.instance().error(f"Error fetching dashboard data: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/dashboards/<dashboard_name>.png/", methods=["GET"])
    def get_thumbnail_api(dashboard_name):
        try:
            thumbnail_path = os.path.join("dashboards", f"{dashboard_name}.png")
            if not os.path.exists(os.path.join(output_dir, thumbnail_path)):
                Logger.instance().debug(f"Thumbnail not found at path: {thumbnail_path}")
                return Response(status=404)

            return send_from_directory(output_dir, thumbnail_path)
        except Exception as e:
            Logger.instance().error(f"Error retrieving thumbnail: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/dashboards/<dashboard_name>.png/", methods=["POST"])
    def create_thumbnail_api(dashboard_name):
        try:
            if "file" not in request.files:
                return jsonify({"message": "No file provided"}), 400

            file = request.files["file"]
            if file.filename == "" or not file.filename.endswith(".png"):
                return jsonify({"message": "Invalid file - must be a PNG"}), 400

            dashboard_dir = os.path.join(output_dir, "dashboards")
            os.makedirs(dashboard_dir, exist_ok=True)

            thumbnail_path = os.path.join(dashboard_dir, f"{dashboard_name}.png")

            file.save(thumbnail_path)

            return jsonify(
                {
                    "signed_thumbnail_file_url": f"/api/dashboards/{dashboard_name}.png/",
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

    @app.route("/api/dashboards/<dashboard_name>/rename/", methods=["POST"])
    def rename_dashboard_crud(dashboard_name):
        """Rename a dashboard from <dashboard_name> to the new name in the request body.

        Body: {"new_name": "..."}. The rename is applied to the draft cache; the user
        must publish to flush the change to YAML. Validates that the new name doesn't
        collide with another dashboard.

        Note: this endpoint does NOT rewrite cross-object references to the dashboard
        (e.g., `${ ref(<old>) }` in another object's config). Dashboards are leaves of
        the project DAG — almost no other object references them by name — so the
        cross-ref rewrite is deferred. A future generic-rename pass will cover charts,
        tables, etc., where ref-rewrite is load-bearing.
        """
        try:
            body = request.get_json(silent=True) or {}
            new_name = (body.get("new_name") or "").strip()
            if not new_name:
                return jsonify({"error": "new_name is required"}), 400

            try:
                renamed = flask_app.dashboard_manager.rename(dashboard_name, new_name)
            except ValueError as e:
                return jsonify({"error": str(e)}), 400

            if renamed is None:
                return jsonify({"error": f"Dashboard '{dashboard_name}' not found"}), 404

            status = flask_app.dashboard_manager.get_status(new_name)
            return (
                jsonify(
                    {
                        "message": (
                            f"Dashboard renamed from '{dashboard_name}' to '{new_name}'. "
                            "Publish your changes to flush the rename to YAML."
                        ),
                        "old_name": dashboard_name,
                        "new_name": new_name,
                        "status": status.value if status else None,
                        "rewritten_ref_count": 0,
                    }
                ),
                200,
            )
        except Exception as e:
            Logger.instance().error(f"Error renaming dashboard: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/dashboards/<dashboard_name>/preview-rename/", methods=["GET"])
    def preview_rename_dashboard_crud(dashboard_name):
        """Preview a rename without applying it.

        Query params: `new_name`. Returns whether the rename is valid and how many
        cross-object references would be rewritten (currently always 0 for dashboards
        since they aren't referenced by other objects — see the note on the rename endpoint).
        """
        try:
            new_name = (request.args.get("new_name") or "").strip()
            if not new_name:
                return jsonify({"error": "new_name query parameter is required"}), 400

            manager = flask_app.dashboard_manager

            # Existence check
            existing = manager.get(dashboard_name)
            if existing is None:
                return jsonify({"error": f"Dashboard '{dashboard_name}' not found"}), 404

            # Same-name no-op
            if dashboard_name == new_name:
                return (
                    jsonify(
                        {
                            "valid": False,
                            "error": "New name must be different from the old name",
                            "rewritten_ref_count": 0,
                        }
                    ),
                    200,
                )

            # Collision check across cached + published.
            taken_in_cache = (
                new_name in manager.cached_objects and manager.cached_objects[new_name] is not None
            )
            taken_in_published = new_name in manager.published_objects
            if taken_in_cache or taken_in_published:
                return (
                    jsonify(
                        {
                            "valid": False,
                            "error": f"'{new_name}' is already used by another dashboard",
                            "rewritten_ref_count": 0,
                        }
                    ),
                    200,
                )

            return (
                jsonify(
                    {
                        "valid": True,
                        "rewritten_ref_count": 0,
                    }
                ),
                200,
            )
        except Exception as e:
            Logger.instance().error(f"Error previewing dashboard rename: {str(e)}")
            return jsonify({"error": str(e)}), 500
