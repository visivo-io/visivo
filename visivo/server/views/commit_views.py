import os

from dotenv import dotenv_values
from flask import jsonify
from visivo.logger.logger import Logger
from visivo.server.managers.object_manager import ObjectStatus, location_free_dump
from visivo.server.project_writer import ProjectWriter
from visivo.server.user_config import get_run_trigger


def _env_file_keys(flask_app):
    """Names defined in the project's ``.env``, for the source form to offer.

    Deliberately not ``os.environ`` — that is every variable the serve process
    inherited, which is both noise and more than the browser needs to know.
    Missing file is normal and answers an empty list.
    """
    working_dir = getattr(flask_app, "_working_dir", None) or "."
    try:
        return sorted(k for k in dotenv_values(os.path.join(working_dir, ".env")) if k)
    except OSError:
        return []


def register_commit_views(app, flask_app, output_dir):
    """Register commit-related API endpoints."""

    @app.route("/api/commit/status/", methods=["GET"])
    def get_commit_status():
        """Check if there are any uncommitted changes."""
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
                or flask_app.dashboard_manager.has_unpublished_changes()
                or flask_app.input_manager.has_unpublished_changes()
                or flask_app.defaults_changed()
            )
            return jsonify({"has_unpublished_changes": has_changes})
        except Exception as e:
            Logger.instance().error(f"Error checking commit status: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/commit/pending/", methods=["GET"])
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

            # Get dashboards with changes
            for name, dashboard in flask_app.dashboard_manager.cached_objects.items():
                status = flask_app.dashboard_manager.get_status(name)
                if status and status != ObjectStatus.PUBLISHED:
                    dashboard_info = {
                        "name": name,
                        "type": "dashboard",
                        "status": status.value,
                    }
                    pending.append(dashboard_info)

            # Get inputs with changes
            for name, input_obj in flask_app.input_manager.cached_objects.items():
                status = flask_app.input_manager.get_status(name)
                if status and status != ObjectStatus.PUBLISHED:
                    input_info = {
                        "name": name,
                        "type": "input",
                        "status": status.value,
                    }
                    pending.append(input_info)

            if flask_app.defaults_changed():
                pending.append(
                    {
                        "name": "defaults",
                        "type": "defaults",
                        "status": "modified",
                    }
                )

            return jsonify({"pending": pending, "count": len(pending)})
        except Exception as e:
            Logger.instance().error(f"Error getting pending changes: {str(e)}")
            return jsonify({"error": str(e)}), 500

    # ---- Project-scoped contract -------------------------------------------
    # Mirrors core/Django (/api/projects/<id>/capabilities|changes|draft|commit/)
    # so the viewer is backend-agnostic: it calls one set of endpoints and never
    # branches on local-vs-cloud. visivo serve is single-user and always an
    # editable draft, with no stages — so you can edit but not branch.

    @app.route("/api/projects/<project_id>/capabilities/", methods=["GET"])
    def get_project_capabilities(project_id=None):
        return jsonify(
            {
                "can_view": True,
                "can_edit": True,
                "can_branch": False,
                "is_default_stage": True,
                "edit_action": "edit",
                # visivo serve is always an editable working copy — you're
                # always "on a draft", so the editor is unlocked directly (no
                # Edit step) and you just edit + Commit.
                "is_draft": True,
                # No separate published project locally → no "Go to Draft".
                "draft_id": None,
                # `visivo serve` runs on the author's machine, so file-backed
                # sources (duckdb/sqlite on a local path) resolve normally.
                # Cloud reports False and the client hides what cannot work
                # there.
                "local_filesystem": True,
                # A password typed here never leaves the author's machine, so a
                # literal is fine and the form keeps its plain text input. Cloud
                # answers True and demands a ${env.NAME} reference instead.
                "secrets_required": False,
                # The env-var names available to reference, so the form can
                # offer them in both places. Locally that means the project's
                # own .env — NOT os.environ, which would hand the browser every
                # variable the process happens to carry. ``dotenv_values``
                # parses the file without touching the environment (load_dotenv
                # already merged it, so there is no way to tell afterwards which
                # names came from where). Names only, never values.
                "secret_keys": _env_file_keys(flask_app),
            }
        )

    @app.route("/api/projects/<project_id>/changes/", methods=["GET"])
    def get_project_changes(project_id=None):
        """The dirty set a commit would publish, in core's shape."""
        try:
            change_managers = [
                ("source", flask_app.source_manager),
                ("model", flask_app.model_manager),
                ("dimension", flask_app.dimension_manager),
                ("metric", flask_app.metric_manager),
                ("relation", flask_app.relation_manager),
                ("insight", flask_app.insight_manager),
                ("markdown", flask_app.markdown_manager),
                ("chart", flask_app.chart_manager),
                ("table", flask_app.table_manager),
                ("dashboard", flask_app.dashboard_manager),
                ("input", flask_app.input_manager),
            ]
            to_publish, to_remove = [], []
            for type_name, manager in change_managers:
                for name in list(manager.cached_objects.keys()):
                    status = manager.get_status(name)
                    if status and status != ObjectStatus.PUBLISHED:
                        entry = {"name": name, "type": type_name, "status": status.value}
                        if status == ObjectStatus.DELETED:
                            to_remove.append(entry)
                        else:
                            to_publish.append(entry)
            if flask_app.defaults_changed():
                to_publish.append({"name": "defaults", "type": "defaults", "status": "modified"})
            # `staged` is a different question from `to_publish`: what a RUN
            # would build, not what a COMMIT would publish. A chart colour edit
            # is in the second and not the first. They share this endpoint
            # because the editor already calls it after every resource write, so
            # the Run view's list and the tab dot update on save rather than on
            # the next poll — and because adding keys to an object response
            # can't break a viewer older than the server.
            return jsonify(
                {
                    "to_publish": to_publish,
                    "to_remove": to_remove,
                    "has_changes": bool(to_publish or to_remove),
                    "staged": flask_app.staged_manager.list(),
                    "staged_dag_filter": flask_app.staged_manager.dag_filter(),
                    "run_trigger": get_run_trigger(),
                }
            )
        except Exception as e:
            Logger.instance().error(f"Error getting project changes: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/projects/<project_id>/draft/", methods=["POST"])
    def create_project_draft(project_id=None):
        """Local serve is always an editable draft, so Edit is idempotent —
        echo the project id back and the viewer keeps editing in place."""
        return jsonify({"id": project_id, "name": project_id})

    @app.route("/api/commit/", methods=["POST"])
    @app.route("/api/projects/<project_id>/commit/", methods=["POST"])
    def commit_changes(project_id=None):
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
                        **_renamed_child_args(flask_app.source_manager, name),
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
                        **_renamed_child_args(flask_app.model_manager, name),
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
                        **_renamed_child_args(flask_app.dimension_manager, name),
                        type_key="dimensions",
                        project_file_path=flask_app.project.project_file_path,
                        flask_app=flask_app,
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
                        **_renamed_child_args(flask_app.metric_manager, name),
                        type_key="metrics",
                        project_file_path=flask_app.project.project_file_path,
                        flask_app=flask_app,
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
                        **_renamed_child_args(flask_app.relation_manager, name),
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
                        **_renamed_child_args(flask_app.insight_manager, name),
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
                        **_renamed_child_args(flask_app.markdown_manager, name),
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
                        **_renamed_child_args(flask_app.chart_manager, name),
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
                        **_renamed_child_args(flask_app.table_manager, name),
                        type_key="tables",
                        project_file_path=flask_app.project.project_file_path,
                    )
                    named_children[name] = child_info
                    published_count += 1

            # Process dashboards
            for name, dashboard in flask_app.dashboard_manager.cached_objects.items():
                status = flask_app.dashboard_manager.get_status(name)
                if status and status != ObjectStatus.PUBLISHED:
                    child_info = _build_child_info(
                        name=name,
                        obj=dashboard,
                        status=status,
                        **_renamed_child_args(flask_app.dashboard_manager, name),
                        type_key="dashboards",
                        project_file_path=flask_app.project.project_file_path,
                    )
                    named_children[name] = child_info
                    published_count += 1

            # Process inputs
            for name, input_obj in flask_app.input_manager.cached_objects.items():
                status = flask_app.input_manager.get_status(name)
                if status and status != ObjectStatus.PUBLISHED:
                    child_info = _build_child_info(
                        name=name,
                        obj=input_obj,
                        status=status,
                        **_renamed_child_args(flask_app.input_manager, name),
                        type_key="inputs",
                        project_file_path=flask_app.project.project_file_path,
                    )
                    named_children[name] = child_info
                    published_count += 1

            if flask_app.defaults_changed():
                named_children["defaults"] = {
                    "status": "Modified",
                    "file_path": flask_app.project.project_file_path,
                    "new_file_path": flask_app.project.project_file_path,
                    "type_key": "defaults",
                    # ``mode="json"``: ruamel cannot represent the ``Level``
                    # enums a Python-mode dump puts in ``levels``.
                    "config": location_free_dump(
                        flask_app._cached_defaults, mode="json", exclude_none=True
                    ),
                }
                published_count += 1

            if not named_children:
                return jsonify({"message": "No changes to commit", "published_count": 0})

            # A commit must never write YAML the project cannot parse. Nothing
            # checked this before: the writer wrote, the file watcher then
            # failed to re-parse, and the server was left serving a broken
            # project — every list empty, the sidebar apparently losing objects
            # that were still on disk, and the real cause buried in a traceback
            # in the server log. The editor's per-object saves validate ONE
            # object, which cannot catch a rule about the whole project
            # (a field that ties back to no source, a duplicate name, a
            # dangling ref).
            #
            # Validate the project this commit WOULD produce, and refuse before
            # touching a file. Mirrors the gate cloud already has
            # (core's `validate_commit`).
            commit_error = _validate_pending_project(flask_app)
            if commit_error:
                return (
                    jsonify(
                        {
                            "error": "Commit would leave the project invalid.",
                            "detail": commit_error,
                        }
                    ),
                    400,
                )

            # Serialize with the file watcher for the whole write→refresh
            # window. Without this, the YAML writes below fire a debounced
            # watcher recompile that races the synchronous one — both clone
            # git includes into the same cache, one dies on the git lock,
            # `on_project_change` swallows the error, and this endpoint then
            # returns success while the served project is still stale (the
            # canvas silently "loses" the just-published edit). Pausing
            # blocks until any in-flight watcher compile finishes and drops
            # the watcher events our own writes would otherwise queue.
            hot_reload_server = flask_app.hot_reload_server
            if hot_reload_server:
                hot_reload_server.pause_file_watcher()
            try:
                # Use ProjectWriter to write changes
                writer = ProjectWriter(named_children)
                writer.update_file_contents()
                try:
                    writer.write()
                except Exception:
                    # A write that fails mid-loop leaves partial YAML on disk.
                    # The watcher is paused here, and paused events are DROPPED
                    # (not queued), so without an explicit resync the served
                    # project silently diverges from disk until an unrelated
                    # edit. Recompile from disk (the same on_project_change path
                    # the success branch uses) so served state matches whatever
                    # actually landed, then re-raise for the 500 response.
                    if hot_reload_server:
                        try:
                            hot_reload_server.on_project_change(one_shot=False)
                        except Exception as resync_error:
                            Logger.instance().error(
                                f"Error resyncing after failed commit write: {resync_error}"
                            )
                    raise

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
                flask_app.dashboard_manager.clear_cache()
                flask_app.input_manager.clear_cache()
                flask_app._cached_defaults = None

                # Trigger project reload via hot reload server if available
                if hot_reload_server:
                    # Reload the project
                    hot_reload_server.on_project_change(one_shot=False)
                    # Notify clients to refresh
                    hot_reload_server.socketio.emit("reload")
            finally:
                if hot_reload_server:
                    hot_reload_server.resume_file_watcher()

            return jsonify(
                {
                    "message": "Changes committed successfully",
                    "published_count": published_count,
                }
            )
        except Exception as e:
            Logger.instance().error(f"Error committing changes: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/commit/discard/", methods=["POST"])
    @app.route("/api/projects/<project_id>/discard/", methods=["POST"])
    def discard_changes(project_id=None):
        """Drop every cached draft without writing YAML (the Discard rollback, Q14).

        Dual-mounted like ``commit`` above, so the project-scoped path core
        serves works here too and the viewer has ONE discard code path. Without
        the mirror the viewer had to special-case cloud, and the special case
        was never written — the button 404'd against core.
        """
        try:
            managers = [
                flask_app.source_manager,
                flask_app.model_manager,
                flask_app.dimension_manager,
                flask_app.metric_manager,
                flask_app.relation_manager,
                flask_app.insight_manager,
                flask_app.markdown_manager,
                flask_app.chart_manager,
                flask_app.table_manager,
                flask_app.dashboard_manager,
                flask_app.input_manager,
            ]
            discarded_count = 0
            for manager in managers:
                for name in list(manager.cached_objects.keys()):
                    status = manager.get_status(name)
                    if status and status != ObjectStatus.PUBLISHED:
                        discarded_count += 1
                manager.clear_cache()
            if flask_app.defaults_changed():
                discarded_count += 1
            flask_app._cached_defaults = None

            return jsonify(
                {
                    "message": "Changes discarded",
                    "discarded_count": discarded_count,
                    # Core's shape, so the client reads one contract. Local
                    # discards everything, so it is never still dirty after.
                    "discarded": True,
                    "dirty": False,
                }
            )
        except Exception as e:
            Logger.instance().error(f"Error discarding changes: {str(e)}")
            return jsonify({"error": str(e)}), 500


def _renest_model_scoped_fields(project):
    """Put draft metrics/dimensions back under the model they belong to.

    ``inject_cached_objects`` overlays every manager's cached objects onto the
    project by appending to the matching TOP-LEVEL list — so a draft field that
    is model-scoped lands in ``project.metrics`` rather than under its model.
    For a run that is harmless; for validation it is not, because "is this
    field nested?" is exactly the question the project-level rules ask. Without
    this, a perfectly good nested draft is reported as a project-level field
    that references nothing, and the commit is refused.

    ``project_writer`` nests by ``parent_model`` when it writes, so this makes
    the validated shape match the shape that would land on disk.
    """
    for field_attr, model_attr in (("metrics", "metrics"), ("dimensions", "dimensions")):
        remaining = []
        for field in getattr(project, field_attr, None) or []:
            parent_name = getattr(field, "_parent_name", None)
            if not parent_name:
                remaining.append(field)
                continue
            owner = next(
                (m for m in project.models if getattr(m, "name", None) == parent_name), None
            )
            if owner is None:
                # Orphaned scope — leave it top-level so the normal validators
                # report it rather than silently dropping the field.
                remaining.append(field)
                continue
            owned = list(getattr(owner, model_attr, None) or [])
            owned = [o for o in owned if getattr(o, "name", None) != field.name] + [field]
            setattr(owner, model_attr, owned)
        setattr(project, field_attr, remaining)


def _validate_pending_project(flask_app):
    """The validation error a commit would produce, or None.

    Assembles the project as it would be AFTER the commit — the parsed project
    with every manager's cached (draft) object overlaid, which is the same
    overlay a run uses — and re-constructs it so Pydantic runs the full
    validator chain. Re-constructing is the point: ``inject_cached_objects``
    mutates via ``setattr``, which does not re-validate, so only a fresh
    ``Project(**dump)`` exercises the project-level rules.

    Fails OPEN on an unexpected error: this gate exists to catch a *known*
    invalid project, and must not become a new way for a commit to fail.
    """
    from copy import deepcopy

    from visivo.models.project import Project
    from visivo.server.jobs.project_injection import inject_cached_objects

    try:
        pending = deepcopy(flask_app.project)
        inject_cached_objects(flask_app, pending)
        _renest_model_scoped_fields(pending)
        Project(**pending.model_dump(exclude_none=True))
    except ValueError as error:
        message = str(error)
        # Pydantic wraps the raised message; surface the useful line.
        if "Value error, " in message:
            message = message.split("Value error, ")[1].split(" [type")[0]
        return message
    except Exception:
        return None
    return None


def _renamed_child_args(manager, name):
    """`published_obj` and `old_name` for a child, honouring a draft rename.

    A renamed object is cached under its NEW name, so looking `published_obj`
    up by that name finds nothing and the writer would treat it as new. The
    published record — and the file it lives in — are under the OLD name.
    """
    old_name = manager.renamed_from(name)
    return {
        "published_obj": manager.published_objects.get(old_name or name),
        "old_name": old_name,
    }


def _build_child_info(
    name,
    obj,
    status,
    published_obj,
    type_key,
    project_file_path,
    flask_app=None,
    old_name=None,
):
    """Build the child info dict for ProjectWriter.

    For metrics / dimensions with a `_parent_name` (i.e. scoped to a model
    in the Explorer), the returned dict carries two extra hints:

    - `parent_model`: the parent model's name, used by
      `ProjectWriter._new()` to nest the config under the model's
      `metrics` / `dimensions` list.
    - `file_path` / `new_file_path`: set to the parent model's file path
      (instead of the project file) so the new metric/dimension lands in
      the same YAML where its parent model lives.
    """
    # Map our ObjectStatus to ProjectWriter status strings
    status_map = {
        ObjectStatus.NEW: "New",
        ObjectStatus.MODIFIED: "Modified",
        ObjectStatus.DELETED: "Deleted",
        ObjectStatus.RENAMED: "Renamed",
    }
    writer_status = status_map.get(status, "Unchanged")

    # Detect a model-scoped metric/dimension via the PrivateAttr set in the
    # save endpoint. PrivateAttrs survive on the Pydantic instance.
    parent_model_name = None
    if obj is not None and type_key in ("metrics", "dimensions"):
        parent_model_name = getattr(obj, "_parent_name", None)

    parent_model_file = None
    if parent_model_name and flask_app is not None:
        parent_model_file = _find_parent_model_file_path(
            parent_model_name, flask_app, project_file_path
        )

    # Determine file paths
    if status == ObjectStatus.NEW:
        # Nested children land in their parent model's file; unscoped new
        # objects go to the project file.
        if parent_model_file:
            file_path = parent_model_file
            new_file_path = parent_model_file
        else:
            file_path = project_file_path
            new_file_path = project_file_path
        config = location_free_dump(obj, mode="json", exclude_none=True) if obj else {}
    elif status == ObjectStatus.DELETED:
        # Deleted objects use path from published version
        file_path = _get_file_path(published_obj, project_file_path)
        new_file_path = file_path
        config = {}  # No config needed for deletion
    else:
        # Modified and renamed objects use the path from the published version,
        # which for a rename was resolved under the OLD name.
        file_path = _get_file_path(published_obj, project_file_path)
        new_file_path = file_path
        config = location_free_dump(obj, mode="json", exclude_none=True) if obj else {}

    info = {
        "status": writer_status,
        "file_path": file_path,
        "new_file_path": new_file_path,
        "type_key": type_key,
        "config": config,
    }
    if status == ObjectStatus.RENAMED and old_name:
        # The writer finds the object in YAML under this, and writes `config`
        # (which carries the new name) over it.
        info["old_name"] = old_name
    if parent_model_name:
        info["parent_model"] = parent_model_name
    return info


def _find_parent_model_file_path(parent_model_name, flask_app, project_file_path):
    """Resolve the YAML file path that should receive a new child scoped to
    the named parent model.

    Lookup order: model_manager.published_objects (existing models carry their
    YAML path) → cached_objects (the parent may be a brand-new model being
    published in the same pass, in which case we fall back to the project
    file — same default as an unscoped NEW object). Returns None if no
    parent candidate is found at all.
    """
    published = flask_app.model_manager.published_objects.get(parent_model_name)
    if published is not None:
        path = getattr(published, "file_path", None)
        if path:
            return path
    cached = flask_app.model_manager.cached_objects.get(parent_model_name)
    if cached is not None:
        path = getattr(cached, "file_path", None)
        if path:
            return path
        # Parent model is NEW in this pass — it will land in project_file_path,
        # so the nested metric/dimension should land there too.
        return project_file_path
    return None


def _get_file_path(obj, default_path):
    """Get the file path from an object, falling back to default."""
    if obj and hasattr(obj, "file_path") and obj.file_path:
        return obj.file_path
    return default_path
