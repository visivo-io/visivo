from flask import jsonify
from visivo.logger.logger import Logger
from visivo.server.managers.object_manager import ObjectStatus
from visivo.server.project_writer import ProjectWriter


def register_publish_views(app, flask_app, output_dir):
    """Register publish-related API endpoints."""

    @app.route("/api/publish/status/", methods=["GET"])
    def get_publish_status():
        """Check if there are any unpublished changes."""
        try:
            has_changes = (
                flask_app.source_manager.has_unpublished_changes()
                or flask_app.model_manager.has_unpublished_changes()
            )
            return jsonify({"has_unpublished_changes": has_changes})
        except Exception as e:
            Logger.instance().error(f"Error checking publish status: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/publish/pending/", methods=["GET"])
    def get_pending_changes():
        """Get all objects with pending changes."""
        try:
            pending = []

            # Get sources with changes
            for name, source in flask_app.source_manager.cached_objects.items():
                status = flask_app.source_manager.get_status(name)
                if status and status != ObjectStatus.PUBLISHED:
                    source_info = {
                        "name": name,
                        "type": "source",
                        "status": status.value,
                    }
                    # Include type info if not deleted
                    if source is not None and hasattr(source, "type"):
                        source_info["source_type"] = source.type
                    pending.append(source_info)

            # Get models with changes
            for name, model in flask_app.model_manager.cached_objects.items():
                status = flask_app.model_manager.get_status(name)
                if status and status != ObjectStatus.PUBLISHED:
                    model_info = {
                        "name": name,
                        "type": "model",
                        "status": status.value,
                    }
                    pending.append(model_info)

            return jsonify({"pending": pending, "count": len(pending)})
        except Exception as e:
            Logger.instance().error(f"Error getting pending changes: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/publish/", methods=["POST"])
    def publish_changes():
        """Write all cached changes to YAML files."""
        try:
            # Build named_children dict for ProjectWriter
            named_children = {}
            published_count = 0

            # Process sources
            for name, source in flask_app.source_manager.cached_objects.items():
                status = flask_app.source_manager.get_status(name)
                if status and status != ObjectStatus.PUBLISHED:
                    child_info = _build_child_info(
                        name=name,
                        obj=source,
                        status=status,
                        published_obj=flask_app.source_manager.published_objects.get(name),
                        type_key="sources",
                        project_file_path=flask_app.project.project_file_path,
                    )
                    named_children[name] = child_info
                    published_count += 1

            # Process models
            for name, model in flask_app.model_manager.cached_objects.items():
                status = flask_app.model_manager.get_status(name)
                if status and status != ObjectStatus.PUBLISHED:
                    child_info = _build_child_info(
                        name=name,
                        obj=model,
                        status=status,
                        published_obj=flask_app.model_manager.published_objects.get(name),
                        type_key="models",
                        project_file_path=flask_app.project.project_file_path,
                    )
                    named_children[name] = child_info
                    published_count += 1

            if not named_children:
                return jsonify({"message": "No changes to publish", "published_count": 0})

            # Use ProjectWriter to write changes
            writer = ProjectWriter(named_children)
            writer.update_file_contents()
            writer.write()

            # Clear caches after successful write
            flask_app.source_manager.clear_cache()
            flask_app.model_manager.clear_cache()

            # Trigger project reload via hot reload server if available
            if flask_app.hot_reload_server:
                # Reload the project
                flask_app.hot_reload_server.on_project_change(one_shot=False)
                # Notify clients to refresh
                flask_app.hot_reload_server.socketio.emit("reload")

            return jsonify(
                {
                    "message": "Changes published successfully",
                    "published_count": published_count,
                }
            )
        except Exception as e:
            Logger.instance().error(f"Error publishing changes: {str(e)}")
            return jsonify({"error": str(e)}), 500


def _build_child_info(name, obj, status, published_obj, type_key, project_file_path):
    """Build the child info dict for ProjectWriter."""
    # Map our ObjectStatus to ProjectWriter status strings
    status_map = {
        ObjectStatus.NEW: "New",
        ObjectStatus.MODIFIED: "Modified",
        ObjectStatus.DELETED: "Deleted",
    }
    writer_status = status_map.get(status, "Unchanged")

    # Determine file paths
    if status == ObjectStatus.NEW:
        # New objects go to the project file
        file_path = project_file_path
        new_file_path = project_file_path
        config = obj.model_dump(exclude_none=True) if obj else {}
    elif status == ObjectStatus.DELETED:
        # Deleted objects use path from published version
        file_path = _get_file_path(published_obj, project_file_path)
        new_file_path = file_path
        config = {}  # No config needed for deletion
    else:
        # Modified objects use path from published version
        file_path = _get_file_path(published_obj, project_file_path)
        new_file_path = file_path
        config = obj.model_dump(exclude_none=True) if obj else {}

    return {
        "status": writer_status,
        "file_path": file_path,
        "new_file_path": new_file_path,
        "type_key": type_key,
        "config": config,
    }


def _get_file_path(obj, default_path):
    """Get the file path from an object, falling back to default."""
    if obj and hasattr(obj, "file_path") and obj.file_path:
        return obj.file_path
    return default_path
