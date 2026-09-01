"""Rename an object and rewrite every `${ref(old)}` that pointed at it.

The cloud half has existed since VIS-917 (`core`'s `services/rename.py`);
locally there was nothing — `ProjectWriter._rename` raised `NotImplementedError`
and no route reached it. This is the local equivalent, working against the
manager's cached (draft) tier so a rename commits like any other edit.

WHY REFERENCES BECOME MODIFIED

A reference's config genuinely changes — `${ref(orders)}` becomes
`${ref(purchases)}` — so marking it modified is not bookkeeping, it is the
truth. It also does real work: `ProjectWriter` only loads the files of changed
objects, so a reference living in an otherwise-untouched file would not have its
file loaded, and the rewrite would be silently dropped on commit.

The renamed object itself cannot ride that path. `_update` finds an object in
YAML by matching `name:` against the name it is called with, and after a rename
the YAML still holds the old one — the search would miss and the update would
no-op. That is what `_rename(old, new)` is for, and why the stub always took two
names.

Refs are `${ref(name)}` template tokens resolved pre-compile, not SQL, so they
are rewritten with the same pattern the codebase uses to extract them. sqlglot
cannot parse a `${ref()}` token and is not involved.

Nested metrics/dimensions are out of scope: they are not their own record, so
they have no row to rename.
"""

import re

TYPE_TO_MANAGER = {
    "sources": "source_manager",
    "models": "model_manager",
    "metrics": "metric_manager",
    "dimensions": "dimension_manager",
    "relations": "relation_manager",
    "insights": "insight_manager",
    "charts": "chart_manager",
    "tables": "table_manager",
    "markdowns": "markdown_manager",
    "inputs": "input_manager",
    "dashboards": "dashboard_manager",
}


class RenameError(Exception):
    """A rename failure carrying the HTTP status the view should return."""

    def __init__(self, message, status):
        super().__init__(message)
        self.message = message
        self.status = status


def _ref_pattern(old_name):
    """Matches ref(old), ref("old"), ref('old') — bare or inside ${...}.

    The back-referenced quote group pins the exact name and preserves whichever
    quoting style the author used. Mirrors core's `_ref_pattern` so the two
    halves rewrite identically.
    """
    return re.compile(r"ref\(\s*([\"']?)" + re.escape(old_name) + r"\1\s*\)")


def _rewrite(value, pattern, new_name):
    if isinstance(value, str):
        return pattern.sub(lambda m: f"ref({m.group(1)}{new_name}{m.group(1)})", value)
    if isinstance(value, list):
        return [_rewrite(v, pattern, new_name) for v in value]
    if isinstance(value, dict):
        return {k: _rewrite(v, pattern, new_name) for k, v in value.items()}
    return value


def _managers(flask_app):
    for type_key, attribute in TYPE_TO_MANAGER.items():
        manager = getattr(flask_app, attribute, None)
        if manager is not None:
            yield type_key, manager


def _current_objects(manager):
    """Every object the manager knows, cached tier winning over published.

    A rename has to see the draft state — renaming onto a name that only exists
    as an uncommitted draft is still a collision.
    """
    objects = dict(manager.published_objects)
    for name, obj in manager.cached_objects.items():
        if obj is None:
            objects.pop(name, None)  # marked for deletion
        else:
            objects[name] = obj
    return objects


def _config_of(obj):
    return obj.model_dump(mode="json", exclude_none=True)


def _all_names(flask_app):
    names = set()
    for _type_key, manager in _managers(flask_app):
        names.update(_current_objects(manager).keys())
    return names


def _validate(flask_app, type_key, old_name, new_name):
    """The manager and object being renamed, or raise."""
    if type_key not in TYPE_TO_MANAGER:
        raise RenameError(f"Unknown resource type '{type_key}'.", 400)
    if not new_name or new_name == old_name:
        raise RenameError("A different new name is required.", 400)

    manager = getattr(flask_app, TYPE_TO_MANAGER[type_key], None)
    if manager is None:
        raise RenameError(f"Unknown resource type '{type_key}'.", 400)

    target = _current_objects(manager).get(old_name)
    if target is None:
        raise RenameError(f"No {type_key} named '{old_name}'.", 404)

    # visivo names are project-global, so a collision crosses every type.
    if new_name in _all_names(flask_app):
        raise RenameError(f"A resource named '{new_name}' already exists.", 409)

    return manager, target


def rename_impact(flask_app, *, type_key, old_name, new_name):
    """What the rename would change, without changing it.

    Same validation and the same traversal `rename_object` applies, so a preview
    cannot promise something the rename then refuses.
    """
    manager, target = _validate(flask_app, type_key, old_name, new_name)
    pattern = _ref_pattern(old_name)

    references = []
    for other_type, other_manager in _managers(flask_app):
        for name, obj in _current_objects(other_manager).items():
            if other_type == type_key and name == old_name:
                continue
            config = _config_of(obj)
            if _rewrite(config, pattern, new_name) == config:
                continue
            status = other_manager.get_status(name)
            references.append(
                {
                    "type": other_type,
                    "name": name,
                    "status": status.value if status else "published",
                }
            )

    references.sort(key=lambda entry: (entry["type"], entry["name"]))
    target_status = manager.get_status(old_name)
    return {
        "target": {
            "type": type_key,
            "name": old_name,
            "new_name": new_name,
            "status": target_status.value if target_status else "published",
        },
        "references": references,
    }


def rename_object(flask_app, *, type_key, old_name, new_name):
    """Apply the rename to the cached tier. Returns the same shape as the
    preview, describing what was changed."""
    impact = rename_impact(flask_app, type_key=type_key, old_name=old_name, new_name=new_name)
    manager, target = _validate(flask_app, type_key, old_name, new_name)
    pattern = _ref_pattern(old_name)

    config = _config_of(target)
    config["name"] = new_name
    manager.save_from_config(config)
    manager.record_rename(old_name, new_name)

    for reference in impact["references"]:
        other_manager = getattr(flask_app, TYPE_TO_MANAGER[reference["type"]])
        obj = _current_objects(other_manager)[reference["name"]]
        other_manager.save_from_config(_rewrite(_config_of(obj), pattern, new_name))

    return impact
