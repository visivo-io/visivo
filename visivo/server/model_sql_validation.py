"""Validate a model's SQL when it is saved, not when it is run (VIS-1329).

Two checks, and deliberately only two: the SQL has to parse, and every
projection has to carry a name the database will return. Both are wrong
regardless of what the source contains, so neither needs a cached source schema
and both give the same answer whoever is asking.

Whether the tables and columns exist is a different question. Answering it
means qualifying against the source's cached schema, and a source that has
never been introspected has none — so asking it here would reject good SQL for
the projects least able to prove otherwise. That check belongs where the schema
is known, and the run already does it.
"""

import sqlglot

from visivo.models.base.context_string import ContextString
from visivo.query.patterns import REF_PROPERTY_PATTERN, extract_ref_names
from visivo.query.sqlglot_utils import (
    unaliased_projection_message,
    unaliased_projections,
)


def source_ref_name(value) -> str:
    """The source NAME out of a model's ``source`` field, in any form it takes.

    A saved config carries it as ``${ref(wh)}`` or ``ref(wh)``; a literal name
    is also accepted, since that is what a hand-written project may hold.
    """
    if isinstance(value, ContextString):
        return value.get_reference()
    if not isinstance(value, str):
        return None
    names = extract_ref_names(value)
    if names:
        return next(iter(names))
    import re

    match = re.match(REF_PROPERTY_PATTERN, value.strip())
    if match:
        return match.group("model_name")
    return value.strip() or None


def dialect_for_model(flask_app, config) -> str:
    """The SQLGlot dialect this model will be run against, or ``None``.

    ``None`` is a valid answer, not a failure: an unresolvable source means the
    generic dialect, which still parses ordinary SQL. Refusing to validate would
    be worse than validating a little less precisely.
    """
    name = source_ref_name((config or {}).get("source"))
    if not name:
        project = getattr(flask_app, "project", None)
        defaults = getattr(project, "defaults", None)
        name = getattr(defaults, "source_name", None)
    if not isinstance(name, str) or not name:
        return None

    source = _source_named(flask_app, name)
    if source is None:
        return None
    try:
        dialect = source.get_sqlglot_dialect()
    except Exception:
        return None
    return dialect if isinstance(dialect, str) and dialect else None


def validate_model_sql(sql, sqlglot_dialect, model_name):
    """The problem with ``sql``, as a message, or ``None`` when there isn't one."""
    if not sql or not str(sql).strip():
        return None

    dialect = sqlglot_dialect if isinstance(sqlglot_dialect, str) and sqlglot_dialect else None
    try:
        sqlglot.parse_one(sql, read=dialect)
    except Exception as error:
        # A dialect this parser does not know is not the author's fault. Only
        # the generic parse failing too is evidence against the SQL itself.
        if dialect is None:
            return f"Model '{model_name}' has SQL that does not parse: {error}"
        try:
            sqlglot.parse_one(sql)
        except Exception:
            return f"Model '{model_name}' has SQL that does not parse: {error}"
        dialect = None

    unaliased = unaliased_projections(sql, dialect)
    if unaliased:
        return unaliased_projection_message(model_name, unaliased)
    return None


def _source_named(flask_app, name):
    """Draft cache first, then the committed project — the order every other
    lookup here uses, so a source created in the editor resolves too."""
    manager = getattr(flask_app, "source_manager", None)
    getter = getattr(manager, "get", None)
    if callable(getter):
        try:
            found = getter(name)
            if found is not None:
                return found
        except Exception:
            pass
    project = getattr(flask_app, "project", None)
    for source in getattr(project, "sources", None) or []:
        if getattr(source, "name", None) == name:
            return source
    return None
