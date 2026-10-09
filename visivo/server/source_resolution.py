"""Resolve a source by name the way the editor sees it: draft first.

Every server surface that takes a source name — schema inference, draft
insight previews, the agent's data tools — needs the same answer: the
uncommitted draft if there is one, else the committed object. Three views
had grown their own copies of this walk; this is the one they share.
"""

import re

from visivo.models.base.context_string import ContextString
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


def find_source(flask_app, source_name):
    """A source by name: the draft tier, then the committed project."""
    if not source_name:
        return None
    source = from_manager(flask_app, "source_manager", source_name)
    if source is not None:
        return source
    project = getattr(flask_app, "project", None)
    for candidate in getattr(project, "sources", None) or []:
        if getattr(candidate, "name", None) == source_name:
            return candidate
    return None


def find_model(flask_app, model_name):
    """A model by name: the draft tier, then the committed project."""
    model = from_manager(flask_app, "model_manager", model_name)
    if model is not None:
        return model
    project = getattr(flask_app, "project", None)
    for candidate in getattr(project, "models", None) or []:
        if getattr(candidate, "name", None) == model_name:
            return candidate
    return None


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
