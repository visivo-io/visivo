"""Save rules for metrics and dimensions.

A metric aggregates. A project-level metric or dimension reads one source, which
``SingleSourceValidator`` enforces when the project is parsed. The draft tier is
not parsed until a run, so every save checks here.
"""

from functools import partial
from typing import Callable, List, Optional, Set

import sqlglot
from sqlglot import exp

from visivo.models.validators.single_source_validator import multiple_sources_error
from visivo.query.patterns import extract_ref_components, replace_refs
from visivo.query.sqlglot_utils import has_aggregate_function

METRIC = "metric"
ROW = "row"

_REF_PLACEHOLDER = "visivo_ref"


def metric_aggregate_error(
    expression: str, name: str, ref_kind: Optional[Callable] = None
) -> Optional[str]:
    """Why a metric's ``expression`` does not aggregate, or ``None``.

    ``ref_kind(ref_name, field_name)`` answers ``METRIC`` for a ref to a metric,
    ``ROW`` for a ref to a column or dimension, and ``None`` for a ref it does not
    know. An expression is refused only when it is known not to aggregate: SQL
    that does not parse, a function SQLGlot does not know and a ref that does not
    resolve are left to the build.
    """
    if not isinstance(expression, str) or not expression.strip():
        return None
    try:
        parsed = sqlglot.parse_one(replace_refs(expression, lambda *_: _REF_PLACEHOLDER))
    except Exception:
        return None
    if parsed is None or has_aggregate_function(parsed) or parsed.find(exp.Anonymous):
        return None
    kinds = [
        ref_kind(ref_name, field_name) if ref_kind else None
        for ref_name, field_name in extract_ref_components(expression)
    ]
    if any(kind != ROW for kind in kinds):
        return None
    return (
        f"Metric '{name}' must aggregate, and its expression has no aggregate function: "
        f"{expression}. Wrap the value in an aggregate, e.g. sum(...) or count(...), or "
        f"reference a metric. A calculation for each row is a dimension."
    )


def nested_metric_aggregate_error(model) -> Optional[str]:
    """The first metric nested in ``model`` that does not aggregate, as a message."""
    for metric in getattr(model, "metrics", None) or []:
        error = metric_aggregate_error(metric.expression, metric.name)
        if error:
            return error
    return None


def field_sources_error(
    expression: str, kind: str, name: str, source_names: Optional[Callable]
) -> Optional[str]:
    """Why a project-level field reads more than one source, or ``None``.

    ``source_names(ref_name)`` gives the names of the sources a referenced object
    reads. A source that does not resolve is not counted.
    """
    if source_names is None or not isinstance(expression, str):
        return None
    sources: Set[str] = set()
    for ref_name, _field_name in extract_ref_components(expression):
        sources |= source_names(ref_name)
    if len(sources) < 2:
        return None
    return multiple_sources_error(kind.capitalize(), name, sorted(sources))


def _draft(app, manager_name, name):
    manager = getattr(app, manager_name, None)
    return manager.get(name) if manager is not None and name else None


def ref_kind(app, ref_name: str, field_name: Optional[str]) -> Optional[str]:
    """What ``${ref(ref_name).field_name}`` reads in the project ``app`` serves."""
    if not field_name:
        if _draft(app, "metric_manager", ref_name) is not None:
            return METRIC
        known = _draft(app, "dimension_manager", ref_name) or _draft(app, "model_manager", ref_name)
        return ROW if known is not None else None
    model = _draft(app, "model_manager", ref_name)
    if model is None:
        return None
    nested = {metric.name for metric in getattr(model, "metrics", None) or []}
    if field_name in nested or _draft(app, "metric_manager", field_name) is not None:
        return METRIC
    return ROW


def _model_source_name(app, model) -> Optional[str]:
    from visivo.server.source_resolution import default_source_name, referenced_source_name

    source = getattr(model, "source", None)
    if source is None:
        return default_source_name(app)
    return referenced_source_name(model) or getattr(source, "name", None)


def source_names(app, ref_name: str, _seen: Optional[Set[str]] = None) -> Set[str]:
    """The names of the sources that the object called ``ref_name`` reads."""
    seen = _seen if _seen is not None else set()
    if ref_name in seen:
        return set()
    seen.add(ref_name)
    model = _draft(app, "model_manager", ref_name)
    if model is not None:
        name = _model_source_name(app, model)
        return {name} if name else set()
    field = _draft(app, "metric_manager", ref_name) or _draft(app, "dimension_manager", ref_name)
    if field is None:
        return set()
    parent = getattr(field, "_parent_name", None)
    if parent:
        return source_names(app, parent, seen)
    names: Set[str] = set()
    for name, _field_name in extract_ref_components(field.expression or ""):
        names |= source_names(app, name, seen)
    return names


def install_field_rules(app) -> None:
    """Give the metric and dimension managers of ``app`` the project lookups."""
    app.metric_manager.ref_kind = partial(ref_kind, app)
    app.metric_manager.source_names = partial(source_names, app)
    app.dimension_manager.source_names = partial(source_names, app)
