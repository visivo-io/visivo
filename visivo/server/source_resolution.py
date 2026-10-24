"""Resolve a source, model or input by name the way the editor sees it:
the uncommitted draft if there is one, else the committed object."""

import re

from visivo.models.base.context_string import ContextString
from visivo.models.defaults import Defaults
from visivo.query.patterns import REF_PROPERTY_PATTERN, extract_ref_names


def from_manager(flask_app, manager_name, name):
    """Look ``name`` up in an object manager (draft cache first, then published).

    The managers are the same source of truth ``/api/models/`` and
    ``/api/sources/`` serve, so anything the viewer can SEE resolves here,
    including objects that exist only as uncommitted drafts.
    """
    manager = getattr(flask_app, manager_name, None)
    getter = getattr(manager, "get", None)
    if not callable(getter):
        return None
    try:
        return getter(name)
    except Exception:
        return None


def find_object(flask_app, manager_name, project_attr, name):
    """The object called ``name``: the draft tier, then the committed project."""
    if not name:
        return None
    found = from_manager(flask_app, manager_name, name)
    if found is not None:
        return found
    project = getattr(flask_app, "project", None)
    for candidate in getattr(project, project_attr, None) or []:
        if getattr(candidate, "name", None) == name:
            return candidate
    return None


def find_source(flask_app, source_name):
    return find_object(flask_app, "source_manager", "sources", source_name)


def find_model(flask_app, model_name):
    return find_object(flask_app, "model_manager", "models", model_name)


def find_input(flask_app, input_name):
    return find_object(flask_app, "input_manager", "inputs", input_name)


def referenced_source_name(model):
    """The source NAME a model points at, read off the model itself.

    Source resolution normally walks the DAG, but a draft model is not IN the
    DAG, so that walk returns nothing. The model's own ``source`` field still
    names its source in either form the field round-trips as (``ref(wh)`` and
    ``${ref(wh)}``). ``None`` for an embedded Source object or an unparseable
    value.
    """
    source = getattr(model, "source", None)
    if source is None:
        return None
    if isinstance(source, ContextString):
        return source.get_reference()
    if isinstance(source, str):
        names = extract_ref_names(source)
        if names:
            return next(iter(names))
        match = re.match(REF_PROPERTY_PATTERN, source.strip())
        if match:
            return match.group("model_name")
    return None


def default_source_name(flask_app):
    """``defaults.source_name``, from the draft defaults if there are any."""
    defaults = getattr(flask_app, "_cached_defaults", None)
    if not isinstance(defaults, Defaults):
        defaults = getattr(getattr(flask_app, "project", None), "defaults", None)
    name = getattr(defaults, "source_name", None)
    return name if isinstance(name, str) and name else None


def default_source(flask_app):
    return find_source(flask_app, default_source_name(flask_app))


def source_for_model(flask_app, model, output_dir):
    """The source a model reads from, for a committed or a draft model.

    The DAG walk is the normal answer; an uncommitted model is not in the DAG,
    so the name the model itself carries is tried next, and a SQL model that
    names no source reads from ``defaults.source_name``, as it would once
    committed.
    """
    from visivo.jobs.utils import get_source_for_model
    from visivo.models.models.sql_model import SqlModel

    try:
        source = get_source_for_model(model, flask_app.project.dag(), output_dir)
    except Exception:
        source = None
    if source is not None:
        return source
    if isinstance(model, SqlModel) and model.source is None:
        return default_source(flask_app)
    referenced = referenced_source_name(model)
    return find_source(flask_app, referenced) if referenced else None
