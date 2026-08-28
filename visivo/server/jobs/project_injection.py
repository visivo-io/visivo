"""Inject the managers' cached (unsaved-to-YAML) edits into a project copy.

The editor saves resource edits into each manager's cached tier (not YAML) until
commit. To rebuild what the user is actually looking at, a run must overlay those
cached objects onto the published project before running. Shared by the on-save
run executor (and previously the preview executor).

Reproducing the project means reproducing its SHAPE, not just its contents: a
model-scoped metric/dimension has to come back nested under its model, because
nesting is the only thing that records that scope (VIS-1259). See
``renest_model_scoped_fields``."""

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
]


def merge_objects_into_list(obj_list, new_objects):
    """Merge ``new_objects`` (iterable of ``(name, object)``) into ``obj_list``,
    replacing by name or appending; unnamed entries are preserved."""
    by_name = {o.name: o for o in obj_list if hasattr(o, "name")}
    for name, obj in new_objects:
        by_name[name] = obj
    unnamed = [o for o in obj_list if not hasattr(o, "name")]
    return list(by_name.values()) + unnamed


def renest_model_scoped_fields(project):
    """Put model-scoped metrics/dimensions back under the model they belong to.

    Each manager caches its objects in one flat namespace, so the overlay above
    can only append them to the matching TOP-LEVEL project list — a model-scoped
    field lands in ``project.metrics`` rather than under its model. Nothing
    downstream can recover the scope from there: ``_parent_name`` is a
    PrivateAttr, so the field dumps as ``{name, expression}`` with no owner at
    all, and neither ``Metric`` nor ``Dimension`` has a ``model`` field to put
    one in (both are ``extra="forbid"``). Nesting is the fact — the same
    conclusion VIS-1259 reached for the deploy wire.

    Left flattened, the overlay is wrong in three ways:

    * ``${ref(model).field}`` — the address the Explorer emits for a
      model-scoped field — no longer finds it. ``FieldResolver._find_model_scoped_field``
      searches the model's OWN ``metrics``/``dimensions``, so the reference
      falls through to the raw-column path: "Column 'x' not found on model 'y'"
      for a computed metric the user is looking at, or, when the field's alias
      shadows a real column, the raw column *silently* — the computed
      expression is dropped and a metric reads as a plain dimension.
    * Project-level rules judge it as a project-level field, which is a
      different rule: nesting ties a field to a source, so a nested
      ``count(*)`` is legal where a project-level one is not.
    * ``project_writer`` nests by parent model when it writes, so the validated
      shape did not match the shape that would land on disk.

    A field scoped to a model that is not in the project stays top-level:
    dropping it would hide the mistake, leaving it lets the normal validators
    name it.
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


def inject_cached_objects(flask_app, project):
    """Overlay every manager's cached objects onto ``project`` so refs to
    objects that exist only in the cached tier (created/modified in the editor,
    not yet written to YAML) resolve during the run.

    ``project`` is mutated in place, so every caller hands in a copy.

    The re-nesting pass runs last, once the cached models are themselves in
    place, so a model-scoped field is re-nested onto the model the user is
    actually editing rather than its published version.
    """
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
    renest_model_scoped_fields(project)
