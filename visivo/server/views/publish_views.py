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
                or flask_app.dimension_manager.has_unpublished_changes()
                or flask_app.metric_manager.has_unpublished_changes()
                or flask_app.relation_manager.has_unpublished_changes()
                or flask_app.insight_manager.has_unpublished_changes()
                or flask_app.markdown_manager.has_unpublished_changes()
                or flask_app.chart_manager.has_unpublished_changes()
                or flask_app.table_manager.has_unpublished_changes()
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

            # Get dimensions with changes
            for name, dimension in flask_app.dimension_manager.cached_objects.items():
                status = flask_app.dimension_manager.get_status(name)
                if status and status != ObjectStatus.PUBLISHED:
                    dimension_info = {
                        "name": name,
                        "type": "dimension",
                        "status": status.value,
                    }
                    pending.append(dimension_info)

            # Get metrics with changes
            for name, metric in flask_app.metric_manager.cached_objects.items():
                status = flask_app.metric_manager.get_status(name)
                if status and status != ObjectStatus.PUBLISHED:
                    metric_info = {
                        "name": name,
                        "type": "metric",
                        "status": status.value,
                    }
                    pending.append(metric_info)

            # Get relations with changes
            for name, relation in flask_app.relation_manager.cached_objects.items():
                status = flask_app.relation_manager.get_status(name)
                if status and status != ObjectStatus.PUBLISHED:
                    relation_info = {
                        "name": name,
                        "type": "relation",
                        "status": status.value,
                    }
                    pending.append(relation_info)

            # Get insights with changes
            for name, insight in flask_app.insight_manager.cached_objects.items():
                status = flask_app.insight_manager.get_status(name)
                if status and status != ObjectStatus.PUBLISHED:
                    insight_info = {
                        "name": name,
                        "type": "insight",
                        "status": status.value,
                    }
                    pending.append(insight_info)

            # Get markdowns with changes
            for name, markdown in flask_app.markdown_manager.cached_objects.items():
                status = flask_app.markdown_manager.get_status(name)
                if status and status != ObjectStatus.PUBLISHED:
                    markdown_info = {
                        "name": name,
                        "type": "markdown",
                        "status": status.value,
                    }
                    pending.append(markdown_info)

            # Get charts with changes
            for name, chart in flask_app.chart_manager.cached_objects.items():
                status = flask_app.chart_manager.get_status(name)
                if status and status != ObjectStatus.PUBLISHED:
                    chart_info = {
                        "name": name,
                        "type": "chart",
                        "status": status.value,
                    }
                    pending.append(chart_info)

            # Get tables with changes
            for name, table in flask_app.table_manager.cached_objects.items():
                status = flask_app.table_manager.get_status(name)
                if status and status != ObjectStatus.PUBLISHED:
                    table_info = {
                        "name": name,
                        "type": "table",
                        "status": status.value,
                    }
                    pending.append(table_info)

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

            # Process dimensions
            for name, dimension in flask_app.dimension_manager.cached_objects.items():
                status = flask_app.dimension_manager.get_status(name)
                if status and status != ObjectStatus.PUBLISHED:
                    child_info = _build_child_info(
                        name=name,
                        obj=dimension,
                        status=status,
                        published_obj=flask_app.dimension_manager.published_objects.get(name),
                        type_key="dimensions",
                        project_file_path=flask_app.project.project_file_path,
                    )
                    named_children[name] = child_info
                    published_count += 1

            # Process metrics
            for name, metric in flask_app.metric_manager.cached_objects.items():
                status = flask_app.metric_manager.get_status(name)
                if status and status != ObjectStatus.PUBLISHED:
                    child_info = _build_child_info(
                        name=name,
                        obj=metric,
                        status=status,
                        published_obj=flask_app.metric_manager.published_objects.get(name),
                        type_key="metrics",
                        project_file_path=flask_app.project.project_file_path,
                    )
                    named_children[name] = child_info
                    published_count += 1

            # Process relations
            for name, relation in flask_app.relation_manager.cached_objects.items():
                status = flask_app.relation_manager.get_status(name)
                if status and status != ObjectStatus.PUBLISHED:
                    child_info = _build_child_info(
                        name=name,
                        obj=relation,
                        status=status,
                        published_obj=flask_app.relation_manager.published_objects.get(name),
                        type_key="relations",
                        project_file_path=flask_app.project.project_file_path,
                    )
                    named_children[name] = child_info
                    published_count += 1

            # Process insights
            for name, insight in flask_app.insight_manager.cached_objects.items():
                status = flask_app.insight_manager.get_status(name)
                if status and status != ObjectStatus.PUBLISHED:
                    child_info = _build_child_info(
                        name=name,
                        obj=insight,
                        status=status,
                        published_obj=flask_app.insight_manager.published_objects.get(name),
                        type_key="insights",
                        project_file_path=flask_app.project.project_file_path,
                    )
                    named_children[name] = child_info
                    published_count += 1

            # Process markdowns
            for name, markdown in flask_app.markdown_manager.cached_objects.items():
                status = flask_app.markdown_manager.get_status(name)
                if status and status != ObjectStatus.PUBLISHED:
                    child_info = _build_child_info(
                        name=name,
                        obj=markdown,
                        status=status,
                        published_obj=flask_app.markdown_manager.published_objects.get(name),
                        type_key="markdowns",
                        project_file_path=flask_app.project.project_file_path,
                    )
                    named_children[name] = child_info
                    published_count += 1

            # Process charts
            for name, chart in flask_app.chart_manager.cached_objects.items():
                status = flask_app.chart_manager.get_status(name)
                if status and status != ObjectStatus.PUBLISHED:
                    child_info = _build_child_info(
                        name=name,
                        obj=chart,
                        status=status,
                        published_obj=flask_app.chart_manager.published_objects.get(name),
                        type_key="charts",
                        project_file_path=flask_app.project.project_file_path,
                    )
                    named_children[name] = child_info
                    published_count += 1

            # Process tables
            for name, table in flask_app.table_manager.cached_objects.items():
                status = flask_app.table_manager.get_status(name)
                if status and status != ObjectStatus.PUBLISHED:
                    child_info = _build_child_info(
                        name=name,
                        obj=table,
                        status=status,
                        published_obj=flask_app.table_manager.published_objects.get(name),
                        type_key="tables",
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
            flask_app.dimension_manager.clear_cache()
            flask_app.metric_manager.clear_cache()
            flask_app.relation_manager.clear_cache()
            flask_app.insight_manager.clear_cache()
            flask_app.markdown_manager.clear_cache()
            flask_app.chart_manager.clear_cache()
            flask_app.table_manager.clear_cache()

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

    # Fields that should not be written to YAML files (internal tracking fields)
    exclude_fields = {"path", "file_path"}

    # Determine file paths
    if status == ObjectStatus.NEW:
        # New objects go to the project file
        file_path = project_file_path
        new_file_path = project_file_path
        config = obj.model_dump(exclude_none=True, exclude=exclude_fields) if obj else {}
    elif status == ObjectStatus.DELETED:
        # Deleted objects use path from published version
        file_path = _get_file_path(published_obj, project_file_path)
        new_file_path = file_path
        config = {}  # No config needed for deletion
    else:
        # Modified objects use path from published version
        file_path = _get_file_path(published_obj, project_file_path)
        new_file_path = file_path
        config = obj.model_dump(exclude_none=True, exclude=exclude_fields) if obj else {}

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
