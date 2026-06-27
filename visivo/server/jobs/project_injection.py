"""Inject the managers' cached (unsaved-to-YAML) edits into a project copy.

The editor saves resource edits into each manager's cached tier (not YAML) until
commit. To rebuild what the user is actually looking at, a run must overlay those
cached objects onto the published project before running. Shared by the on-save
run executor (and previously the preview executor)."""

from copy import deepcopy

MANAGER_TO_PROJECT_FIELD = [
    ("model_manager", "models"),
    ("source_manager", "sources"),
    ("dimension_manager", "dimensions"),
    ("metric_manager", "metrics"),
    ("insight_manager", "insights"),
    ("chart_manager", "charts"),
    ("relation_manager", "relations"),
    ("table_manager", "tables"),
    ("dashboard_manager", "dashboards"),
    ("input_manager", "inputs"),
    ("markdown_manager", "markdowns"),
    ("csv_script_model_manager", "csv_script_models"),
    ("local_merge_model_manager", "local_merge_models"),
]


def merge_objects_into_list(obj_list, new_objects):
    """Merge ``new_objects`` (iterable of ``(name, object)``) into ``obj_list``,
    replacing by name or appending; unnamed entries are preserved."""
    by_name = {o.name: o for o in obj_list if hasattr(o, "name")}
    for name, obj in new_objects:
        by_name[name] = obj
    unnamed = [o for o in obj_list if not hasattr(o, "name")]
    return list(by_name.values()) + unnamed


def inject_cached_objects(flask_app, project):
    """Overlay every manager's cached objects onto ``project`` so refs to
    objects that exist only in the cached tier (created/modified in the editor,
    not yet written to YAML) resolve during the run."""
    for manager_attr, project_field in MANAGER_TO_PROJECT_FIELD:
        manager = getattr(flask_app, manager_attr, None)
        if not manager:
            continue
        cached = manager.cached_objects
        if not cached:
            continue
        obj_list = list(getattr(project, project_field, None) or [])
        new_objects = [(name, deepcopy(obj)) for name, obj in cached.items() if obj is not None]
        setattr(project, project_field, merge_objects_into_list(obj_list, new_objects))
