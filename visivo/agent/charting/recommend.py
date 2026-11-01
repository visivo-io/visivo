"""Rank chart families for a request.

Hard gates reject a family: its structural gates and the minimums in its
members' ``data_shape``. Every range a member states tries the member's
repairs in order; what none fixes costs score and warns, it never rejects.
Score adjustments rank what survives. A family is drawn by its best member.
"""

import math
import operator
import re
from dataclasses import dataclass, field
from functools import lru_cache
from typing import List, Optional, get_args

import yaml

from visivo.agent.charting.rules import (
    load_family_doc,
    load_pairings,
    load_tables,
    load_transforms,
)
from visivo.agent.charting.skeleton import Repaired, chart_skeleton, metric_sql
from visivo.agent.charting.schema import (
    TRACE_TYPES,
    Limits,
    Measure,
    Recommendation,
    RecommendRequest,
    RecommendResponse,
    Rejection,
    Semantics,
    TimeGrain,
    split_pairing,
)

# Roles whose values a reader looks up by name. A time axis or a continuous
# measure is "high cardinality" too, but that is what a chart is for.
_LOOKUP_ROLES = ("categorical", "text", "geo_region", "geo_point")

# Dimensions a cross-tab can put on its rows and columns.
_CROSS_ROLES = ("categorical", "boolean", "geo_region", "numeric_discrete")

# Positions, not categories: never a series, a category count or a cell.
_POSITIONAL = ("numeric_continuous", "geo_point")

_ADDITIVE_AGGS = ("sum", "count")

_GRAINS = get_args(TimeGrain)

_OHLC = ("open", "high", "low", "close")

_PIVOT_SCOPE_DEFAULT = "column"


def _axis(request):
    """The first ordered dimension (time first), else the first dimension."""
    ordered = [d for d in request.dimensions if d.is_ordered()]
    if ordered:
        return next((d for d in ordered if d.role == "time"), ordered[0])
    return request.dimensions[0] if request.dimensions else None


def _lookup_dimension(request):
    return any(
        d.role == "identifier" or (d.role in _LOOKUP_ROLES and d.bucket() == "high")
        for d in request.dimensions
    )


def _cross_cells(request):
    dims = sorted(
        (d.cardinality for d in request.dimensions if d.role in _CROSS_ROLES), reverse=True
    )
    return dims[0] * dims[1] if len(dims) >= 2 else 0


def _pivot_dims(request):
    """``(rows, columns)``: time goes to the columns, else the smaller dimension does."""
    time = [d for d in request.dimensions if d.role == "time"]
    others = [d for d in request.dimensions if d.role != "time"]
    if time and others:
        return max(others, key=lambda d: d.cardinality), time[0]
    ordered = sorted(request.dimensions, key=lambda d: -d.cardinality)
    return ordered[0], ordered[1]


def _pivot_values_that_fit(request, budget):
    per_value = _pivot_dims(request)[1].axis_points()
    return max(0, min(len(request.metrics), (budget - 1) // max(per_value, 1)))


def _time_columns(request):
    time = [d for d in request.dimensions if d.role == "time"]
    return time[0].axis_points() if time else None


def _dims_small(request):
    return bool(request.dimensions) and all(
        d.bucket() in ("one", "few", "some") for d in request.dimensions
    )


def _mixed_units(request):
    units = {m.unit for m in request.metrics if m.unit}
    textual = any(d.role in ("identifier", "text") for d in request.dimensions)
    return len(units) >= 2 or (textual and bool(request.metrics))


def _additive(metric):
    """A count always adds up; a sum does unless the column says it does not
    (a balance); any other aggregate (an average of fares) never does."""
    if metric.agg == "sum" and metric.card is not None and metric.card.additive is False:
        return False
    return metric.agg in _ADDITIVE_AGGS


def _ohlc_metrics(request):
    words = {w for m in request.metrics for w in re.split(r"[\W_]+", m.name.lower()) if w}
    return all(word in words for word in _OHLC)


def _region_boundaries(request, builtin):
    """A region kind Plotly draws itself, or a GeoJSON the request says exists."""
    regions = [d for d in request.dimensions if d.role == "geo_region"]
    return bool(regions) and (
        request.semantics.boundaries_available or any(d.geo_kind in builtin for d in regions)
    )


_COMPARE = {
    "==": operator.eq,
    "!=": operator.ne,
    ">=": operator.ge,
    "<=": operator.le,
    ">": operator.gt,
    "<": operator.lt,
}
_QUANTITIES = {
    "metrics": lambda r: len(r.metrics),
    "dimensions": lambda r: len(r.dimensions),
    "cross cells": _cross_cells,
    "time columns": _time_columns,
}
_QUANTITY = re.compile(rf"^({'|'.join(_QUANTITIES)}) ({'|'.join(_COMPARE)}) (\d+)$")
_INTENT = re.compile(r"^intent (==|!=) (\w+)$")
_INTENT_IN = re.compile(r"^intent in \(([\w, ]+)\)$")
_AXIS_IS = re.compile(r"^axis is (\w+)$")
_HAS_ROLE = re.compile(r"^has (\w+)$")
_CROSS_IN = re.compile(r"^cross cells in \((\d+), (\d+)\]$")

_SIMPLE = {
    "series <= ideal": lambda r, f: f.ideal is not None and f.series <= f.ideal,
    "two few dimensions": lambda r, f: sum(1 for d in r.dimensions if d.bucket() in ("one", "few"))
    == 2,
    "identifier or high cardinality": lambda r, f: _lookup_dimension(r),
    "dimensions small": lambda r, f: _dims_small(r),
    "mixed units per row": lambda r, f: _mixed_units(r),
    "additive metrics": lambda r, f: bool(r.metrics) and all(_additive(m) for m in r.metrics),
    "ohlc metrics": lambda r, f: _ohlc_metrics(r),
    "region boundaries": lambda r, f: _region_boundaries(r, f.builtin_boundaries),
}


@dataclass
class _Facts:
    """What a clause reads besides the request: the member's series after
    repair and its ideal, and the built-in region kinds."""

    series: int = 1
    ideal: Optional[int] = None
    builtin_boundaries: tuple = ()


def _clause(when):
    """The predicate for one ``when`` string, or ``None`` if it is not in the
    vocabulary, so a rule file is checked for typos before anything is scored."""
    if when in _SIMPLE:
        return _SIMPLE[when]
    if when in Semantics.model_fields:
        return lambda r, f: getattr(r.semantics, when)
    if when.startswith("not "):
        inner = _clause(when[4:])
        return (lambda r, f: not inner(r, f)) if inner else None
    if match := _QUANTITY.match(when):
        quantity, op, n = _QUANTITIES[match[1]], _COMPARE[match[2]], int(match[3])
        return lambda r, f: (value := quantity(r)) is not None and op(value, n)
    if match := _INTENT.match(when):
        op, intent = _COMPARE[match[1]], match[2]
        return lambda r, f: op(r.intent, intent)
    if match := _INTENT_IN.match(when):
        intents = match[1].split(", ")
        return lambda r, f: r.intent in intents
    if match := _AXIS_IS.match(when):
        role = match[1]
        return lambda r, f: _axis(r) is not None and _axis(r).role == role
    if match := _HAS_ROLE.match(when):
        role = match[1]
        return lambda r, f: any(d.role == role for d in r.dimensions)
    if match := _CROSS_IN.match(when):
        low, high = int(match[1]), int(match[2])
        return lambda r, f: low < _cross_cells(r) <= high
    if " and " in when:
        parts = [_clause(part) for part in when.split(" and ")]
        if all(parts):
            return lambda r, f: all(part(r, f) for part in parts)
    return None


def check_vocabulary(rules):
    """Every ``when`` and ``requires`` must parse; a typo would never fire."""
    unknown = [
        f"{rule.name}: {when!r}"
        for rule in rules
        for when in [adj.when for adj in rule.score] + rule.hard_gates.requires
        if _clause(when) is None
    ]
    if unknown:
        raise ValueError("unknown `when` clauses in families.yml: " + "; ".join(unknown))


def _fires(when, request, facts):
    clause = _clause(when)
    if clause is None:
        raise ValueError(f"unknown `when` clause {when!r}")
    return clause(request, facts)


# --- stage 1: hard gates ----------------------------------------------------


def _family_gate(rule, request, facts):
    gates = rule.hard_gates
    axis = _axis(request)
    if gates.ordered_axis_required and not (axis and axis.is_ordered()):
        return "needs an ordered axis (time, a number, or a dimension marked ordered)"
    if axis and gates.axis_roles and axis.role not in gates.axis_roles:
        return f"{axis.column} cannot be the axis; needs {', '.join(gates.axis_roles)}"
    for clause in gates.requires:
        if not _fires(clause, request, facts):
            return f"needs `{clause}`"
    if gates.intents and request.intent is not None and request.intent not in gates.intents:
        return f"only for intents {', '.join(gates.intents)}"
    return None


def _count(n, noun):
    return f"{n} {noun}" if n == 1 else f"{n} {noun}s"


def _main_dimension(request):
    """The largest dimension that is not a position: the chart's categories."""
    candidates = [d for d in request.dimensions if d.role not in _POSITIONAL]
    return max(candidates, key=lambda d: d.axis_points(), default=None)


def _member_gate(name, shape, request):
    """The minimums in a member's ``data_shape`` (and ``max: 0``, a type that
    takes none). A dimension past the maximum may be off-role, since a repair
    folds it away."""
    n_metrics, n_dims = len(request.metrics), len(request.dimensions)
    if shape.metrics.max == 0 and n_metrics:
        return f"{name} takes no metrics; it draws the rows themselves"
    if n_metrics < shape.metrics.min:
        return f"{name} needs at least {_count(shape.metrics.min, 'metric')}, has {n_metrics}"
    if n_dims < shape.dimensions.min:
        return f"{name} needs at least {_count(shape.dimensions.min, 'dimension')}, has {n_dims}"
    if shape.dimension_roles:
        off_role = [d for d in request.dimensions if d.role not in shape.dimension_roles]
        drawn = n_dims if shape.dimensions.max is None else min(n_dims, shape.dimensions.max)
        if off_role and n_dims - len(off_role) < drawn:
            d = off_role[0]
            return f"{d.column} is {d.role}; {name} takes {', '.join(shape.dimension_roles)}"
    axis, main = _axis(request), _main_dimension(request)
    if shape.axis_points and axis and axis.axis_points() < shape.axis_points.min:
        return f"needs at least {shape.axis_points.min} axis points, has {axis.axis_points()}"
    if shape.cardinality and main and main.axis_points() < shape.cardinality.min:
        return (
            f"needs at least {shape.cardinality.min} values of {main.column}, "
            f"has {main.axis_points()}"
        )
    rows = request.context.row_count
    if rows is not None and shape.rows and rows < shape.rows.min:
        return f"needs at least {shape.rows.min} rows, has {rows}"
    if rows is not None and shape.rows_per_group and main:
        per_group = rows // max(main.axis_points(), 1)
        if per_group < shape.rows_per_group.min:
            return f"needs {shape.rows_per_group.min} rows per {main.column}, has {per_group}"
    return None


# --- stage 2: limits and repairs -------------------------------------------


@dataclass
class _View:
    """The request as drawn after the repairs so far."""

    request: RecommendRequest
    counts: dict
    grains: dict
    dropped: set = field(default_factory=set)
    rows: Optional[int] = None

    @classmethod
    def of(cls, request):
        return cls(
            request=request,
            counts={d.column: d.axis_points() for d in request.dimensions},
            grains={d.column: d.time_grain for d in request.dimensions},
            rows=request.context.row_count,
        )

    def dims(self):
        return [d for d in self.request.dimensions if d.column not in self.dropped]

    def n(self, dim):
        return self.counts[dim.column]


def _series_dimension(view, shape, limits):
    """The largest category beyond the dimensions the type itself draws (the
    axis, then coordinates); none for a one-series type."""
    if not limits.series_max or limits.series_max <= 1:
        return None
    axis = _axis(view.request)
    dims = view.dims()
    ordered = ([axis] if axis in dims else []) + [
        d for d in dims if d is not axis and d.role == "geo_point"
    ]
    ordered += [d for d in dims if d not in ordered]
    intrinsic = max(shape.dimensions.min, 1)
    rest = [d for d in ordered[intrinsic:] if d.role not in _POSITIONAL]
    return max(rest, key=view.n, default=None)


def _measures(view, shape, limits):
    """``{measure: (value, limit, dimension a repair acts on)}``."""
    request = view.request
    dims = view.dims()
    out = {}
    if shape.metrics.max is not None:
        out["metrics"] = (len(request.metrics), shape.metrics.max, None)
    if shape.dimensions.max is not None:
        extra = [d for d in dims if d is not _axis(request)]
        off_role = [
            d for d in dims if shape.dimension_roles and d.role not in shape.dimension_roles
        ]
        fold = (off_role or extra or [None])[-1]
        out["dimensions"] = (len(dims), shape.dimensions.max, fold)
    categories = [d for d in dims if d.role not in _POSITIONAL]
    main = max(categories, key=view.n, default=None)
    if shape.cardinality and shape.cardinality.max is not None and main:
        out["cardinality"] = (view.n(main), shape.cardinality.max, main)
    axis = _axis(request)
    if shape.axis_points and shape.axis_points.max is not None and axis in dims:
        out["axis_points"] = (view.n(axis), shape.axis_points.max, axis)
    series_dim = _series_dimension(view, shape, limits)
    if limits.series_max:
        series = view.n(series_dim) if series_dim else 1
        out["series"] = (series, limits.series_max, series_dim)
    if shape.cells and shape.cells.max is not None and categories:
        cells = math.prod(view.n(d) for d in categories) * max(len(request.metrics), 1)
        out["cells"] = (cells, shape.cells.max, main)
    if shape.rows and shape.rows.max is not None:
        rows = _drawn_rows(view)
        if rows is not None:
            out["rows"] = (rows, shape.rows.max, None)
    return out


def _drawn_rows(view):
    """Every row when nothing is aggregated, else one per group (a latitude
    and a longitude are one place), never more than the model has."""
    if not view.request.metrics:
        return view.rows
    dims = view.dims()
    points = max((view.n(d) for d in dims if d.role == "geo_point"), default=1)
    groups = points * math.prod(view.n(d) for d in dims if d.role != "geo_point")
    return groups if view.rows is None else min(groups, view.rows)


def _regrain(dim, target, view, steps):
    """Coarsen one grain at a time until the points fit; an unknown grain fits."""
    grain, points = view.grains[dim.column], view.n(dim)
    if grain is None:
        view.counts[dim.column] = target
        return
    while points > target and grain in steps:
        points = math.ceil(points / steps[grain])
        grain = _GRAINS[_GRAINS.index(grain) + 1]
    view.counts[dim.column], view.grains[dim.column] = points, grain


def _apply(transform, measure, value, target, dim, view, steps):
    if measure == "rows":
        view.rows = target
    elif measure == "dimensions":
        view.dropped.add(dim.column)
    elif measure == "series" and transform.name in ("input_filter", "small_multiples"):
        view.counts[dim.column] = 1
    elif transform.name == "regrain":
        _regrain(dim, max(1, view.n(dim) * target // value), view, steps)
    else:
        view.counts[dim.column] = max(1, view.n(dim) * target // value)


def _fixes(transform, measure, dim, view):
    if transform is None or measure not in transform.fixes:
        return False
    if measure == "dimensions":
        return dim is not None
    if measure == "rows":
        return not transform.roles or any(transform.acts_on(d.role) for d in view.dims())
    return dim is not None and transform.acts_on(dim.role)


@dataclass
class _Outcome:
    member: Optional[object]
    reason: Optional[str] = None
    transforms: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    alternatives: List[str] = field(default_factory=list)
    score: float = 0.0
    why: List[str] = field(default_factory=list)
    unfixed: int = 0
    steps: int = 0
    cuts: List[str] = field(default_factory=list)
    repaired: Repaired = Repaired()


def _crowded(dim, kept):
    """``(Other's share, the largest share)`` when keeping ``kept - 1`` values
    would leave Other the largest, from the card's top values; else ``None``."""
    shares = sorted((t.share for t in dim.top_n), reverse=True)
    if len(shares) < kept:
        return None
    other = 1 - sum(shares[: kept - 1])
    return (other, shares[0]) if other > shares[0] else None


def _repair(outcome, name, shape, limits, request, transforms):
    """Try the entry's repairs, in order, on every range it overflows; every
    application is a step, and a chart named before the first repair that
    fixes a range is drawn instead. Returns the series drawn after."""
    view = _View.of(request)
    charts = [r for r in limits.repair if transforms.get(r) is None]
    for measure in get_args(Measure):
        current = _measures(view, shape, limits).get(measure)
        if current is None:
            continue
        value, limit, dim = current
        label = f"{dim.column} values" if measure == "cardinality" else measure.replace("_", " ")
        if value <= limit:
            if measure == "series" and limits.series_ideal and value > limits.series_ideal:
                outcome.warnings.append(
                    f"{value} series is readable but above the ideal of {limits.series_ideal}"
                )
            continue
        target = (limits.series_ideal or limit) if measure == "series" else limit
        fix, switch, crowded = None, None, None
        for item in limits.repair:
            transform = transforms.get(item)
            if transform is None:
                switch = switch or item
            elif _fixes(transform, measure, dim, view):
                crowded = limits.other_not_largest and transform.other and _crowded(dim, target)
                if not crowded:
                    fix = transform
                    break
        if fix is None or switch:
            outcome.unfixed += 1
            outcome.alternatives += [c for c in charts if c not in outcome.alternatives]
            why = f"{value} {label} exceeds the {limit} {name} stays readable with"
            if crowded:
                other, largest = crowded
                why += (
                    f"; top_n_other would leave Other {other:.0%} of the rows, more than the "
                    f"largest {dim.column} ({largest:.0%})"
                )
            if fix is not None:
                why += f"; draw a {switch} instead"
            else:
                others = f"; consider {', '.join(charts)}" if charts else ""
                why += f", and nothing in its repair list fixes it{others}"
            outcome.warnings.append(why)
            continue
        _apply(fix, measure, value, target, dim, view, transforms.regrain_steps)
        outcome.steps += 1
        after = _measures(view, shape, limits).get(measure, (target,))[0]
        shown = view.n(dim) if dim is not None and measure != "dimensions" else after
        if fix.name not in outcome.transforms:
            outcome.transforms.append(fix.name)
        if fix.other and dim is not None and dim.column not in outcome.cuts:
            outcome.cuts.append(dim.column)
        outcome.warnings.append(f"{value} {label} exceeds {limit}; {fix.name} brings it to {shown}")
        if after > limit:
            outcome.unfixed += 1
    series = _series_dimension(view, shape, limits)
    outcome.repaired = Repaired(
        dropped=tuple(d.column for d in request.dimensions if d.column in view.dropped),
        counts=dict(view.counts),
        series=series.column if series else None,
    )
    return _measures(view, shape, limits).get("series", (1,))[0]


# --- stage 3: score ----------------------------------------------------------


def _score(rule, request, facts):
    total, why = 0.0, []
    for adjustment in rule.score:
        if _fires(adjustment.when, request, facts):
            total += adjustment.delta
            why.append(adjustment.reason)
    return total, why


def _evaluate(rule, member, request, doc):
    shape = member.data_shape if member else rule.data_shape
    limits = member.limits if member else Limits()
    name = member.type if member else rule.name
    outcome = _Outcome(member=member, reason=_member_gate(name, shape, request))
    if outcome.reason:
        return outcome
    outcome.warnings = list(rule.warnings) + (list(member.warnings) if member else [])
    outcome.alternatives = list(member.alternatives) if member else []
    series = _repair(outcome, name, shape, limits, request, doc.transforms)
    if rule.skeleton == "pivot":
        budget = doc.tables.column_budget.full_width
        columns = 1 + _pivot_dims(request)[1].axis_points()
        fits = _pivot_values_that_fit(request, budget)
        if columns > budget:
            outcome.unfixed += 1
            outcome.warnings.append(
                f"a pivot would have {columns} columns with one value, more than {budget}; "
                "it scrolls sideways at 1024 px, so swap the dimensions or regrain"
            )
        elif fits < len(request.metrics):
            outcome.warnings.append(
                f"only {fits} of {len(request.metrics)} values fit the {budget}-column budget; "
                "the skeleton keeps the first, or swap the dimensions"
            )
    facts = _Facts(series, limits.series_ideal, doc.builtin_boundaries)
    score, why = _score(rule, request, facts)
    penalties = doc.penalties
    score -= penalties.repair * outcome.steps + penalties.out_of_range * outcome.unfixed
    if member is not None and member.status == "niche":
        score -= penalties.niche
        why.append(f"{member.type} is a niche type; it ranks only with a reason")
    outcome.why = (why or ["admitted by its gates"]) + [f"after {t}" for t in outcome.transforms]
    outcome.score = round(score, 3)
    return outcome


def _best(rule, request, doc):
    """The requested member if it is admitted, else the admitted member with
    the fewest ranges out of bounds, then preferred over niche, then the fewest
    repairs, then the highest score, then the first listed; else the requested
    or first member's rejection. Deprecated members never draw."""
    members = [m for m in rule.members if m.status != "deprecated"] or [None]
    outcomes = [_evaluate(rule, m, request, doc) for m in members]
    asked = next((o for o in outcomes if o.member and o.member.type == request.requested), None)
    admitted = [o for o in outcomes if o.reason is None]
    if not admitted:
        return asked or outcomes[0]
    if asked and asked.reason is None:
        return asked
    best = min(
        admitted,
        key=lambda o: (
            o.unfixed,
            o.member is not None and o.member.status == "niche",
            o.steps,
            -o.score,
        ),
    )
    if asked:
        best.warnings.append(
            f"{asked.member.type} was asked for, but {asked.reason}; drawn as {best.member.type}"
        )
    return best


def _asked_for(rule, request):
    return request.requested is not None and (
        request.requested == rule.name or request.requested in rule.trace_types
    )


# --- skeletons ---------------------------------------------------------------


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
    fits = _pivot_values_that_fit(request, tables.column_budget.full_width)
    values = [
        (
            metric_sql(m, request.context.model)
            if m.defined
            else f"{m.agg if m.agg in rule.values.aggs else 'sum'}({_column_ref(request, m.name)})"
        )
        for m in request.metrics[: max(1, min(rule.values.max, fits))]
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


def _encodings(rule, member, tables):
    if rule.skeleton == "pivot":
        rules = tables.pivot_rules
        return {
            "rows": rules.rows,
            "columns": rules.columns,
            "format_cells": "; ".join(f"{k}: {v}" for k, v in rules.format_cells.scope.items()),
        }
    return {v.when: v.then for v in member.variations} if member else {}


def _wants_detail_table(request):
    """A chart over a long list of lookup values needs the rows behind it."""
    return any(
        d.role in _LOOKUP_ROLES and d.bucket() in ("many", "high") for d in request.dimensions
    )


@dataclass(frozen=True)
class _Doc:
    families: list
    penalties: object
    builtin_boundaries: tuple
    transforms: object
    pairings: object
    tables: object


@lru_cache(maxsize=1)
def _doc():
    families = load_family_doc()
    return _Doc(
        families=families.families,
        penalties=families.penalties,
        builtin_boundaries=tuple(families.builtin_boundaries),
        transforms=load_transforms(),
        pairings=load_pairings(),
        tables=load_tables(),
    )


def _kind(rule, member, doc):
    """What a chart's name ends in: its trace type, or the family where
    several families draw that type (a scatter is a line, an area or xy)."""
    drawn_by = [f for f in doc.families if member.type in f.trace_types]
    return member.type if len(drawn_by) == 1 else rule.name


def _recommendation(rule, outcome, request, doc):
    member = outcome.member
    pairings = list(member.pairings) if member else []
    warnings = list(outcome.warnings)
    skeleton = example = table_yaml = None
    if rule.skeleton == "chart":
        if _wants_detail_table(request) and "detail_table_below" not in pairings:
            pairings.append("detail_table_below")
        other = doc.transforms.get("top_n_other").other
        built = chart_skeleton(
            member,
            request,
            rule.props,
            outcome.cuts,
            other,
            kind=_kind(rule, member, doc),
            repaired=outcome.repaired,
        )
        if built.adapted:
            skeleton = built.yaml
        else:
            example = built.yaml
            warnings.append(
                f"no runnable skeleton: {built.reason}; example_yaml is the {member.type} "
                "example as written, a pattern to map your columns onto, not a chart to paste"
            )
    elif rule.skeleton == "pivot":
        table_yaml = pivot_skeleton(request, doc.tables)
    else:
        table_yaml = table_skeleton(request, doc.tables)
    return Recommendation(
        family=rule.name,
        trace_type=member.type if member and member.type in TRACE_TYPES else None,
        score=outcome.score,
        why=outcome.why,
        encodings=_encodings(rule, member, doc.tables),
        transforms=outcome.transforms,
        warnings=warnings,
        yaml_skeleton=skeleton,
        example_yaml=example,
        table_yaml=table_yaml,
        pairings=pairings,
        alternatives=outcome.alternatives,
        layout=member.layout if member else rule.layout_hint(),
        skill=rule.skill,
    )


def recommend(request, rules=None):
    """Rank the families that admit ``request``, explaining every decision."""
    if not isinstance(request, RecommendRequest):
        request = RecommendRequest(**request)
    doc = _doc()
    rules = rules if rules is not None else doc.families
    check_vocabulary(rules)
    admitted, rejected, refused = [], [], []
    facts = _Facts(builtin_boundaries=doc.builtin_boundaries)
    for rule in rules:
        asked = _asked_for(rule, request)
        reason = _family_gate(rule, request, facts)
        outcome = None if reason else _best(rule, request, doc)
        reason = reason or outcome.reason
        if reason:
            rejected.append(Rejection(family=rule.name, reason=reason))
            refused += [rejected[-1]] if asked else []
            continue
        if asked:
            outcome.why.append("asked for by name, so it ranks first; its warnings are the cost")
        admitted.append((asked, rule, outcome))
    admitted.sort(key=lambda entry: (not entry[0], -entry[2].score))
    top = [
        _recommendation(rule, outcome, request, doc)
        for _, rule, outcome in admitted[: request.context.max_results]
    ]
    if top and refused and not (admitted and admitted[0][0]):
        top[0].warnings.append(
            f"{request.requested} was asked for, but {refused[0].family}: {refused[0].reason}"
        )
    suggested = list(dict.fromkeys(t for rec in top for t in rec.transforms))
    return RecommendResponse(recommendations=top, rejected=rejected, transforms_suggested=suggested)


SKELETONS_RETURNED = 3


def compact(response, skeletons=SKELETONS_RETURNED):
    """The response as the tool returns it: empty fields dropped, skeletons
    and encodings for the first ``skeletons`` only, and how to apply each
    suggested transform and named pairing, once."""
    doc = _doc()
    recommendations, named = [], []
    for index, rec in enumerate(response.recommendations):
        item = {k: v for k, v in rec.model_dump(exclude_none=True).items() if v not in ([], {})}
        if index >= skeletons:
            for key in ("yaml_skeleton", "example_yaml", "table_yaml", "encodings"):
                item.pop(key, None)
        else:
            named += [p for p in rec.pairings if p not in named]
        recommendations.append(item)
    return {
        "recommendations": recommendations,
        "transforms": {
            name: doc.transforms.get(name).instructions() for name in response.transforms_suggested
        },
        "pairings": {
            reference: doc.pairings.get(split_pairing(reference)[0]).model_dump(
                exclude_none=True, exclude_defaults=True, exclude={"name"}
            )
            for reference in named
        },
        "rejected": [f"{r.family}: {r.reason}" for r in response.rejected],
    }
