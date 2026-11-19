"""Save rules for metrics and dimensions.

A metric aggregates. A project-level metric or dimension reads one source, which
``SingleSourceValidator`` enforces when the project is parsed. The draft tier is
not parsed until a run, so every save checks here.

A save of a model, a metric, a dimension or the defaults is also refused when it
makes another project-level field read two sources.
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


def _is_quantifier(node: exp.Expression) -> bool:
    return isinstance(node, exp.Any) and isinstance(node.parent, exp.Predicate)


def _parse(sql: str, dialect: Optional[str]):
    if dialect:
        try:
            return sqlglot.parse_one(sql, read=dialect)
        except Exception:
            pass
    return sqlglot.parse_one(sql)


def _may_aggregate(parsed: exp.Expression) -> bool:
    """True for an aggregate, and for a call that this parser cannot judge: a
    function it does not know, DuckDB ``list(x)`` and ClickHouse ``any(x)``."""
    if has_aggregate_function(parsed):
        return True
    return any(
        isinstance(node, (exp.Anonymous, exp.List))
        or (isinstance(node, exp.Any) and not _is_quantifier(node))
        for node in parsed.walk()
    )


def metric_aggregate_error(
    expression: str,
    name: str,
    ref_kind: Optional[Callable] = None,
    dialect: Optional[str] = None,
) -> Optional[str]:
    """Why a metric's ``expression`` does not aggregate, or ``None``.

    ``ref_kind(ref_name, field_name)`` answers ``METRIC`` for a ref to a metric,
    ``ROW`` for a ref to a column or dimension, and ``None`` for a ref it does not
    know. An expression is refused only when it is known not to aggregate: SQL
    that does not parse, a function SQLGlot does not know and a ref that does not
    resolve are left to the build. ``dialect`` is the SQLGlot dialect of the
    metric's source; the generic dialect is used when it is ``None`` or does not
    parse the expression.
    """
    if not isinstance(expression, str) or not expression.strip():
        return None
    try:
        parsed = _parse(replace_refs(expression, lambda *_: _REF_PLACEHOLDER), dialect)
    except Exception:
        return None
    if parsed is None or _may_aggregate(parsed):
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


def nested_metric_aggregate_error(model, held=None, dialect=None) -> Optional[str]:
    """The first metric nested in ``model`` that does not aggregate, as a message.

    ``held`` is the model this save replaces. A metric that ``held`` nests with
    the same expression is not judged, so a model that a project already has
    stays editable.
    """
    kept = {(metric.name, metric.expression) for metric in getattr(held, "metrics", None) or []}
    for metric in getattr(model, "metrics", None) or []:
        if (metric.name, metric.expression) in kept:
            continue
        error = metric_aggregate_error(metric.expression, metric.name, dialect=dialect)
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


class _ManagerWith:
    """A manager as it is after one pending save."""

    def __init__(self, manager, obj):
        self._manager = manager
        self._obj = obj

    def get(self, name):
        return self._obj if name == self._obj.name else self._manager.get(name)

    def get_all_objects(self):
        return {**self._manager.get_all_objects(), self._obj.name: self._obj}


class _AppWith:
    """``app`` as it is after one pending save: an object, or the defaults."""

    def __init__(self, app, manager_name=None, obj=None, defaults=None):
        self._app = app
        if manager_name:
            setattr(self, manager_name, _ManagerWith(getattr(app, manager_name), obj))
        if defaults is not None:
            self._cached_defaults = defaults

    def __getattr__(self, attribute):
        return getattr(self._app, attribute)


def _draft(app, manager_name, name):
    manager = getattr(app, manager_name, None)
    return manager.get(name) if manager is not None and name else None


def _all(app, manager_name) -> dict:
    manager = getattr(app, manager_name, None)
    objects = manager.get_all_objects() if manager is not None else {}
    return {name: obj for name, obj in objects.items() if obj is not None}


def _nested_owner(app, name: str, keys=("metrics", "dimensions")):
    """The model, draft or published, that nests a field called ``name``."""
    for _model_name, model in sorted(_all(app, "model_manager").items()):
        for key in keys:
            if any(field.name == name for field in getattr(model, key, None) or []):
                return model
    return None


def _is_metric(app, name: str) -> bool:
    if _draft(app, "metric_manager", name) is not None:
        return True
    return _nested_owner(app, name, ("metrics",)) is not None


def ref_kind(app, ref_name: str, field_name: Optional[str]) -> Optional[str]:
    """What ``${ref(ref_name).field_name}`` reads in the project ``app`` serves."""
    if not field_name:
        if _is_metric(app, ref_name):
            return METRIC
        known = (
            _draft(app, "dimension_manager", ref_name)
            or _draft(app, "model_manager", ref_name)
            or _nested_owner(app, ref_name)
        )
        return ROW if known is not None else None
    model = _draft(app, "model_manager", ref_name)
    if model is None:
        return None
    nested = {metric.name for metric in getattr(model, "metrics", None) or []}
    if field_name in nested or _is_metric(app, field_name):
        return METRIC
    return ROW


def _model_source_name(app, model) -> Optional[str]:
    from visivo.server.source_resolution import default_source_name, referenced_source_name

    source = getattr(model, "source", None)
    if source is None:
        return default_source_name(app)
    return referenced_source_name(model) or getattr(source, "name", None)


def _reached_models(app, ref_name: str, seen: Set[str]) -> list:
    """The models that the object called ``ref_name`` reads, in ref order."""
    if ref_name in seen:
        return []
    seen.add(ref_name)
    model = _draft(app, "model_manager", ref_name)
    if model is not None:
        return [model]
    field = _draft(app, "metric_manager", ref_name) or _draft(app, "dimension_manager", ref_name)
    if field is None:
        owner = _nested_owner(app, ref_name)
        return [owner] if owner is not None else []
    parent = getattr(field, "_parent_name", None)
    if parent:
        return _reached_models(app, parent, seen)
    models = []
    for name, _field_name in extract_ref_components(field.expression or ""):
        models += _reached_models(app, name, seen)
    return models


def source_names(app, ref_name: str, _seen: Optional[Set[str]] = None) -> Set[str]:
    """The names of the sources that the object called ``ref_name`` reads."""
    seen = _seen if _seen is not None else set()
    names = {_model_source_name(app, model) for model in _reached_models(app, ref_name, seen)}
    return {name for name in names if name}


def metric_dialect(app, metric) -> Optional[str]:
    """The SQLGlot dialect of the source behind the first model ``metric`` reads,
    or ``None`` when no model resolves."""
    from visivo.server.model_sql_validation import dialect_for_model

    parent = getattr(metric, "_parent_name", None)
    refs = [parent] if parent else [n for n, _f in extract_ref_components(metric.expression or "")]
    seen: Set[str] = set()
    for ref_name in refs:
        for model in _reached_models(app, ref_name, seen):
            return dialect_for_model(app, {"source": getattr(model, "source", None)})
    return None


def dependents_error(app, manager_name=None, obj=None, defaults=None) -> Optional[str]:
    """Why one pending save makes another project-level field read two sources,
    or ``None``. The save is ``obj`` into ``manager_name``, or new ``defaults``.

    A field that reads two sources before the save is not counted, because the
    save does not cause that.
    """
    after = _AppWith(app, manager_name, obj, defaults)
    for kind in ("metric", "dimension"):
        own = f"{kind}_manager"
        for name, field in sorted(_all(app, own).items()):
            if getattr(field, "_parent_name", None):
                continue
            if obj is not None and own == manager_name and name == obj.name:
                continue
            error = field_sources_error(field.expression, kind, name, partial(source_names, after))
            if error and not field_sources_error(
                field.expression, kind, name, partial(source_names, app)
            ):
                return error
    return None


def install_field_rules(app) -> None:
    """Give the model, metric and dimension managers of ``app`` the project lookups."""
    app.metric_manager.ref_kind = partial(ref_kind, app)
    app.metric_manager.dialect_lookup = partial(metric_dialect, app)
    for manager_name in ("model_manager", "metric_manager", "dimension_manager"):
        manager = getattr(app, manager_name)
        manager.dependents_error = partial(dependents_error, app, manager_name)
    app.metric_manager.source_names = partial(source_names, app)
    app.dimension_manager.source_names = partial(source_names, app)
