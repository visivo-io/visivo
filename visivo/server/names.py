"""Object names are project-global, which ``Project.traverse_names`` enforces when
a project is parsed. The draft tier is never parsed until a run, so every save
checks here instead: a second object under a taken name makes each ref to it
ambiguous and the whole project fails to build."""

from visivo.models.models.sql_model import SqlModel
from visivo.models.validators.names_validator import scoped_alias_collision
from visivo.server.rename_service import TYPE_TO_MANAGER


class NameTakenError(ValueError):
    """A save under a name that an object of another type already holds."""


def _scope(obj):
    return getattr(obj, "_parent_name", None)


def name_clash(flask_app, own_manager, name, obj):
    """Why ``obj`` cannot be saved as ``name``, or ``None``.

    Mirrors the parse: fields scoped to different models may share a name, and
    everything else may not share one with an object of another type.
    """
    for type_key, attribute in TYPE_TO_MANAGER.items():
        manager = getattr(flask_app, attribute, None)
        if manager is None or manager is own_manager:
            continue
        other = manager.get(name)
        if other is None:
            continue
        if _scope(obj) and _scope(other) and _scope(obj) != _scope(other):
            continue
        label = type_key[:-1]
        article = "an" if label[0] in "aeiou" else "a"
        return (
            f"'{name}' is already the name of {article} {label}. Names are unique across a "
            f"project, so a second object named '{name}' makes every ref to it ambiguous and "
            "the project fails to build."
        )
    if _scope(obj):
        return None
    return _scope_collision(flask_app, own_manager, name, obj)


def _nested_fields(obj):
    if not isinstance(obj, SqlModel):
        return []
    return list(obj.metrics or []) + list(obj.dimensions or [])


def _scope_collision(flask_app, own_manager, name, obj):
    """``NamesValidator``'s cross-scope rule for an unscoped ``obj``, checked on
    the draft tier as it would stand with ``obj`` saved as ``name``. Fields nested
    in a draft model live in no field manager, so the models are walked too.
    """
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
