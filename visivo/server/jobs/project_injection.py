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


class NoCompiledProject(Exception):
    """The served project is None, so nothing can be overlaid onto it."""


def replace_inline_definitions(container, replacements, _seen=None):
    """Swap drafts in for objects defined inline under ``container``; return the names swapped.

    Appending them to the top-level list instead would duplicate the name, which
    ``Project.traverse_names`` rejects. A draft replaces only an object of the same
    type and scope: a project-level metric is a different object from a model's
    inline metric of the same name. Walks declared fields only, never Plotly props.
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
        if getattr(draft, "_parent_name", None) != getattr(value, "_parent_name", None):
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


def renest_model_scoped_fields(project):
    """Move cached model-scoped metrics/dimensions from the top-level lists back under their model.

    ``_parent_name`` is a PrivateAttr and does not survive ``model_dump()``, and
    ``${ref(model).field}`` only searches the model's own fields, so nesting is the only
    durable record of the scope. A field whose model is missing stays top-level so the
    validators report it.
    """
    for field_attr in ("metrics", "dimensions"):
        remaining = []
        for field in getattr(project, field_attr, None) or []:
            parent_name = getattr(field, "_parent_name", None)
            if not parent_name:
                remaining.append(field)
                continue
            owner = next(
                (m for m in project.models or [] if getattr(m, "name", None) == parent_name), None
            )
            if owner is None:
                remaining.append(field)
                continue
            owned = list(getattr(owner, field_attr, None) or [])
            owned = [o for o in owned if getattr(o, "name", None) != field.name] + [field]
            setattr(owner, field_attr, owned)
        setattr(project, field_attr, remaining)


def inject_cached_objects(flask_app, project, fields=None):
    """Overlay every manager's cached objects onto ``project`` so refs to
    objects that exist only in the cached tier (created/modified in the editor,
    not yet written to YAML) resolve during the run. ``fields`` limits the
    overlay to those project fields. Re-nesting runs last so a field lands on
    the cached model, not the published one."""
    if project is None:
        # Reached when the served project failed to compile. Without this the
        # first manager holding a draft walks `type(None).model_fields`, and
        # the Pydantic internals are what the caller reports to the user.
        raise NoCompiledProject(
            "This project has no compiled state, so there is nothing to overlay drafts onto. "
            "Its last build failed — check list_runs / get_run for the error and fix that first."
        )
    for manager_attr, project_field in MANAGER_TO_PROJECT_FIELD:
        if fields is not None and project_field not in fields:
            continue
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
    renest_model_scoped_fields(project)
