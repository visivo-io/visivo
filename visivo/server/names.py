"""Object names are project-global, which ``Project.traverse_names`` enforces when
a project is parsed. The draft tier is never parsed until a run, so every save
checks here instead: a second object under a taken name makes each ref to it
ambiguous and the whole project fails to build."""

from visivo.models.base.base_model import BaseModel
from visivo.models.base.parent_model import ParentModel
from visivo.models.inputs.input import Input
from visivo.models.models.model import Model
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.source import Source
from visivo.models.validators.names_validator import scoped_alias_collision
from visivo.server.managers.object_manager import NameTakenError  # noqa: F401
from visivo.server.rename_service import TYPE_TO_MANAGER


def _scope(obj):
    return getattr(obj, "_parent_name", None)


def _taken(name, type_key):
    label = type_key[:-1]
    article = "an" if label[0] in "aeiou" else "a"
    return (
        f"'{name}' is already the name of {article} {label}. Names are unique across a "
        f"project, so a second object named '{name}' makes every ref to it ambiguous and "
        "the project fails to build."
    )


def name_clash(flask_app, own_manager, name, obj):
    """Why ``obj`` cannot be saved as ``name``, or ``None``.

    Mirrors the parse: fields scoped to different models may share a name, a
    model-scoped field may not share one with a project-level object
    (``NamesValidator``), and nothing else may share one across types.
    """
    for type_key, attribute in TYPE_TO_MANAGER.items():
        manager = getattr(flask_app, attribute, None)
        if manager is None or manager is own_manager:
            continue
        other = manager.get(name)
        if other is None:
            continue
        mine, theirs = _scope(obj), _scope(other)
        if mine and theirs and mine != theirs:
            continue
        if bool(mine) != bool(theirs):
            return scoped_alias_collision(name, mine or theirs)
        return _taken(name, type_key)
    return _scope_collision(flask_app, own_manager, name, obj) or _inline_clash(
        flask_app, own_manager, name, obj
    )


def _label(obj):
    for kind, label in ((Source, "source"), (Model, "model"), (Input, "input")):
        if isinstance(obj, kind):
            return label
    return type(obj).__name__.lower()


def _inline(obj):
    """``(name, child)`` for each named object defined inside ``obj``, walked as
    ``Project.traverse_names`` walks it. Refs are strings, so only definitions count."""
    found = []
    if isinstance(obj, ParentModel):
        for child in obj.child_items():
            if isinstance(child, BaseModel) and getattr(child, "name", None):
                if not _scope(child):
                    found.append((child.name, child))
            found.extend(_inline(child))
    return found


def _taken_inside(name, label, container_label, container):
    article = "an" if label[0] in "aeiou" else "a"
    return (
        f"'{name}' is already the name of {article} {label} defined inside {container_label} "
        f"'{container}'. Names are unique across a project, so a second object named "
        f"'{name}' makes every ref to it ambiguous and the project fails to build."
    )


def _defined_again(name, type_key):
    return (
        f"{_taken(name, type_key)} Refer to the existing one as ${{ref({name})}} instead of "
        "defining it again."
    )


def _inline_clash(flask_app, own_manager, name, obj):
    """A name defined inline that another object already holds, or a new name some
    object already defines inline. Inline definitions the stored version of ``obj``
    already had are left alone, so an object read from the project stays editable."""
    stored = own_manager.get(name) if own_manager is not None else None
    kept = {inline_name for inline_name, _ in _inline(stored)} if stored is not None else set()
    is_new = own_manager is None or stored is None

    holders = {}
    inside = {}
    for type_key, attribute in TYPE_TO_MANAGER.items():
        manager = getattr(flask_app, attribute, None)
        if manager is None:
            continue
        for other_name, other in manager.get_all_objects().items():
            if other is None or (manager is own_manager and other_name == name):
                continue
            holders.setdefault(other_name, type_key)
            for inline_name, child in _inline(other):
                inside.setdefault(inline_name, (_label(child), _label(other), other_name))

    if is_new and name in inside:
        return _taken_inside(name, *inside[name])

    seen = set()
    for inline_name, child in _inline(obj):
        if inline_name in seen or inline_name == name:
            return _taken_inside(inline_name, _label(child), _label(obj), name)
        seen.add(inline_name)
        if inline_name in kept:
            continue
        if inline_name in holders:
            return _defined_again(inline_name, holders[inline_name])
        if inline_name in inside:
            return _taken_inside(inline_name, *inside[inline_name])
    return None


def _nested_fields(obj):
    if not isinstance(obj, SqlModel):
        return []
    return list(obj.metrics or []) + list(obj.dimensions or [])


def _scope_collision(flask_app, own_manager, name, obj):
    """``NamesValidator``'s cross-scope rule within ``obj``'s own manager and the
    fields nested in models, checked on the draft tier as it would stand with
    ``obj`` saved as ``name``. Both directions are refused: a project-level
    object over a model's field, and a model's field over a project-level object.
    """
    scope = _scope(obj)
    if scope:
        existing = own_manager.get(name) if own_manager is not None else None
        if existing is not None and not _scope(existing):
            return scoped_alias_collision(name, scope)
        return None

    global_names = set()
    aliases = []
    for attribute in TYPE_TO_MANAGER.values():
        manager = getattr(flask_app, attribute, None)
        if manager is None:
            continue
        objects = dict(manager.get_all_objects())
        if manager is own_manager:
            objects[name] = obj
        for other in objects.values():
            other_name = getattr(other, "name", None)
            if other is None or not other_name:
                continue
            if not _scope(other):
                global_names.add(other_name)
            for field in _nested_fields(other):
                aliases.append((other_name, field.name))

    for field in _nested_fields(obj):
        if field.name in global_names:
            return scoped_alias_collision(field.name, name)
    for model_name, alias in aliases:
        if alias == name:
            return scoped_alias_collision(alias, model_name)
    return None
