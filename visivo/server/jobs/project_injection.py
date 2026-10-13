"""Inject the managers' cached (unsaved-to-YAML) edits into a project copy.

The editor saves resource edits into each manager's cached tier (not YAML) until
commit. To rebuild what the user is actually looking at, a run must overlay those
cached objects onto the published project before running. Shared by the on-save
run executor (and previously the preview executor)."""

from copy import deepcopy

from pydantic import BaseModel as PydanticBaseModel

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
]


def merge_objects_into_list(obj_list, new_objects):
    """Merge ``new_objects`` (iterable of ``(name, object)``) into ``obj_list``,
    replacing by name or appending; unnamed entries are preserved."""
    by_name = {o.name: o for o in obj_list if hasattr(o, "name")}
    for name, obj in new_objects:
        by_name[name] = obj
    unnamed = [o for o in obj_list if not hasattr(o, "name")]
    return list(by_name.values()) + unnamed


def replace_inline_definitions(container, replacements, _seen=None):
    """Swap drafts in for objects defined inline under ``container``; return the names swapped.

    Appending them to the top-level list instead would duplicate the name, which
    ``Project.traverse_names`` rejects. Walks declared fields only, never Plotly props.
    """
    replaced = set()
    if _seen is None:
        _seen = set()
    if id(container) in _seen:
        return replaced
    _seen.add(id(container))

    def substitute(value):
        name = getattr(value, "name", None)
        if name is None or name not in replacements:
            return None
        draft = replacements[name]
        if type(draft) is not type(value):
            return None
        replaced.add(name)
        return deepcopy(draft)

    for field_name in type(container).model_fields:
        value = getattr(container, field_name, None)
        if isinstance(value, PydanticBaseModel):
            swap = substitute(value)
            if swap is not None:
                setattr(container, field_name, swap)
            else:
                replaced |= replace_inline_definitions(value, replacements, _seen)
        elif isinstance(value, list):
            for index, item in enumerate(value):
                if not isinstance(item, PydanticBaseModel):
                    continue
                swap = substitute(item)
                if swap is not None:
                    value[index] = swap
                else:
                    replaced |= replace_inline_definitions(item, replacements, _seen)
        elif isinstance(value, dict):
            for key, item in value.items():
                if not isinstance(item, PydanticBaseModel):
                    continue
                swap = substitute(item)
                if swap is not None:
                    value[key] = swap
                else:
                    replaced |= replace_inline_definitions(item, replacements, _seen)
    return replaced


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
        drafts = {name: obj for name, obj in cached.items() if obj is not None}
        obj_list = list(getattr(project, project_field, None) or [])
        top_level_names = {o.name for o in obj_list if hasattr(o, "name")}
        inline_drafts = {name: obj for name, obj in drafts.items() if name not in top_level_names}
        nested = replace_inline_definitions(project, inline_drafts) if inline_drafts else set()
        new_objects = [(name, deepcopy(obj)) for name, obj in drafts.items() if name not in nested]
        setattr(project, project_field, merge_objects_into_list(obj_list, new_objects))
