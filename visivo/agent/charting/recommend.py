"""Rank chart families for a request (VIS-1407 scaffold; VIS-1428 fills it in).

Three stages, each explained in the response: hard gates reject a family
outright, limits try repair transforms in order until the series count fits,
and score adjustments rank what survives. Deterministic by construction —
the same request always ranks the same way — so the golden table in
``tests/agent/charting/test_recommend.py`` is the regression harness for
every rule edit.
"""

import re

import yaml

from visivo.agent.charting.rules import load_families, load_tables
from visivo.agent.charting.schema import (
    Recommendation,
    RecommendRequest,
    RecommendResponse,
    Rejection,
)

# Roles whose values a reader looks up by name. A time axis or a continuous
# measure is "high cardinality" too, but that is what a chart is for.
_LOOKUP_ROLES = ("categorical", "text", "geo_region", "geo_point")

# Dimensions a cross-tab can put on its rows and columns (hour of day and
# other small whole numbers included).
_CROSS_ROLES = ("categorical", "boolean", "geo_region", "numeric_discrete")

# A pivot's visible columns: one for the row field, then one per value per
# column-dimension member. Past this it scrolls sideways at 1024 px.
MAX_PIVOT_COLUMNS = 12

# Table skeletons cite the theme accent and a light tint of it (tables.yml).
_PIVOT_SCOPE_DEFAULT = "column"


def _window(min_max):
    upper = "∞" if min_max.max is None else min_max.max
    return f"{min_max.min}–{upper}"


def _axis(request):
    """The dimension drawn along the x axis: the first ordered one (time
    before numbers), else the first dimension, else ``None``."""
    ordered = [d for d in request.dimensions if d.is_ordered()]
    if ordered:
        return next((d for d in ordered if d.role == "time"), ordered[0])
    return request.dimensions[0] if request.dimensions else None


def _series_count(request):
    """One series per value of the largest non-axis dimension, or one when
    the axis is the only dimension."""
    axis = _axis(request)
    others = [d for d in request.dimensions if d is not axis]
    if not others:
        return 1
    return max(max(d.cardinality, 1) for d in others)


def _gate(rule, request):
    """``None`` if the family is allowed, else the reason it is not."""
    gates = rule.hard_gates
    axis = _axis(request)
    if gates.ordered_axis_required and not (axis and axis.is_ordered()):
        return "needs an ordered axis (time, a number, or a dimension marked ordered)"
    if not gates.metrics.admits(len(request.metrics)):
        return f"takes {_window(gates.metrics)} metrics"
    if not gates.dimensions.admits(len(request.dimensions)):
        return f"takes {_window(gates.dimensions)} dimensions"
    if axis and gates.axis_roles and axis.role not in gates.axis_roles:
        return f"{axis.column} cannot be the axis; needs {', '.join(gates.axis_roles)}"
    if gates.dimension_roles:
        off_role = [
            d.column
            for d in request.dimensions
            if d is not axis and d.role not in gates.dimension_roles
        ]
        if off_role:
            return f"{off_role[0]} is not one of {', '.join(gates.dimension_roles)}"
    if axis and not gates.axis_points.admits(axis.axis_points()):
        return f"needs {_window(gates.axis_points)} axis points, has {axis.axis_points()}"
    if gates.intents and request.intent is not None and request.intent not in gates.intents:
        return f"only for intents {', '.join(gates.intents)}"
    if "table_pivot" in rule.trace_types and _pivot_columns(request, values=1) > MAX_PIVOT_COLUMNS:
        return (
            f"a pivot would have {_pivot_columns(request, values=1)} columns with one value, "
            f"more than {MAX_PIVOT_COLUMNS}; it scrolls sideways at 1024 px"
        )
    return None


def _repair(rule, series):
    """``(transforms, warning)`` needed to bring ``series`` within limits."""
    limits = rule.limits
    if limits.series_max is None or series <= (limits.series_ideal or limits.series_max):
        return [], None
    if series <= limits.series_max:
        return [], f"{series} series is readable but above the ideal of {limits.series_ideal}"
    if limits.repair:
        return [limits.repair[0]], f"{series} series exceeds {limits.series_max}; repaired"
    return None, f"{series} series exceeds {limits.series_max} and nothing repairs it"


def _lookup_dimension(request):
    """An identifier, or a lookup role at ``high`` cardinality."""
    return any(
        d.role == "identifier" or (d.role in _LOOKUP_ROLES and d.cardinality_bucket == "high")
        for d in request.dimensions
    )


def _cross_dims(request):
    """The two dimensions a cross-tab would use, largest first."""
    dims = sorted(
        (d for d in request.dimensions if d.role in _CROSS_ROLES),
        key=lambda d: -d.cardinality,
    )
    return dims[:2] if len(dims) >= 2 else []


def _cross_cells(request):
    dims = _cross_dims(request)
    return dims[0].cardinality * dims[1].cardinality if dims else 0


def _pivot_dims(request):
    """``(rows_dim, columns_dim)`` for a pivot: time goes to the columns, else
    the smaller of two cross dimensions does."""
    time = [d for d in request.dimensions if d.role == "time"]
    others = [d for d in request.dimensions if d.role != "time"]
    if time and others:
        return max(others, key=lambda d: d.cardinality), time[0]
    if len(request.dimensions) >= 2:
        ordered = sorted(request.dimensions, key=lambda d: -d.cardinality)
        return ordered[0], ordered[1]
    return None, None


def _pivot_columns(request, values=None):
    """Visible columns of a pivot: the row field plus one per value per
    member of the column dimension. ``values`` defaults to every metric."""
    rows, cols = _pivot_dims(request)
    if cols is None:
        return 0
    return 1 + max(values if values is not None else len(request.metrics), 1) * cols.axis_points()


def _pivot_values_that_fit(request):
    """How many of the metrics a pivot can carry within the column budget."""
    rows, cols = _pivot_dims(request)
    if cols is None:
        return 0
    per_value = cols.axis_points()
    return max(0, min(len(request.metrics), (MAX_PIVOT_COLUMNS - 1) // max(per_value, 1)))


def _time_columns(request):
    time = [d for d in request.dimensions if d.role == "time"]
    return time[0].axis_points() if time else None


def _dims_small(request):
    return bool(request.dimensions) and all(
        d.cardinality_bucket in ("one", "few", "some") for d in request.dimensions
    )


def _mixed_units(request):
    units = {m.unit for m in request.metrics if m.unit}
    textual = any(d.role in ("identifier", "text") for d in request.dimensions)
    return len(units) >= 2 or (textual and bool(request.metrics))


_INTENT_EQ = re.compile(r"^intent == (\w+)$")
_INTENT_NE = re.compile(r"^intent != (\w+)$")
_INTENT_IN = re.compile(r"^intent in \(([\w, ]+)\)$")
_AXIS_GT = re.compile(r"^axis_points > (\d+)$")
_DIMS_EQ = re.compile(r"^dimensions == (\d+)$")
_CROSS_GT = re.compile(r"^cross cells > (\d+)$")
_CROSS_IN = re.compile(r"^cross cells in \((\d+), (\d+)\]$")
_TIME_COLS = re.compile(r"^time columns <= (\d+)$")

_SIMPLE = {
    "series <= ideal": lambda r, series, ideal: ideal is not None and series <= ideal,
    "two few dimensions": lambda r, *_: sum(
        1 for d in r.dimensions if d.cardinality_bucket in ("one", "few")
    )
    == 2,
    "identifier or high cardinality": lambda r, *_: _lookup_dimension(r),
    "lookup dimension": lambda r, *_: _lookup_dimension(r),
    "axis is time": lambda r, *_: (_axis(r) is not None and _axis(r).role == "time"),
    "exact_values": lambda r, *_: r.semantics.exact_values,
    "part_of_whole and totals_required": lambda r, *_: (
        r.semantics.part_of_whole and r.semantics.totals_required
    ),
    "metrics >= 4 and dimensions small": lambda r, *_: len(r.metrics) >= 4 and _dims_small(r),
    "metrics <= 3 and dimensions small and intent != detail": lambda r, *_: (
        len(r.metrics) <= 3 and _dims_small(r) and r.intent != "detail"
    ),
    "mixed units per row": lambda r, *_: _mixed_units(r),
    "pivot columns > 12": lambda r, *_: _pivot_columns(r) > MAX_PIVOT_COLUMNS,
}


def _clause(when):
    """The predicate for one ``when`` string, or ``None`` if the string is
    not in the vocabulary. Kept separate from ``_fires`` so a rule file can
    be checked for typos before anything is scored."""
    if when in _SIMPLE:
        return _SIMPLE[when]
    if match := _INTENT_EQ.match(when):
        return lambda r, *_: r.intent == match.group(1)
    if match := _INTENT_NE.match(when):
        return lambda r, *_: r.intent != match.group(1)
    if match := _INTENT_IN.match(when):
        intents = match.group(1).split(", ")
        return lambda r, *_: r.intent in intents
    if match := _AXIS_GT.match(when):
        limit = int(match.group(1))
        return lambda r, *_: (_axis(r).axis_points() if _axis(r) else 0) > limit
    if match := _DIMS_EQ.match(when):
        count = int(match.group(1))
        return lambda r, *_: len(r.dimensions) == count
    if match := _CROSS_GT.match(when):
        limit = int(match.group(1))
        return lambda r, *_: _cross_cells(r) > limit
    if match := _CROSS_IN.match(when):
        low, high = int(match.group(1)), int(match.group(2))
        return lambda r, *_: low < _cross_cells(r) <= high
    if match := _TIME_COLS.match(when):
        limit = int(match.group(1))
        return lambda r, *_: _time_columns(r) is not None and _time_columns(r) <= limit
    if " and " in when:
        parts = [_clause(part) for part in when.split(" and ")]
        if all(parts):
            return lambda r, *a: all(part(r, *a) for part in parts)
    return None


def check_vocabulary(rules):
    """Every ``when`` in the rule files must be a clause the recommender
    understands; a typo would otherwise never fire, silently."""
    unknown = [
        f"{rule.name}: {adj.when!r}"
        for rule in rules
        for adj in rule.score
        if _clause(adj.when) is None
    ]
    if unknown:
        raise ValueError("unknown `when` clauses in families.yml: " + "; ".join(unknown))


def _fires(when, request, series, ideal):
    clause = _clause(when)
    if clause is None:
        raise ValueError(f"unknown `when` clause {when!r}")
    return clause(request, series, ideal)


def _score(rule, request, series):
    """Additive adjustments, each with its reason."""
    total, why = 0.0, []
    for adjustment in rule.score:
        if _fires(adjustment.when, request, series, rule.limits.series_ideal):
            total += adjustment.delta
            why.append(adjustment.reason)
    return total, why


def _label(name):
    return name.replace("_", " ").strip().title()


def _column_ref(request, column):
    return f"${{ref({request.context.model}).{column}}}"


def table_skeleton(request, tables=None):
    """A ``tables:`` entry for a flat detail table over the request's
    columns, aliased, paged for its row count."""
    tables = tables or load_tables()
    columns = [
        f'{_column_ref(request, d.column)} as "{_label(d.column)}"' for d in request.dimensions
    ]
    columns += [f'{_column_ref(request, m.name)} as "{_label(m.name)}"' for m in request.metrics]
    rows = max((d.cardinality for d in request.dimensions), default=None)
    spec = {
        "name": "detail",
        "columns": columns,
        "rows_per_page": tables.rows_per_page.pick(rows),
    }
    return yaml.safe_dump({"tables": [spec]}, sort_keys=False, allow_unicode=True)


def pivot_skeleton(request, tables=None):
    """A pivot ``tables:`` entry: rows = the larger dimension, columns = the
    smaller (or time), values = up to three aggregates, a gradient in the
    theme's accent, and one page so the gradient spans every row."""
    tables = tables or load_tables()
    rows_dim, cols_dim = _pivot_dims(request)
    rule = tables.pivot_rules
    keep = min(rule.values.max, _pivot_values_that_fit(request))
    values = [
        f"{m.agg if m.agg in rule.values.aggs else 'sum'}({_column_ref(request, m.name)})"
        for m in request.metrics[:keep]
    ]
    scope = "row" if cols_dim.role == "time" else _PIVOT_SCOPE_DEFAULT
    spec = {
        "name": f"{rows_dim.column}-by-{cols_dim.column}",
        "rows": [_column_ref(request, rows_dim.column)],
        "columns": [_column_ref(request, cols_dim.column)],
        "values": values,
        "format_cells": {
            "scope": scope,
            "min_color": rule.format_cells.colors["min"],
            "max_color": rule.format_cells.colors["max"],
        },
        "rows_per_page": tables.rows_per_page.pick(rows_dim.cardinality, gradient=True),
    }
    return yaml.safe_dump({"tables": [spec]}, sort_keys=False, allow_unicode=True)


def _skeleton_for(rule, request):
    if "table_pivot" in rule.trace_types:
        return pivot_skeleton(request)
    if "table" in rule.trace_types:
        return table_skeleton(request)
    return None


def _wants_detail_table(request):
    """A chart over a long list of lookup values needs the rows behind it."""
    return any(
        d.role in _LOOKUP_ROLES and d.cardinality_bucket in ("many", "high")
        for d in request.dimensions
    )


def recommend(request, rules=None):
    """Rank the families that admit ``request``, explaining every decision."""
    if not isinstance(request, RecommendRequest):
        request = RecommendRequest(**request)
    rules = rules if rules is not None else load_families()
    check_vocabulary(rules)
    series = _series_count(request)
    recommendations, rejected, suggested = [], [], []
    for rule in rules:
        reason = _gate(rule, request)
        if reason:
            rejected.append(Rejection(family=rule.name, reason=reason))
            continue
        transforms, warning = _repair(rule, series)
        if transforms is None:
            rejected.append(Rejection(family=rule.name, reason=warning))
            continue
        score, why = _score(rule, request, series)
        if not why:
            why.append("admitted by its gates")
        warnings = list(rule.warnings) + ([warning] if warning else [])
        if transforms:
            why.append(f"after {transforms[0]}")
            suggested.extend(t for t in transforms if t not in suggested)
        pairings = list(rule.pairings)
        is_table = any(t in ("table", "table_pivot") for t in rule.trace_types)
        if "table_pivot" in rule.trace_types and _pivot_values_that_fit(request) < len(
            request.metrics
        ):
            warnings.append(
                f"only {_pivot_values_that_fit(request)} of {len(request.metrics)} values fit the "
                f"{MAX_PIVOT_COLUMNS}-column budget; the skeleton keeps the first, or swap the dimensions"
            )
        if not is_table and _wants_detail_table(request) and "detail_table_below" not in pairings:
            pairings.append("detail_table_below")
        recommendations.append(
            Recommendation(
                family=rule.name,
                trace_type=rule.trace_types[0] if rule.trace_types else None,
                score=round(score - 0.1 * len(transforms), 3),
                why=why,
                encodings=rule.encodings,
                transforms=transforms,
                warnings=warnings,
                table_yaml=_skeleton_for(rule, request),
                pairings=pairings,
                layout=rule.layout,
                skill=rule.skill,
            )
        )
    recommendations.sort(key=lambda r: (-r.score, r.family))
    return RecommendResponse(
        recommendations=recommendations[: request.context.max_results],
        rejected=rejected,
        transforms_suggested=suggested,
    )
