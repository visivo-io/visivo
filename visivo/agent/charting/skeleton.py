"""Chart skeletons: a member entry's ``example``, rewritten for a request.

The example encodes the gotchas, so the skeleton keeps it and swaps the data:
each ``?{ }`` is parsed with SQLGlot, each aggregate becomes a request metric
and each column a request dimension of the role the example uses it in. An
adapted skeleton reads only the request's columns. When the example cannot
carry the request, the result is the example as written, ``adapted`` is false
and ``reason`` says why: a pattern to follow, not a chart to run. Either way
it validates as Insights in a Chart.
"""

import math
import re
from dataclasses import dataclass, field
from typing import NamedTuple, Optional

import sqlglot
import yaml
from sqlglot import exp

from visivo.agent.charting.rules import load_yaml
from visivo.models.chart import Chart
from visivo.models.insight import Insight
from visivo.query.patterns import QUERY_STRING_VALUE_PATTERN, normalize_name, replace_refs

_TIME_FUNCS = (
    exp.TimestampTrunc,
    exp.DateTrunc,
    exp.Extract,
    exp.DayOfWeek,
    exp.DayOfWeekIso,
    exp.TimeToStr,
)
_TIME_NAMES = ("dayname", "monthname")
_NUMERIC_FUNCS = (exp.Least, exp.Greatest, exp.Round, exp.Floor, exp.Ceil, exp.Div, exp.Mul)
_CLIPS = (exp.Least, exp.Greatest)
_PLACEHOLDER = re.compile(r"__ref_(\d+)__")
_TOKEN = re.compile(r"__col_\d+__")
_GROUPS = ("query_string", "slice")

# The roles a column used this way should come from; a bare column takes any.
_ROLES_FOR = {
    "time": ("time",),
    "numeric": ("numeric_continuous", "numeric_discrete"),
}


@dataclass
class _Site:
    """One ``?{ }`` string in the example and where it sits; ``owner`` is the
    list and item it belongs to when it sits in a list of a prop."""

    container: object
    key: object
    insight: int
    kind: str
    prop: Optional[str]
    text: str
    slice: Optional[str]
    owner: Optional[tuple] = None
    tree: Optional[exp.Expression] = None


@dataclass
class _Slots:
    """The example's columns in order of first use, the way each is used,
    which feed a required prop, its aggregates, and which it splits on."""

    order: list = field(default_factory=list)
    kinds: dict = field(default_factory=dict)
    required: set = field(default_factory=set)
    aggs: list = field(default_factory=list)
    splits: set = field(default_factory=set)


def _is_time(node):
    return isinstance(node, _TIME_FUNCS) or (
        isinstance(node, exp.Anonymous) and node.name.lower() in _TIME_NAMES
    )


def _inside_agg(node):
    return node.find_ancestor(exp.AggFunc) is not None


def _outer_aggs(tree):
    return [a for a in tree.find_all(exp.AggFunc, bfs=False) if not _inside_agg(a)]


def _placeholders(tree):
    return [c for c in tree.find_all(exp.Column, bfs=False) if _PLACEHOLDER.fullmatch(c.name)]


def _slot_kind(column):
    parent = column.parent
    while parent is not None and not isinstance(parent, (exp.Ordered, exp.Order)):
        if _is_time(parent):
            return "time"
        if isinstance(parent, _NUMERIC_FUNCS):
            return "numeric"
        parent = parent.parent
    return "category"


def _sites(example):
    pattern = re.compile(QUERY_STRING_VALUE_PATTERN)
    sites = []

    def walk(node, index, prop, owner):
        items = list(node.items()) if isinstance(node, dict) else list(enumerate(node))
        for key, value in items:
            top = prop if prop is not None else key
            here = (node, value) if isinstance(node, list) else owner
            if isinstance(value, str) and (match := pattern.match(value)):
                groups = match.group(*_GROUPS)
                sites.append(_Site(node, key, index, "prop", top, *groups, owner=here))
            elif isinstance(value, (dict, list)):
                walk(value, index, top, here)

    for index, insight in enumerate(example.get("insights") or []):
        walk(insight.get("props") or {}, index, None, None)
        for interaction in insight.get("interactions") or []:
            for kind, value in interaction.items():
                if match := pattern.match(str(value)):
                    sites.append(
                        _Site(interaction, kind, index, kind, None, *match.group(*_GROUPS))
                    )
    return sites


def _parse(site, refs):
    text = replace_refs(
        site.text,
        lambda model, column: refs.setdefault((model, column), f"__ref_{len(refs)}__"),
    )
    if site.kind == "sort":
        return sqlglot.parse_one(f"SELECT 1 ORDER BY {text}", read="duckdb").args["order"]
    return sqlglot.parse_one(text, read="duckdb")


_AGG_SQL = {"count": "COUNT(*)", "count_distinct": "COUNT(DISTINCT {})", "rate": "AVG({})"}


def ref_text(model, name):
    """``${ref(model).name}``, or ``${ref(name)}`` for a project-level object."""
    return f"${{ref({model}).{name}}}" if model else f"${{ref({name})}}"


def _metric_sql(metric, column_of):
    """The request metric as SQL; ``column_of(name, model)`` turns a name into
    its token. A defined metric already aggregates, so it is not wrapped again."""
    if metric.defined == "project":
        return column_of(metric.name, None)
    if metric.defined == "model":
        return column_of(metric.name)
    sql = _AGG_SQL.get(metric.agg, f"{metric.agg.upper()}({{}})")
    return sql.format(column_of(metric.name))


def metric_sql(metric, model):
    """The request metric as SQL over ``model``, with its refs written out."""
    return _metric_sql(metric, lambda name, owner=model: ref_text(owner, name))


class _Unadaptable(ValueError):
    pass


def _ordered_dims(request):
    axis = next((d for d in request.dimensions if d.role == "time"), None)
    axis = axis or next((d for d in request.dimensions if d.is_ordered()), None)
    return ([axis] if axis else []) + [d for d in request.dimensions if d is not axis]


class _Named:
    """A dimension or metric under one name, so ``_named`` reads both."""

    def __init__(self, name, item):
        self.name, self.item = name, item


def _last_word(name):
    return name.lower().rsplit("_", 1)[-1]


def _named(column, candidates, taken, loose=False):
    """The candidate named ``column``; when ``loose``, else the one whose
    last word starts with the column's (``pickup_lat`` and ``latitude``) if
    only one does."""
    free = [c for c in candidates if c not in taken]
    exact = [c for c in free if c.name == column]
    if exact or not loose:
        return exact[0] if exact else None
    word = _last_word(column)
    close = [c for c in free if _last_word(c.name).startswith(word)]
    return close[0] if len(close) == 1 else None


def _assign(slots, request, example_columns, skip=(), series=None):
    """``(dims, raw_metrics, metrics, left, agg_dims)``: example column →
    ShapeCard, example column → MetricSpec, aggregate → MetricSpec, the
    dimensions with no place, and aggregate → ShapeCard (``avg(pickup_lat)``
    over the request's own coordinates draws them per row).

    By name first (a dimension by its exact name, so the axis still comes
    first as the recommender counts series; a coordinate or an aggregate's
    column also by its last word), then by the role the example uses each
    column in, required columns before optional ones; a name match that
    leaves a required column empty gives its dimension back. ``skip`` are
    the dimensions a repair turned into an input, which the chart does not
    draw; ``series`` the one the recommender counted as series, which only
    a split may draw."""
    pool = [d for d in _ordered_dims(request) if d.column not in skip]
    dims_named = [_Named(d.column, d) for d in pool]
    metrics_named = [_Named(m.name, m) for m in request.metrics]
    named, raw_named, agg_metrics, agg_dims, taken = {}, {}, {}, {}, []
    for placeholder in slots.order:
        column = example_columns[placeholder]
        free = [n for n in dims_named if placeholder in slots.splits or n.name != series]
        coordinates = [n for n in free if n.item.role == "geo_point"]
        hit = _named(column, free, taken) or _named(column, coordinates, taken, True)
        if hit:
            named[placeholder] = hit.item
        elif hit := _named(column, metrics_named, taken):
            raw_named[placeholder] = hit.item
        if hit:
            taken.append(hit)
    for key, inner in slots.aggs:
        columns = {example_columns[p] for p in inner}
        if len(columns) != 1:
            continue
        if hit := _named(columns.pop(), metrics_named, taken):
            agg_metrics[key] = hit.item
        elif hit := _named(example_columns[inner[0]], dims_named, taken, loose=True):
            agg_dims[key] = hit.item
        if hit:
            taken.append(hit)
    required = [p for p in slots.order if p in slots.required]
    releasable = [p for p in reversed(slots.order) if p in named and p not in slots.required]
    pool = [d for d in pool if d not in agg_dims.values()]
    while True:
        names = (dict(named), dict(raw_named), agg_metrics, agg_dims)
        mapping = _fill(slots, pool, request.metrics, names, series)
        dims, raw_metrics = mapping[0], mapping[1]
        starved = [p for p in required if p not in dims and p not in raw_metrics]
        if not starved or not releasable:
            return (*mapping, agg_dims)
        named.pop(releasable.pop(0))


def _fill(slots, pool, metrics, names, series):
    """Fill what names left: the remaining aggregates (those not drawing a
    dimension) take metrics in order; the metrics still left keep the last
    required columns, so a raw ``y`` takes the value and ``x`` the
    dimension; dimensions fill the rest."""
    dims, raw_metrics, agg_metrics, agg_dims = names
    agg_metrics = dict(agg_metrics)
    dims_left = [d for d in pool if d not in dims.values()]
    metrics_left = [
        m for m in metrics if m not in raw_metrics.values() and m not in agg_metrics.values()
    ]
    for key, _ in slots.aggs:
        if key not in agg_metrics and key not in agg_dims and metrics_left:
            agg_metrics[key] = metrics_left.pop(0)
    required = [p for p in slots.order if p in slots.required]
    optional = [p for p in slots.order if p not in slots.required]
    open_required = [p for p in required if p not in dims and p not in raw_metrics]
    keep = open_required[max(0, len(open_required) - len(metrics_left)) :]
    for placeholder in keep:
        raw_metrics[placeholder] = metrics_left.pop(0)
    for group in (required, optional):
        for by_role in (True, False):
            for placeholder in group:
                if placeholder in dims or placeholder in raw_metrics:
                    continue
                roles = _ROLES_FOR.get(slots.kinds[placeholder])
                fits = (
                    d
                    for d in dims_left
                    if (not by_role or roles is None or d.role in roles)
                    and (placeholder in slots.splits or d.column != series)
                )
                match = next(fits, None)
                if match is not None:
                    dims[placeholder] = match
                    dims_left.remove(match)
    if metrics_left:
        raise _Unadaptable("a request metric has no place in the example")
    return dims, raw_metrics, agg_metrics, dims_left


def _swap(site, node, new):
    if node is site.tree:
        site.tree = new
    else:
        node.replace(new)


def _places(value):
    text = repr(float(value))
    return None if "e" in text else len(text.split(".")[1].rstrip("0"))


def _rounded(value, stats):
    """``value`` at the precision of the column's min and max, else to four
    significant digits."""
    places = [_places(v) for v in (stats.min, stats.max) if isinstance(v, (int, float))]
    if places and None not in places and max(places) <= 4:
        digits = max(places)
        return round(value, digits) if digits else int(round(value))
    return float(f"{value:.4g}")


def _rewrite(site, mapping, new_ref, clips):
    """Swap the request's columns into one parsed expression. Returns the
    request names it now reads, or ``None`` when it reads an example column
    the request has no match for; a ``count(*)`` with no metric stays."""
    dims, raw_metrics, metrics, _, agg_dims = mapping
    used = []
    for agg in _outer_aggs(site.tree):
        key = agg.sql(dialect="duckdb")
        metric = metrics.get(key)
        if metric is None and key in agg_dims:
            _swap(site, agg, exp.column(new_ref(agg_dims[key].column)))
            used.append(agg_dims[key].column)
            continue
        if metric is None:
            if _placeholders(agg):
                return None
            continue
        _swap(site, agg, sqlglot.parse_one(_metric_sql(metric, new_ref), read="duckdb"))
        used.append(metric.name)
    for column in _placeholders(site.tree):
        placeholder = column.name
        if placeholder in raw_metrics:
            metric = raw_metrics[placeholder]
            _swap(site, column, sqlglot.parse_one(_metric_sql(metric, new_ref), read="duckdb"))
            used.append(metric.name)
            continue
        if placeholder not in dims:
            return None
        dim = dims[placeholder]
        target = exp.column(new_ref(dim.column))
        wrapper = column.parent
        if _is_time(wrapper) and dim.role != "time":
            _swap(site, wrapper, target)
        elif isinstance(wrapper, (exp.TimestampTrunc, exp.DateTrunc)) and dim.time_grain:
            wrapper.set("unit", exp.var(dim.time_grain.upper()))
            _swap(site, column, target)
        elif isinstance(wrapper, _CLIPS):
            p99 = dim.stats.p99 if dim.stats else None
            if p99 is None:
                _swap(site, wrapper, target)
            else:
                clips[dim.column] = _rounded(p99, dim.stats)
                cap = exp.Literal.number(clips[dim.column])
                _swap(site, wrapper, exp.Least(this=target, expressions=[cap]))
        else:
            _swap(site, column, target)
        used.append(dim.column)
    return used


def _render(site, tokens):
    if site.kind == "sort":
        text = ", ".join(e.sql(dialect="duckdb") for e in site.tree.expressions)
    else:
        text = site.tree.sql(dialect="duckdb")
    text = _TOKEN.sub(lambda m: tokens[m.group(0)], text)
    return f"?{{ {text} }}{site.slice or ''}"


def _label(name):
    return name.replace("_", " ").strip().capitalize()


def _example(member):
    return load_yaml(member.example)


@dataclass
class _Adapted:
    """The rewritten example, the dimensions it draws, the dimension on each
    top-level prop, and the caps a clip applied."""

    example: dict
    drawn: list = field(default_factory=list)
    axes: dict = field(default_factory=dict)
    clips: dict = field(default_factory=dict)


def _flat_hierarchy(example, member, request, skip):
    """An example that builds a nodes model, drawn for one level: each value
    a top-level node, so no model is needed."""
    dims = [d for d in request.dimensions if d.column not in skip]
    if "parents" not in member.required_props or len(dims) != 1 or len(request.metrics) != 1:
        raise _Unadaptable(
            "the example builds its own nodes model (one row per node: id, label, parent, "
            f"value), which a skeleton cannot build over `{request.context.model}`"
        )
    insight = example["insights"][0]
    model, (dim,) = request.context.model, dims
    props = {k: v for k, v in insight["props"].items() if not str(v).startswith("?{")}
    props.update(
        labels=f"?{{ ${{ref({model}).{dim.column}}} }}",
        parents="?{ '' }",
        values=f"?{{ {metric_sql(request.metrics[0], model)} }}",
    )
    props.pop("maxdepth", None)
    return _Adapted({"insights": [{"name": insight["name"], "props": props}]}, drawn=[dim])


def _drop_item(site, doomed):
    """An unmatched entry of a list prop (one parcats dimension) goes; the
    rest of the list stays."""
    if site.owner is None:
        return False
    doomed.append(site.owner)
    return True


def _adapt(member, request, skip=(), series=None):
    example = _example(member)
    if set(example) - {"insights", "charts"}:
        return _flat_hierarchy(example, member, request, skip)
    sites = [s for s in _sites(example) if s.kind != "filter"]
    refs = {}
    for site in sites:
        site.tree = _parse(site, refs)
    if len({model for model, _ in refs}) > 1:
        raise _Unadaptable("the example reads two models, which one request cannot fill")
    example_columns = {placeholder: column for (_, column), placeholder in refs.items()}
    slots = _Slots()
    for site in sites:
        for agg in _outer_aggs(site.tree):
            key = agg.sql(dialect="duckdb")
            if key not in [k for k, _ in slots.aggs]:
                slots.aggs.append((key, [c.name for c in _placeholders(agg)]))
        for column in _placeholders(site.tree):
            if site.prop in member.required_props:
                slots.required.add(column.name)
            if site.kind == "split":
                slots.splits.add(column.name)
            if not _inside_agg(column) and column.name not in slots.kinds:
                slots.order.append(column.name)
                slots.kinds[column.name] = _slot_kind(column)
                measured = site.prop in member.required_props and member.data_shape.metrics.max == 0
                if measured and slots.kinds[column.name] == "category":
                    slots.kinds[column.name] = "numeric"
    mapping = _assign(slots, request, example_columns, skip, series)
    main = next(
        (i for i in example["insights"] if i.get("props", {}).get("type") == member.type),
        example["insights"][0],
    )
    extra = mapping[3]
    tokens, clips, doomed = {}, {}, []
    by_column = {d.column: d for d in request.dimensions}

    def new_ref(column, model=request.context.model):
        return tokens.setdefault(ref_text(model, column), f"__col_{len(tokens)}__")

    drawn = list(mapping[0].values()) + list(mapping[4].values()) + extra
    result = _Adapted(example, drawn=drawn, clips=clips)
    for site in sites:
        used = _rewrite(site, mapping, new_ref, clips)
        insight = example["insights"][site.insight]
        if used is not None:
            site.container[site.key] = _render(site, {t: ref for ref, t in tokens.items()})
            if isinstance(site.container, dict) and "label" in site.container and len(used) == 1:
                site.container["label"] = _label(used[0])
            drawn = [by_column[u] for u in used if u in by_column]
            if site.kind == "prop" and site.key == site.prop and len(drawn) == 1:
                result.axes[site.prop] = drawn[0]
        elif site.kind != "prop":
            insight["interactions"].remove(site.container)
        elif _drop_item(site, doomed):
            continue
        elif site.prop in member.required_props:
            raise _Unadaptable(f"nothing in the request maps to `{site.prop}`")
        else:
            insight["props"].pop(site.prop, None)
    for items, item in doomed:
        if any(x is item for x in items):
            items.remove(item)
    for insight in example["insights"]:
        for prop in member.required_props:
            if insight["props"].get(prop) == []:
                raise _Unadaptable(f"nothing in the request maps to `{prop}`")
        kept = [i for i in insight.get("interactions") or [] if "filter" not in i]
        insight.pop("interactions", None)
        if kept:
            insight["interactions"] = kept
    _label_points(main, member, result)
    has_split = any("split" in i for i in main.get("interactions") or [])
    most = member.data_shape.dimensions.max
    drawn = len(mapping[0]) + len(mapping[4])
    splits = (member.limits.series_max or 1) > 1 and (most is None or most > drawn)
    if len(extra) > 1 or (extra and (has_split or not splits)):
        raise _Unadaptable("a request column has no place in the example")
    if extra:
        split = {"split": f"?{{ ${{ref({request.context.model}).{extra[0].column}}} }}"}
        main["interactions"] = [split, *(main.get("interactions") or [])]
    for site in sites:
        insight = example["insights"][site.insight]
        ordered = any("sort" in i for i in insight.get("interactions", []))
        if site.kind == "prop" and site.slice not in (None, "[0]") and not ordered:
            site.container.pop(site.key, None)
    return result


def _label_points(insight, member, adapted):
    """A dimension the type draws as its points (a zone per 3D point), not
    as series: when the props draw fewer dimensions than the type needs, a
    split holding one becomes the points' ``text``."""
    on_props = len({d.column for d in adapted.axes.values()})
    splits = [i for i in insight.get("interactions") or [] if "split" in i]
    if not splits or on_props >= member.data_shape.dimensions.min or "text" in insight["props"]:
        return
    insight["props"]["text"] = splits[0]["split"]
    insight["interactions"].remove(splits[0])
    if not insight["interactions"]:
        insight.pop("interactions")


def _main(example, member):
    return next(
        (i for i in example.get("insights") or [] if i["props"].get("type") == member.type),
        None,
    )


def _order_axes(adapted, member, request, cuts):
    """Each axis in the entry's ``order_axes``: time chronological (a sort),
    a cut column by its rank (``_mark_other`` adds that sort), any other
    category by the metric's total, largest first reading left to right and
    top to bottom (``y`` counts up from the bottom). The example's own sorts
    are what this replaces."""
    insight = _main(adapted.example, member)
    if not member.order_axes or insight is None:
        return
    pattern = re.compile(QUERY_STRING_VALUE_PATTERN)
    sorts = []
    charts = adapted.example.setdefault("charts", [{}])
    layout = charts[0].setdefault("layout", {})
    for prop in member.order_axes:
        dim = adapted.axes.get(prop)
        if dim is None:
            continue
        axis = layout.setdefault(f"{prop}axis", {})
        axis.pop("categoryorder", None)
        if dim.role == "time":
            inner = pattern.match(insight["props"][prop]).group("query_string")
            sorts.append({"sort": f"?{{ {inner} ASC }}"})
        elif dim.column not in cuts:
            axis["categoryorder"] = "total descending" if prop == "x" else "total ascending"
        if not axis:
            layout.pop(f"{prop}axis")
    if not layout:
        charts[0].pop("layout")
    kept = [i for i in insight.get("interactions") or [] if "sort" not in i] + sorts
    insight.pop("interactions", None)
    if kept:
        insight["interactions"] = kept


def _trim_labels(adapted, member, counts):
    """Value labels only while the entry's ``text_labels`` says they read."""
    insight = _main(adapted.example, member)
    if member.text_labels is None or insight is None:
        return
    marks = math.prod(counts.get(d.column, d.axis_points()) for d in adapted.drawn)
    if marks > member.text_labels.max_marks:
        for prop in ("text", "texttemplate", "textposition"):
            insight["props"].pop(prop, None)


def _phrase(words):
    return words[0] if len(words) == 1 else f"{', '.join(words[:-1])} and {words[-1]}"


def _subject(request, skip):
    """``(what, by)``: the first metric, else the last continuous column (the
    one a box or a histogram measures), and the dimensions drawn against it."""
    dims = [d for d in _ordered_dims(request) if d.column not in skip]
    if request.metrics:
        return request.metrics[0].name, [d.column for d in dims]
    measured = [d for d in dims if d.role == "numeric_continuous"]
    if not measured:
        return "rows", [d.column for d in dims]
    return measured[-1].column, [d.column for d in dims if d is not measured[-1]]


def _names(request, kind, skip):
    """``(base name, title)``, after every dimension drawn and the chart kind,
    so two recommendations for one request never share a name."""
    what, by = _subject(request, skip)
    name = f"{what}-by-{_phrase(by).replace(', ', '-').replace(' and ', '-and-')}" if by else what
    title = _label(what) + (f" by {_phrase([b.replace('_', ' ') for b in by])}" if by else "")
    return normalize_name(f"{name}-{kind}" if kind else name), title


def _wrap(example, base, member, props, title=None):
    """Rename the insights after the request, set the family's props, title
    the chart and wrap them in one chart."""
    insights = example.get("insights") or []
    renames = {}
    for insight in insights:
        new = base if len(insights) == 1 else f"{base}-{insight['name']}"
        renames[insight["name"]] = new
        insight["name"] = new
        if insight.get("props", {}).get("type") == member.type:
            insight["props"].update(props)
    chart = (example.get("charts") or [{}])[0]
    chart["name"] = f"{base}-chart"
    chart["insights"] = [f"${{ref({n})}}" for n in renames.values()]
    if title:
        chart.setdefault("layout", {})["title"] = {"text": title}
    others = {k: v for k, v in example.items() if k not in ("insights", "charts")}
    return {**others, "insights": insights, "charts": [chart]}


def _mark_other(example, member, request, cuts, other):
    """Give each column a top-N cut the recipe's Other colour, through the
    props the type colours by (one value per trace on a split, one per slice
    otherwise), and a rank sort ahead of the others."""
    model = request.context.model
    for insight in example.get("insights") or []:
        props = insight.get("props") or {}
        if props.get("type") != member.type:
            continue
        interactions = insight.setdefault("interactions", [])
        for column in cuts:
            bare = f"?{{ ${{ref({model}).{column}}} }}"
            split = any(i.get("split") == bare for i in interactions)
            if not split and bare not in props.values():
                continue
            paths = (other.series_color if split else other.slice_color).get(member.type, [])
            case = f"CASE WHEN ${{ref({model}).{column}}} = '{other.label}' THEN '{other.color}'"
            if not split and member.type in other.null_is_black:
                case += f" ELSE '{request.context.theme_color}'"
            case += " END"
            for path in paths:
                *parents, leaf = path.split(".")
                target = props
                for key in parents:
                    target = target.setdefault(key, {})
                target[leaf] = f"?{{ {case} }}{'[0]' if split else ''}"
            rank = f"?{{ min(${{ref({model}).{column}{other.rank_column}}}) ASC }}"
            first_sort = next((i for i, x in enumerate(interactions) if "sort" in x), 0)
            interactions.insert(first_sort, {"sort": rank})


def _set_units(example, member, request):
    """The example's unit literal (`number.suffix: " rides"`) belongs to the
    example's data. It becomes the first request metric's own unit when that
    has one and goes otherwise."""
    insight = _main(example, member)
    number = (insight or {}).get("props", {}).get("number")
    if not isinstance(number, dict) or "suffix" not in number:
        return
    unit = next((m.unit for m in request.metrics[:1] if m.unit), None)
    if unit:
        number["suffix"] = unit if unit.startswith("%") else f" {unit.strip()}"
    else:
        del number["suffix"]
    if not number:
        del insight["props"]["number"]


def _validate(skeleton):
    for insight in skeleton["insights"]:
        Insight(**insight)
    Chart(**skeleton["charts"][0])


def _foreign_columns(skeleton, request, cuts, other):
    """Columns the skeleton reads that the request does not name (a cut's
    rank column is the top-N recipe's, so it counts as named)."""
    known = {d.column for d in request.dimensions} | {m.name for m in request.metrics}
    known |= {f"{c}{other.rank_column}" for c in cuts} if other else set()
    project_metrics = {m.name for m in request.metrics if m.defined == "project"}
    found = []

    def collect(model, column):
        if not column and model in project_metrics:
            return ""
        if model != request.context.model or (column and column not in known):
            found.append(f"{model}.{column}" if column else model)
        return ""

    def walk(node):
        values = node.values() if isinstance(node, dict) else node
        for value in values:
            if isinstance(value, str):
                replace_refs(value, collect)
            elif isinstance(value, (dict, list)):
                walk(value)

    walk(skeleton["insights"])
    return found


class Skeleton(NamedTuple):
    yaml: str
    adapted: bool
    reason: Optional[str] = None


def _dump(skeleton):
    return yaml.safe_dump(skeleton, sort_keys=False, allow_unicode=True, width=120)


class Repaired(NamedTuple):
    """What the recommender's repairs left: the dimensions turned into an
    input, the values each dimension has, and the one it counts as series."""

    dropped: tuple = ()
    counts: dict = {}
    series: Optional[str] = None


def chart_skeleton(member, request, props=None, cuts=(), other=None, kind=None, repaired=None):
    """The member's example rewritten for ``request`` and wrapped in a chart,
    named after the request and ``kind``; or the example as written, with
    the reason it could not be. ``cuts`` are the columns a top-N cut, drawn
    with the ``other`` recipe."""
    props = props or {}
    repaired = repaired or Repaired()
    base, title = _names(request, kind, repaired.dropped)
    try:
        adapted = _adapt(member, request, repaired.dropped, repaired.series)
        _order_axes(adapted, member, request, cuts)
        if cuts and other:
            _mark_other(adapted.example, member, request, cuts, other)
        _trim_labels(adapted, member, repaired.counts)
        _set_units(adapted.example, member, request)
        if adapted.clips:
            caps = ", ".join(f"{c.replace('_', ' ')} {cap}" for c, cap in adapted.clips.items())
            title += f" (capped at the p99: {caps})"
        skeleton = _wrap(adapted.example, base, member, props, title)
        _validate(skeleton)
        foreign = _foreign_columns(skeleton, request, cuts, other)
        if foreign:
            raise _Unadaptable(f"it would read {', '.join(foreign)}, which the request lacks")
        return Skeleton(_dump(skeleton), True)
    except (ValueError, sqlglot.errors.SqlglotError) as error:
        skeleton = _wrap(_example(member), base, member, props)
        _validate(skeleton)
        reason = str(error).splitlines()[0]
        if isinstance(error, sqlglot.errors.SqlglotError):
            reason = "the example's SQL does not parse"
        return Skeleton(_dump(skeleton), False, reason)
