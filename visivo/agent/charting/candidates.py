"""Proposed Metrics, Dimensions and Relations, then a family-diverse portfolio
of insight candidates expressed in them: scored by ``scoring`` over the
caller's GROUP BY ``stats`` and chosen by ``insight_design.yml``'s portfolio."""

from functools import lru_cache
from typing import Any, List, Literal, Optional, Union

import yaml
from pydantic import Field, field_validator, model_validator
from sqlglot import exp
from sqlglot.dialects.dialect import Dialect, NormalizationStrategy

from visivo.agent.charting import scoring
from visivo.agent.charting.inputs import (
    GRAIN_DAYS,
    InputsError,
    _nice_step,
    _parse_cards as _parse_input_cards,
    snake,
)
from visivo.agent.charting.rules import (
    TRACES_DIR,
    load_insight_design,
    load_interactivity,
    load_tables,
)
from visivo.agent.charting.schema import (
    Aggregation,
    MetricSpec,
    RecommendRequest,
    RequestContext,
    Semantics,
    ShapeCard,
    TimeGrain,
    TopValue,
    TraceEntry,
    _Strict,
)
from visivo.models.dimension import Dimension
from visivo.models.metric import Metric
from visivo.models.relation import Relation
from visivo.query.sqlglot_utils import MEDIAN_SUPPORTED_DIALECTS
from visivo.server.services.shape_card import (
    ID_NAME_HINTS,
    LAT_HINTS,
    LON_HINTS,
    _parse_moment,
)

MAX_CARDS = 80
MAX_GROUPS = 40
MAX_CORRELATIONS = 20
MAX_STATS_WANTED = 12

GRAIN_ORDER = list(GRAIN_DAYS)
FLAG_PREFIXES = ("is", "has")
OTHER = "Other"
# Headline order; a median ranks as an average.
AGG_PRIORITY = ("count", "sum", "rate", "count_distinct", "avg", "min", "max")
NO_CORR_DIALECTS = {"sqlite", "mysql"}
METHODS = {
    "pearson": "Pearson on raw values",
    "pearson_p99": "Pearson on values clipped at their 99th percentile",
    "spearman": "Spearman on ranks",
}


class CandidatesError(ValueError):
    """Input the caller can fix."""


class GroupStat(_Strict):
    """One GROUP BY result: ``metric`` (a proposed metric name, or a column
    with ``agg``) per value of ``by``, one column or a cross-tab's two.
    ``rows`` are ``[key, value]`` or ``[key, key, value]`` lists or the dicts
    ``query_source`` returns."""

    model: Optional[str] = None
    by: Union[str, List[str]]
    metric: str
    agg: Optional[Aggregation] = None
    grain: Optional[TimeGrain] = None
    rows: List[Any] = Field(default_factory=list)

    @field_validator("by")
    @classmethod
    def _one_or_two(cls, by):
        if isinstance(by, list) and len(by) != 2:
            raise ValueError("by is one column or a list of two")
        return by

    @property
    def keys(self):
        return tuple(self.by) if isinstance(self.by, list) else (self.by,)

    def _row(self, row):
        width = len(self.keys) + 1
        if isinstance(row, dict):
            value = row.get(self.metric)
            if value is None and len(row) == width:
                value = next(v for k, v in row.items() if k not in self.keys)
            return (*[row.get(k) for k in self.keys], value)
        if isinstance(row, (list, tuple)) and len(row) == width:
            return tuple(row)
        return None

    def series(self):
        rows = [r for r in map(self._row, self.rows) if r is not None]
        return [r[0] for r in rows], [r[-1] for r in rows]

    def cells(self):
        return [r for r in map(self._row, self.rows) if r is not None]


class CorrelationStat(_Strict):
    """``r`` from the SQL ``stats_wanted`` gave (its ``method``), or
    ``pairs`` sampled from the rows, which are rank-correlated here."""

    model: Optional[str] = None
    columns: List[str] = Field(min_length=2, max_length=2)
    r: Optional[float] = Field(default=None, ge=-1, le=1)
    method: Optional[Literal["pearson", "pearson_p99", "spearman"]] = None
    pairs: List[List[Any]] = Field(default_factory=list)
    derived: bool = False

    def value(self):
        if self.r is not None:
            return self.r
        pairs = [p for p in self.pairs if len(p) == 2]
        return scoring.rank_correlation([p[0] for p in pairs], [p[1] for p in pairs])

    def how(self):
        return METHODS[self.method or ("pearson" if self.r is not None else "spearman")]


class Stats(_Strict):
    groups: List[GroupStat] = Field(default_factory=list)
    correlations: List[CorrelationStat] = Field(default_factory=list)


# --- the semantic layer ------------------------------------------------------


class Proposal(_Strict):
    """A proposed Metric or Dimension, with what it was built from."""

    model: str
    name: str
    expression: str
    description: str
    column: Optional[str] = None
    agg: Optional[str] = None
    card: Optional[ShapeCard] = None

    def public(self):
        return self.model_dump(include={"model", "name", "expression", "description"})


class _Layer:
    """Every proposal made once, under a name no column or earlier proposal
    holds, and validated against the project model it becomes. ``dialect``
    is one SQLGlot dialect or ``{model: dialect}`` (DuckDB for the rest)."""

    def __init__(self, dialect, columns_by_model):
        self.dialect = dialect
        self.columns = columns_by_model
        self.metrics = {}
        self.dimensions = {}
        self.taken = set()

    def _propose(self, project_model, model, name, suffix, expression, description, **extra):
        name = snake(name)
        if name in self.columns.get(model, set()):
            name = f"{name}_{suffix}"
        if name in self.taken:
            name = f"{snake(model)}_{name}"
        project_model(name=name, expression=expression, description=description)
        self.taken.add(name)
        return Proposal(
            model=model, name=name, expression=expression, description=description, **extra
        )

    def dialect_for(self, model):
        if isinstance(self.dialect, dict):
            return self.dialect.get(model) or "duckdb"
        return self.dialect

    def has(self, model, agg):
        return agg != "median" or self.dialect_for(model) in MEDIAN_SUPPORTED_DIALECTS

    def sql(self, model, node):
        dialect = self.dialect_for(model)
        node = portable(node, dialect).transform(
            lambda n: (
                identifier(n.name, dialect) if isinstance(n, exp.Identifier) and not n.quoted else n
            )
        )
        return node.sql(dialect=dialect)

    def metric(self, model, name, node, description, column=None, agg=None):
        key = (model, column, agg)
        if key not in self.metrics:
            expression = self.sql(model, node)
            self.metrics[key] = self._propose(
                Metric, model, name, "metric", expression, description, column=column, agg=agg
            )
        return self.metrics[key]

    def dimension(self, model, name, node, description, card):
        expression = self.sql(model, node)
        key = (model, expression)
        if key not in self.dimensions:
            proposal = self._propose(Dimension, model, name, "dim", expression, description)
            proposal.card = card.model_copy(update={"column": proposal.name})
            self.dimensions[key] = proposal
        return self.dimensions[key]


def col(name):
    return exp.Column(this=exp.to_identifier(name))


TARGET_DIALECTS = (
    "duckdb",
    "sqlite",
    "postgres",
    "mysql",
    "snowflake",
    "bigquery",
    "redshift",
    "clickhouse",
)
# SQLGlot's reserved lists are partial per dialect (DuckDB rejects `at`, which
# only BigQuery's lists), so a word any target dialect reserves is quoted.
RESERVED = frozenset().union(
    *(Dialect.get_or_raise(d).generator_class.RESERVED_KEYWORDS for d in TARGET_DIALECTS)
)


@lru_cache(maxsize=None)
def _keywords(dialect):
    """Every word of ``dialect``'s tokenizer keywords, ``ORDER`` of ``ORDER BY``
    too, and every word a target dialect reserves."""
    words = Dialect.get_or_raise(dialect).tokenizer_class.KEYWORDS
    return frozenset(w.lower() for key in words for w in key.split()) | RESERVED


def identifier(name, dialect):
    """The column ``name`` as ``dialect`` must spell it: quoted when it is not
    a plain word, is a keyword, or has a case the dialect would fold."""
    if not exp.SAFE_IDENTIFIER_RE.match(name):
        return exp.to_identifier(name, quoted=True)
    d = Dialect.get_or_raise(dialect)
    stored = name
    # SQLAlchemy reports an upper-folding dialect's unquoted names in lower case.
    if d.normalization_strategy is NormalizationStrategy.UPPERCASE and name.islower():
        stored = name.upper()
    if d.case_sensitive(stored) or stored.lower() in _keywords(dialect):
        return exp.to_identifier(stored, quoted=True)
    return exp.to_identifier(name, quoted=False)


def _text(value):
    return exp.Literal.string(value)


def _strftime(fmt, node):
    return exp.Anonymous(this="STRFTIME", expressions=[_text(fmt), node])


def _as_int(node):
    return exp.Cast(this=node, to=exp.DataType.build("INT"))


def _sqlite_date(node, *modifiers):
    return exp.Anonymous(this="DATE", expressions=[node, *map(_text, modifiers)])


SQLITE_PARTS = {"SECOND": "%S", "MINUTE": "%M", "HOUR": "%H", "DAY": "%d", "MONTH": "%m"}
SQLITE_TRUNC = {
    "second": "%Y-%m-%d %H:%M:%S",
    "minute": "%Y-%m-%d %H:%M:00",
    "hour": "%Y-%m-%d %H:00:00",
}
SQLITE_STARTS = {
    "day": (),
    "week": ("weekday 0", "-6 days"),
    "month": ("start of month",),
    "year": ("start of year",),
}


def _sqlite_trunc(node):
    unit, column = node.args["unit"].name.lower(), node.this
    if unit in SQLITE_TRUNC:
        return _strftime(SQLITE_TRUNC[unit], column)
    if unit in SQLITE_STARTS:
        return _sqlite_date(column, *SQLITE_STARTS[unit])
    month = _as_int(_strftime("%m", column.copy()))
    within = exp.Mod(
        this=exp.Paren(this=exp.Sub(this=month, expression=exp.Literal.number(1))),
        expression=exp.Literal.number(3),
    )
    back = exp.DPipe(
        this=exp.DPipe(this=_text("-"), expression=exp.Paren(this=within)),
        expression=_text(" months"),
    )
    return exp.Anonymous(this="DATE", expressions=[column, _text("start of month"), back])


def _sqlite_extract(node):
    return _as_int(_strftime(SQLITE_PARTS[node.this.name.upper()], node.expression))


def _sqlite_diff(node):
    seconds = round(GRAIN_DAYS[node.args["unit"].name.lower()] * 86400)
    elapsed = exp.Sub(this=_strftime("%s", node.this), expression=_strftime("%s", node.expression))
    return _as_int(exp.Div(this=exp.Paren(this=elapsed), expression=exp.Literal.number(seconds)))


def _extract(unit):
    return lambda node: exp.Extract(this=exp.var(unit), expression=node.this)


def _timestamp_diff(node):
    return exp.TimestampDiff(this=node.this, expression=node.expression, unit=node.args.get("unit"))


# Functions SQLGlot writes for a dialect that the dialect does not have.
PORTABLE = {
    "sqlite": {
        exp.TimestampTrunc: _sqlite_trunc,
        exp.DayOfWeek: lambda node: _as_int(_strftime("%w", node.this)),
        exp.Extract: _sqlite_extract,
        exp.DateDiff: _sqlite_diff,
    },
    "postgres": {exp.DayOfWeek: _extract("DOW")},
    "redshift": {exp.DayOfWeek: _extract("DOW")},
    "bigquery": {exp.DayOfWeek: _extract("DAYOFWEEK"), exp.DateDiff: _timestamp_diff},
    "mysql": {exp.DateDiff: _timestamp_diff},
}


def portable(node, dialect):
    """``node`` with each function ``dialect`` lacks swapped for an
    equivalent it has (SQLite has no TIMESTAMP_TRUNC, DAY_OF_WEEK or
    EXTRACT, and its JULIANDAY difference loses a minute to rounding;
    Postgres has no DAY_OF_WEEK; MySQL's DATEDIFF counts days whatever the
    unit and BigQuery's DATE_DIFF takes dates, so both get TIMESTAMPDIFF)."""
    rewrites = PORTABLE.get(dialect)
    if not rewrites:
        return node
    return node.transform(lambda n: rewrites[type(n)](n) if type(n) in rewrites else n)


def _stem(name, strip):
    tokens = [t for t in str(name).lower().split("_") if t]
    trimmed = [t for t in tokens if t not in strip]
    return "_".join(trimmed or tokens) or str(name)


def _kind(agg):
    return "avg" if agg == "median" else agg


AGG_NODES = {
    "count": exp.Count,
    "sum": exp.Sum,
    "avg": exp.Avg,
    "median": exp.Median,
    "min": exp.Min,
    "max": exp.Max,
}


def _agg_node(agg, column):
    c = col(column)
    if agg == "count_distinct":
        return exp.Count(this=exp.Distinct(expressions=[c]))
    if agg == "rate":
        flag = exp.Case(ifs=[exp.If(this=c, true=exp.Literal.number(1))])
        return exp.Avg(this=flag.else_(exp.Literal.number(0)))
    return AGG_NODES[agg](this=c)


# agg -> (metric name for a column, description)
METRICS = {
    "count": (lambda c: f"{c}_values", "Rows with a {c}"),
    "count_distinct": (lambda c: f"{_stem(c, ID_NAME_HINTS)}_count", "Distinct {c} values"),
    "sum": (
        lambda c: f"sum_{c}" if c.lower().startswith("total") else f"total_{c}",
        "Sum of {c}",
    ),
    "avg": (lambda c: f"avg_{c}", "Average {c}"),
    "median": (lambda c: f"median_{c}", "Median {c}; its tail makes the mean mislead"),
    "rate": (lambda c: f"{_stem(c, FLAG_PREFIXES)}_rate", "Share of rows where {c} is true"),
    "min": (lambda c: f"min_{c}", "Smallest {c}"),
    "max": (lambda c: f"max_{c}", "Largest {c}"),
}


def _propose_metrics(model, cards, doc, layer, warnings):
    """Every metric the model's columns imply, in headline order."""
    proposals = [
        layer.metric(
            model,
            f"{snake(model)}_count",
            exp.Count(this=exp.Star()),
            f"Rows in {model}",
            agg="count",
        )
    ]
    unknown, unsupported = [], []
    for card in cards:
        if card.bucket() == "one":
            continue
        rule = doc.metric_rule(card)
        for agg in rule.aggs:
            tail = rule.heavy_tail_agg
            if agg == "avg" and tail and doc.heavy_tail.holds(card.stats):
                if layer.has(model, tail) and not _median_is_a_mode(card):
                    agg = tail
                elif not _median_is_a_mode(card):
                    unsupported.append(card.column)
            namer, description = METRICS[agg]
            proposal = layer.metric(
                model,
                namer(card.column),
                _agg_node(agg, card.column),
                description.format(c=card.column),
                column=card.column,
                agg=agg,
            )
            proposal.card = card
            proposals.append(proposal)
        if card.role.startswith("numeric") and card.additive is None:
            unknown.append(card.column)
    times = [c for c in cards if c.role == "time"]
    duration = doc.metric_rule(times[0]).duration_agg if times else None
    if duration and len(times) >= 2:
        start, end = sorted(times[:2], key=lambda c: str((c.stats and c.stats.min) or ""))
        fine = all(c.time_grain in INTRADAY for c in (start, end))
        unit = "minute" if fine else "day"
        node = AGG_NODES[duration](
            this=exp.DateDiff(
                this=col(end.column), expression=col(start.column), unit=exp.var(unit)
            )
        )
        proposals.append(
            layer.metric(
                model,
                f"{duration}_{end.column}_{unit}s",
                node,
                f"{duration.title()} {unit}s from {start.column} to {end.column}",
                column=f"{start.column}->{end.column}",
                agg=duration,
            )
        )
    if unknown:
        warnings.append(
            f"{model}: additivity unknown for {', '.join(unknown)}; proposed avg. If a column "
            "adds up (an amount, a count), propose sum instead"
        )
    if unsupported:
        warnings.append(
            f"{model}: {layer.dialect_for(model)} has no median, so {', '.join(unsupported)} "
            "keep avg although a long tail pulls it up; say so where it is shown"
        )
    named = doc.primary_metric.matches
    return sorted(
        proposals, key=lambda p: (AGG_PRIORITY.index(_kind(p.agg)), -len(named(p.column)))
    )


def _median_is_a_mode(card):
    """More than half the rows hold one value, so the median is that value
    in every group (a median of 0 processes' memory, 1 passenger)."""
    median = card.stats.median if card.stats else None
    if median is None:
        return False
    if median == 0 and (card.stats.zeros_pct or 0) > 0.5:
        return True
    return any(t.share > 0.5 and scoring.numbers([t.value]) == [median] for t in card.top_n)


def _joins(a, left, b, right):
    if left.column == right.column:
        return "identifier" in (left.role, right.role)
    return (left.column, right.column) in ((f"{snake(b)}_id", "id"), ("id", f"{snake(a)}_id"))


def _propose_relations(models):
    """A relation per model pair sharing a key: the same column where one side
    identifies its rows, or ``<model>_id`` beside a model's ``id``."""
    relations = []
    for a, b in [(a, b) for a in models for b in models if a < b]:
        pair = next(
            (
                (left, right)
                for left in models[a]
                for right in models[b]
                if _joins(a, left, b, right)
            ),
            None,
        )
        if pair is None:
            continue
        relation = {
            "name": f"{snake(a)}_to_{snake(b)}",
            "condition": f"${{ref({a}).{pair[0].column}}} = ${{ref({b}).{pair[1].column}}}",
            "join_type": "inner",
            "is_default": True,
        }
        Relation(**relation)
        relations.append(relation)
    return relations


# --- dimensions and reductions ----------------------------------------------


def _keep_or_other(layer, model, card, name, shares, description):
    """``card`` with the values in ``shares`` kept and the rest as Other."""
    c = col(card.column)
    literals = [
        exp.Literal.number(v) if isinstance(v, (int, float)) else exp.Literal.string(str(v))
        for v in shares
    ]
    keep = exp.If(this=exp.In(this=c.copy(), expressions=literals), true=c.copy())
    node = exp.Case(ifs=[keep], default=exp.Literal.string(OTHER))
    top = [TopValue(value=v, share=s) for v, s in shares.items()]
    other = max(0.0, round(1 - sum(shares.values()), 4))
    if other:
        top.append(TopValue(value=OTHER, share=other))
    shape = ShapeCard(
        column=card.column,
        role="categorical",
        cardinality=len(top),
        null_pct=card.null_pct,
        top_n=top,
    )
    return layer.dimension(model, name, node, description, shape)


def top_n_other(layer, model, card, n):
    return _keep_or_other(
        layer,
        model,
        card,
        f"top{n}_{card.column}",
        {t.value: t.share for t in card.top_n[:n]},
        f"The top {n} {card.column} values when profiled, the rest as {OTHER}",
    )


def collapse_rare(layer, model, card, min_share):
    return _keep_or_other(
        layer,
        model,
        card,
        f"{card.column}_grouped",
        {t.value: t.share for t in card.top_n if t.share >= min_share},
        f"{card.column} with values under {min_share:.0%} of rows as {OTHER}",
    )


def points_at(card, grain):
    """The points ``card`` spans at ``grain``: from its min and max when the
    stats hold them, since a sparse axis has fewer distinct values than its
    span; else from its distinct values at its own grain."""
    lo, hi = (_parse_moment(getattr(card.stats, k, None)) for k in ("min", "max"))
    if lo is not None and hi is not None and hi >= lo:
        return int((hi - lo) / 86400 / GRAIN_DAYS[grain]) + 1
    natural = card.time_grain or "day"
    points = card.axis_points() * GRAIN_DAYS[natural] / GRAIN_DAYS[grain]
    return max(1, int(round(points)))


def _truncated(column, grain):
    return exp.TimestampTrunc(this=col(column), unit=exp.var(grain.upper()))


def regrain(layer, model, card, grain):
    points = points_at(card, grain)
    return layer.dimension(
        model,
        f"{card.column}_{grain}",
        _truncated(card.column, grain),
        f"{card.column} truncated to the {grain}",
        ShapeCard(
            column=card.column,
            role="time",
            cardinality=points,
            null_pct=card.null_pct,
            time_grain=grain,
            time_span_points=points,
            stats=card.stats,
        ),
    )


def bucket(layer, model, card, bins):
    lo = scoring.numbers([card.stats and card.stats.min])
    hi = scoring.numbers([card.stats and card.stats.max])
    if not lo or not hi or hi[0] <= lo[0]:
        return None
    step = _nice_step(hi[0] - lo[0], steps=bins)
    node = exp.Mul(
        this=exp.Floor(this=exp.Div(this=col(card.column), expression=exp.Literal.number(step))),
        expression=exp.Literal.number(step),
    )
    return layer.dimension(
        model,
        f"{card.column}_bucket",
        node,
        f"{card.column} in steps of {step:g}",
        ShapeCard(
            column=card.column,
            role="numeric_discrete",
            cardinality=int((hi[0] - lo[0]) // step) + 1,
            null_pct=card.null_pct,
            ordered=True,
        ),
    )


def _clipped(card):
    """``card``'s column capped at its p99, or the column when no p99 is known."""
    c = col(card.column)
    p99 = card.stats.p99 if card.stats else None
    if p99 is None:
        return c
    over = exp.GT(this=c.copy(), expression=exp.Literal.number(p99))
    return exp.Case(ifs=[exp.If(this=over, true=exp.Literal.number(p99))], default=c.copy())


def clip_p99(layer, model, card):
    p99 = card.stats.p99
    return layer.dimension(
        model,
        f"{card.column}_clipped",
        _clipped(card),
        f"{card.column} capped at its 99th percentile ({p99:g})",
        card.model_copy(update={"stats": card.stats.model_copy(update={"max": p99})}),
    )


PART_SIZES = {"weekday": 7, "hour": 24, "month": 12}
PART_OF_LAG = {"hour": "hour", "day": "weekday", "month": "month"}
INTRADAY = ("second", "minute", "hour")


def part_of(layer, model, card, unit):
    node = (
        exp.DayOfWeek(this=col(card.column))
        if unit == "weekday"
        else exp.Extract(this=exp.var(unit.upper()), expression=col(card.column))
    )
    return layer.dimension(
        model,
        f"{card.column}_{unit}",
        node,
        f"The {unit} of {card.column}",
        ShapeCard(
            column=card.column,
            role="numeric_discrete",
            cardinality=PART_SIZES[unit],
            null_pct=card.null_pct,
            ordered=True,
        ),
    )


# --- candidates --------------------------------------------------------------


class _Dim(_Strict):
    """A column as a candidate draws it: the profiled ``raw`` card and, when
    reduced, the derived dimension's proposal, card and transform."""

    raw: ShapeCard
    card: Optional[ShapeCard] = None
    proposal: Optional[Proposal] = None
    transform: Optional[str] = None

    @model_validator(mode="after")
    def _drawn(self):
        if self.card is None:
            self.card = self.proposal.card if self.proposal else self.raw
        return self


class Candidate(_Strict):
    """One insight worth considering. ``reads`` are the columns it spends, for
    the portfolio's repeat penalty and for which inputs it can take."""

    name: str
    model: str
    intent: str
    family: str
    metrics: List[Proposal] = Field(default_factory=list)
    dims: List[_Dim] = Field(default_factory=list)
    reads: List[str] = Field(default_factory=list)
    score: float = Field(default=0.0, ge=0, le=1)
    signals: dict = Field(default_factory=dict)
    why: str = ""
    semantics: Semantics = Field(default_factory=Semantics)
    input_candidates: List[str] = Field(default_factory=list)
    delta_by: Optional[str] = None
    priority: tuple = ()

    @model_validator(mode="after")
    def _default_reads(self):
        self.reads = self.reads or [d.raw.column for d in self.dims]
        return self

    @property
    def dimensions(self):
        return [d.card for d in self.dims]

    @property
    def proposals(self):
        return [d.proposal for d in self.dims if d.proposal]

    @property
    def transforms(self):
        return [d.transform for d in self.dims if d.transform]

    def request(self, trim):
        """What ``recommend_charts`` takes, so the agent can pass it on."""
        request = RecommendRequest(
            metrics=[MetricSpec(name=m.name, agg=m.agg) for m in self.metrics],
            dimensions=[d.model_copy(update={"top_n": d.top_n[:trim]}) for d in self.dimensions],
            intent=self.intent,
            semantics=self.semantics,
            context=RequestContext(model=self.model),
        )
        return request.model_dump(mode="json", exclude_defaults=True, exclude_none=True)

    def public(self, trim, hero=False):
        out = {
            "name": self.name,
            "model": self.model,
            "intent": self.intent,
            "family": self.family,
            "metrics": [m.name for m in self.metrics],
            "dimensions": [d.column for d in self.dimensions],
            "transforms": self.transforms,
            "score": round(self.score, 3),
            "signals": {k: round(v, 3) for k, v in self.signals.items()},
            "why": self.why,
            "input_candidates": self.input_candidates,
            "request": self.request(trim),
        }
        if self.delta_by:
            out["delta_by"] = self.delta_by
        if hero:
            out["hero"] = True
        return out


class _Model:
    """One model's cards, tags and proposals while candidates are built."""

    def __init__(self, name, cards, doc, interactivity, layer, warnings):
        self.name = name
        self.cards = cards
        self.doc = doc
        self.tags = {c.column: scoring.tag_dimension(c, doc, interactivity) for c in cards}
        self.metrics = _propose_metrics(name, cards, doc, layer, warnings)
        self.lead, self.lead_why = self._lead()
        self.min_points = doc.reductions.regrain.points_min
        self.inputs = [c.column for c in self.of("input_candidate")]
        self.splits = []
        for card in self.of("split_candidate"):
            if self.tags[card.column][1] == "top_n_other":
                proposal = top_n_other(layer, name, card, scoring.top_n_keep(card, doc))
                self.splits.append(_Dim(raw=card, proposal=proposal, transform="top_n_other"))
            else:
                self.splits.append(_Dim(raw=card))

    def of(self, tag):
        return [c for c in self.cards if self.tags[c.column][0] == tag]

    def chartable(self):
        """Metrics worth a chart: a distinct count of the row key is the row
        count again."""
        return [
            m
            for m in self.metrics
            if not (m.agg == "count_distinct" and m.card and m.card.role == "identifier")
        ]

    def primary(self):
        return self.lead

    def weigh(self, stats):
        """Lead with the total ``stats`` rank first, ahead of the other totals."""
        self.lead, self.lead_why = self._lead(stats)
        if self.lead.agg == "sum":
            first = next(i for i, m in enumerate(self.metrics) if m.agg == "sum")
            self.metrics.remove(self.lead)
            self.metrics.insert(first, self.lead)

    def _lead(self, stats=None):
        """``(metric, why)``: the total whose column names the most money or
        volume words; among those level on words, the strongest signal on the
        dimensions all are measured on, else the first; with no total, the row
        count. A signal says which total varies most, not which is the
        business number, so it only ranks totals the name cannot separate."""
        chartable = self.chartable()
        totals = [m for m in chartable if m.agg == "sum"]
        if not totals:
            return chartable[0], f"{chartable[0].name} leads: no column adds up"
        named = self.doc.primary_metric.matches
        most = max(len(named(t.column)) for t in totals)
        level = [t for t in totals if len(named(t.column)) == most]
        lead, why = level[0], None
        signals = {t.name: self.signals(t, stats) for t in level} if stats else {}
        measured = [t for t in level if signals.get(t.name)]
        shared = set.intersection(*(set(signals[t.name]) for t in measured)) if measured else set()
        if len(measured) >= 2 and shared:
            lead = max(measured, key=lambda t: sum(signals[t.name][k] for k in shared))
            why = f"the strongest signal across {', '.join(sorted(shared))}"
        words = named(lead.column)
        if words:
            said = f"its name says money or volume ({', '.join(words)})"
            why = f"{said}; of the totals named so, {why}" if why else said
        elif why:
            why = f"of the totals, {why}"
        elif len(totals) == 1:
            why = "the only total"
        else:
            why = "the first total; no name says money or volume"
        return lead, f"{lead.name} leads: {why}"

    def signals(self, metric, stats):
        """``{key: score}`` for each one-column stat measuring ``metric``: the
        trend score over a time key, the variance score over any other."""
        times = {c.column for c in self.cards if c.role == "time"}
        out = {}
        for group in stats.groups:
            if group.model not in (None, self.name) or len(group.keys) != 1:
                continue
            if not _measures(group, metric):
                continue
            key = group.keys[0]
            keys, values = group.series()
            if key in times or group.grain:
                ordered = [v for _, v in sorted(zip(keys, values), key=lambda kv: str(kv[0]))]
                out[key] = scoring.trend(ordered, group.grain, self.doc.scoring)["score"]
            else:
                out[key] = scoring.variance_score(values)
        return out

    def cross_pairs(self, limits, pivot_columns):
        """``(i, a, b, cells, pivot)`` for each pair of splits or categorical
        inputs within the pivot limits."""
        inputs = [
            _Dim(raw=c)
            for c in self.of("input_candidate")
            if c.role in ("categorical", "geo_region")
        ]
        dims = self.splits + inputs
        for i, a in enumerate(dims):
            for b in dims[i + 1 :]:
                cells = a.card.cardinality * b.card.cardinality
                narrow = min(a.card.cardinality, b.card.cardinality)
                pivot = cells > limits.chart_max_cells
                if cells > limits.pivot_max_cells or (pivot and narrow > pivot_columns):
                    continue
                yield i, a, b, cells, pivot


def _headline_metrics(metrics, limit):
    """One metric of each kind first, so a KPI strip is not four sums."""
    picked, kinds = [], set()
    for metric in metrics:
        if _kind(metric.agg) not in kinds:
            picked.append(metric)
            kinds.add(_kind(metric.agg))
    picked += [m for m in metrics if m not in picked]
    return picked[:limit]


def _measures(group, metric):
    return group.metric == metric.name or (
        metric.column and group.metric == metric.column and group.agg in (None, metric.agg)
    )


def _find_group(stats, model, names, metric):
    for group in stats.groups:
        if group.model not in (None, model) or len(group.keys) != 1:
            continue
        if group.keys[0] in names and _measures(group, metric):
            return group
    return None


def _find_cells(stats, model, a_names, b_names, metric):
    """The cross-tab's cells as ``(a, b, value)``, whichever order ``by`` had."""
    for group in stats.groups:
        if group.model not in (None, model) or len(group.keys) != 2:
            continue
        if not _measures(group, metric):
            continue
        first, second = group.keys
        if first in a_names and second in b_names:
            return group.cells()
        if first in b_names and second in a_names:
            return [(b, a, v) for a, b, v in group.cells()]
    return None


def _card_counts(card, metric):
    """Row shares from the profile when they cover every value: the
    GROUP BY count(*) the profiler already ran."""
    if metric.agg != "count" or not card.top_n or len(card.top_n) < card.cardinality:
        return None
    return [t.share for t in card.top_n]


def _ratio_phrase(values):
    xs = [x for x in scoring.numbers(values) if x > 0]
    if len(xs) >= 2:
        return f"{max(xs) / min(xs):.1f}× from lowest to highest"
    return f"with a CoV of {scoring.coefficient_of_variation(values):.2f}"


def _raw_cells(a, b):
    """The GROUP BY rows two raw columns give, a NULL key counted as a value."""
    return (a.cardinality + (a.null_pct > 0)) * (b.cardinality + (b.null_pct > 0))


def _grain_for(card, max_points):
    """The finest grain at or above the card's own whose points fit."""
    start = GRAIN_ORDER.index(card.time_grain or "day")
    for grain in GRAIN_ORDER[start:]:
        if points_at(card, grain) <= max_points:
            return grain
    return GRAIN_ORDER[-1]


class _Builder:
    def __init__(self, doc, stats, layer):
        self.doc = doc
        self.stats = stats
        self.layer = layer
        self.warnings = []
        pie = TraceEntry(**yaml.safe_load((TRACES_DIR / "pie.yml").read_text()))
        self.pie_max = pie.data_shape.cardinality.max
        self.pivot_columns = load_tables().column_budget.full_width - 1
        self.dependent = {}

    def group(self, m, dim, metric):
        return _find_group(self.stats, m.name, {dim.raw.column, dim.card.column}, metric)

    def values(self, m, dim, metric):
        group = self.group(m, dim, metric)
        return group.series()[1] if group else _card_counts(dim.raw, metric)

    def finish(self, cand, cards, values=None):
        factor, reasons = scoring.penalty(cards, values, self.doc.scoring)
        cand.score *= factor
        if reasons:
            cand.why += f" ({'; '.join(reasons)})"
        return cand

    def unmeasured(self, cand, what):
        """The prior for a dimension no stat covers, or 0 once another metric
        on it is measured, so a flat measurement is not outranked by a guess."""
        measured = any(
            group.model in (None, cand.model) and set(group.keys) & set(cand.reads)
            for group in self.stats.groups
        )
        cand.score = 0.0 if measured else self.doc.scoring.unmeasured
        cand.why = f"{what}; not measured yet"
        return cand

    def delta_grain(self, m, card):
        """The grain the trend shows, never finer than a day unless the data
        spans fewer days than a trend needs (intraday by design)."""
        grain = _grain_for(card, self.doc.reductions.regrain.points_max)
        finer = GRAIN_ORDER.index(grain) < GRAIN_ORDER.index("day")
        if finer and points_at(card, "day") >= m.min_points:
            return "day"
        return grain

    def kpis(self, m):
        pick = _headline_metrics(m.chartable(), self.doc.portfolio.kpi_metrics.max)
        times = m.of("axis")
        why = f"the headline numbers: {', '.join(p.name for p in pick)}"
        if times:
            why += f"; show each against the previous {self.delta_grain(m, times[0])}"
        why += f"; {m.lead_why}"
        return Candidate(
            name=f"{snake(m.name)}_headlines",
            model=m.name,
            intent="kpi",
            family="kpi",
            metrics=pick,
            score=self.doc.scoring.unmeasured,
            why=why,
            delta_by=times[0].column if times else None,
        )

    def breakdowns(self, m):
        out = []
        for index, split in enumerate(m.splits):
            geo = split.raw.role == "geo_region"
            for rank, metric in enumerate(m.chartable()):
                values = self.values(m, split, metric)
                cand = Candidate(
                    name=f"{metric.name}_by_{split.card.column}",
                    model=m.name,
                    intent="geo" if geo else "compare",
                    family="geo_region" if geo else "bar",
                    metrics=[metric],
                    dims=[split],
                    priority=(1, index, rank),
                )
                if values is None:
                    self.unmeasured(cand, f"{metric.name} by {split.card.column}")
                else:
                    cand.signals = {"cov": scoring.coefficient_of_variation(values)}
                    cand.score = scoring.variance_score(values)
                    cand.why = (
                        f"{metric.name} varies {_ratio_phrase(values)} across {split.raw.column}"
                    )
                out.append(self.finish(cand, [split.raw], values))
                if values is not None and metric.agg in ("count", "sum"):
                    out += self.composition(m, split.raw, metric, values, (2, index, rank))
        for index, card in enumerate(m.cards):
            if card.role == "geo_region" and m.tags[card.column][0] == "input_candidate":
                metric = m.primary()
                cand = Candidate(
                    name=f"{metric.name}_by_{card.column}_map",
                    model=m.name,
                    intent="geo",
                    family="geo_region",
                    metrics=[metric],
                    dims=[_Dim(raw=card)],
                    priority=(1, len(m.splits) + index),
                )
                self.unmeasured(cand, f"{metric.name} on a map of {card.column}")
                cand.why += f"; {m.lead_why}"
                out.append(self.finish(cand, [card]))
        return out

    def composition(self, m, raw, metric, values, priority):
        rare = self.doc.reductions.collapse_rare.min_share
        kept = [t for t in raw.top_n if t.share >= rare]
        size = len(kept) + (1 if len(kept) < raw.cardinality else 0)
        few = raw.cardinality <= self.doc.scoring.top_share_of
        if raw.role == "boolean" or few or not kept or size > self.pie_max:
            return []
        dim = _Dim(raw=raw)
        if len(kept) < raw.cardinality:
            dim = _Dim(
                raw=raw,
                proposal=collapse_rare(self.layer, m.name, raw, rare),
                transform="collapse_rare",
            )
        conc = scoring.concentration(values, self.doc.scoring)
        cand = Candidate(
            name=f"{metric.name}_share_by_{dim.card.column}",
            model=m.name,
            intent="composition",
            family="part_of_whole",
            metrics=[metric],
            dims=[dim],
            semantics=Semantics(part_of_whole=True),
            score=conc["score"],
            signals={"gini": conc["gini"], "top_share": conc["top_share"]},
            why=f"the top {self.doc.scoring.top_share_of} {raw.column} values hold "
            f"{conc['top_share']:.0%} of {metric.name}",
            priority=priority,
        )
        return [self.finish(cand, [raw], values)]

    def cross_tabs(self, m):
        out = []
        metric = m.primary()
        for i, a, b, cells, pivot in m.cross_pairs(self.doc.pairing_limits, self.pivot_columns):
            cand = Candidate(
                name=f"{metric.name}_by_{a.card.column}_and_{b.card.column}",
                model=m.name,
                intent="compare",
                family="table_pivot" if pivot else "heatmap",
                metrics=[metric],
                dims=[a, b],
                priority=(3, i),
            )
            what = f"{metric.name} across {a.card.column} × {b.card.column} ({cells} cells)"
            found = _find_cells(
                self.stats,
                m.name,
                {a.raw.column, a.card.column},
                {b.raw.column, b.card.column},
                metric,
            )
            if found is None:
                self.unmeasured(cand, what)
            else:
                signal = scoring.interaction(found, self.doc.scoring)
                cand.score = signal["score"]
                cand.signals = {"cramers_v": signal["v"], "dependence": signal["dependence"]}
                cand.why = (
                    f"{what}; Cramér's V {signal['v']:.2f}: how far the cells sit from what "
                    "the two columns' totals alone predict"
                )
                if signal["dependent"]:
                    pair = f"{a.raw.column} and {b.raw.column} (λ {signal['dependence']:.2f})"
                    cand.why += f"; {pair} predict each other"
                    self.dependent.setdefault(m.name, []).append(pair)
            cand.why += f"; {m.lead_why}"
            out.append(self.finish(cand, [a.raw, b.raw]))
        return out

    def trends(self, m):
        out = []
        points_max = self.doc.reductions.regrain.points_max
        for t_index, card in enumerate(m.of("axis")):
            points = points_at(card, card.time_grain or "day")
            if points < m.min_points:
                self.warnings.append(
                    f"{m.name}.{card.column} spans {points} points, fewer than a "
                    f"trend needs ({m.min_points}); show it as a KPI delta instead"
                )
                continue
            axis = _Dim(raw=card)
            if points > points_max:
                proposal = regrain(self.layer, m.name, card, _grain_for(card, points_max))
                axis = _Dim(raw=card, proposal=proposal, transform="regrain")
            for rank, metric in enumerate(m.chartable()):
                cand = Candidate(
                    name=f"{metric.name}_over_{axis.card.column}",
                    model=m.name,
                    intent="trend",
                    family="line",
                    metrics=[metric],
                    dims=[axis],
                    priority=(0, t_index, rank),
                )
                group = self.group(m, axis, metric)
                if group is None:
                    self.unmeasured(cand, f"{metric.name} over {axis.card.column}")
                    out.append(self.finish(cand, [card]))
                    continue
                grain = group.grain or card.time_grain
                points = sorted(
                    (kv for kv in zip(*group.series()) if scoring.numbers([kv[1]])),
                    key=lambda kv: str(kv[0]),
                )
                keys, ordered = [k for k, _ in points], [v for _, v in points]
                out.append(self.measured_trend(cand, card, keys, ordered, grain))
                season = self.seasonal(m, card, metric, ordered, grain)
                if season:
                    out.append(season)
                for split in m.splits[: self.doc.pairing_limits.categoricals_with_time]:
                    out.append(self.trend_by(m, cand, split, metric))
        return out

    def measured_trend(self, cand, card, keys, ordered, grain):
        signal = scoring.trend(ordered, grain, self.doc.scoring)
        outliers = scoring.anomalies(ordered, self.doc.scoring)
        cand.signals = {k: signal[k] for k in ("r2", "change", "run", "strength", "swing")}
        cand.score = signal["score"]
        name = cand.metrics[0].name
        if signal["shape"] == "level":
            cand.why = (
                f"{name} moves {signal['swing']:.0%} of its mean, smoothed: lowest around "
                f"{keys[signal['low']]}, highest around {keys[signal['high']]} "
                f"(strength {signal['strength']:.2f}; a line fits R² {signal['r2']:.2f})"
            )
        else:
            direction = "rises" if signal["change"] > 0 else "falls"
            cand.why = (
                f"{name} {direction} {abs(signal['change']):.0%} across the period "
                f"(R² {signal['r2']:.2f})"
            )
        if outliers["count"]:
            cand.signals["anomalies"] = outliers["count"]
            cand.why += f"; {outliers['count']} points are outliers worth a highlight"
        return self.finish(cand, [card], ordered)

    def trend_by(self, m, base, split, metric):
        values = self.values(m, split, metric)
        cand = base.model_copy(
            deep=True,
            update={
                "name": f"{base.name}_by_{split.card.column}",
                "dims": [*base.dims, split],
                "reads": [*base.reads, split.raw.column],
                "priority": (*base.priority, 1),
                "why": f"{base.why}, split by {split.card.column}",
            },
        )
        if values is not None and base.score >= self.doc.portfolio.min_score:
            cand.score = (base.score + scoring.variance_score(values)) / 2
        return self.finish(cand, [split.raw])

    def seasonal(self, m, card, metric, ordered, grain):
        signal = scoring.seasonality(ordered, grain, self.doc.scoring)
        unit = PART_OF_LAG.get(grain)
        if not signal["score"] or unit is None:
            return None
        parts = [part_of(self.layer, m.name, card, unit)]
        if unit == "weekday" and card.time_grain in INTRADAY:
            parts.insert(0, part_of(self.layer, m.name, card, "hour"))
        if unit == "hour" and points_at(card, "week") >= scoring.MIN_CYCLES:
            parts.append(part_of(self.layer, m.name, card, "weekday"))
        cand = Candidate(
            name=f"{metric.name}_by_{'_and_'.join(p.name for p in parts)}",
            model=m.name,
            intent="compare",
            family="heatmap" if len(parts) == 2 else "bar",
            metrics=[metric],
            dims=[_Dim(raw=card, proposal=p) for p in parts],
            reads=[p.name for p in parts],
            score=signal["score"],
            signals={"acf": signal["acf"], "lag": signal["lag"]},
            why=f"{metric.name} repeats every {signal['lag']} {grain}s "
            f"(autocorrelation {signal['acf']:.2f})",
            priority=(1, -1),
        )
        return self.finish(cand, [card])

    def distributions(self, m):
        out = []
        for index, card in enumerate(m.of("measure")):
            dim = _Dim(raw=card)
            if self.doc.heavy_tail.holds(card.stats) and card.stats.p99 is not None:
                dim = _Dim(
                    raw=card, proposal=clip_p99(self.layer, m.name, card), transform="clip_p99"
                )
            cand = Candidate(
                name=f"{card.column}_distribution",
                model=m.name,
                intent="distribution",
                family="distribution",
                dims=[dim],
                priority=(4, index),
            )
            skew = card.stats.skew if card.stats else None
            if skew is None:
                self.unmeasured(cand, f"the spread of {card.column}")
            else:
                cand.score = scoring.skew_score(skew)
                cand.signals = {"skew": skew}
                cand.why = f"the spread of {card.column} (skew {skew:.1f})"
            out.append(self.finish(cand, [card]))
        return out

    def relationships(self, m):
        out = []
        cards = {c.column: c for c in m.cards}
        for stat in self.stats.correlations:
            if stat.model not in (None, m.name) or not all(c in cards for c in stat.columns):
                continue
            x, y = (cards[c] for c in stat.columns)
            r, how = stat.value(), stat.how()
            if stat.derived or scoring.is_derived(r, self.doc.scoring):
                self.warnings.append(
                    f"{x.column} and {y.column} correlate at r {r:.2f} ({how}); one is likely "
                    "computed from the other, so no scatter"
                )
                continue
            score = scoring.correlation_score(r, rules=self.doc.scoring)
            if abs(r) < self.doc.scoring.scatter_min_r:
                banded = self.banded(m, x, y, r, score, how)
                if banded:
                    out.append(banded)
                continue
            cand = Candidate(
                name=f"{y.column}_vs_{x.column}",
                model=m.name,
                intent="relationship",
                family="xy",
                dims=[_Dim(raw=x), _Dim(raw=y)],
                score=score,
                signals={"r": r},
                why=f"{y.column} moves with {x.column} (r {r:.2f}, {how})",
                priority=(5,),
            )
            out.append(self.finish(cand, [x, y]))
        return out

    def banded(self, m, x, y, r, score, how):
        """A loose relationship read as a comparison across bands of x."""
        if abs(r) < self.doc.scoring.banded_min_r:
            return None
        proposal = bucket(self.layer, m.name, x, self.doc.reductions.bucket.bins)
        over_y = [p for p in m.metrics if p.column == y.column]
        if proposal is None or not over_y:
            return None
        metric = next((p for p in over_y if p.agg in ("avg", "median")), over_y[0])
        cand = Candidate(
            name=f"{metric.name}_by_{proposal.name}",
            model=m.name,
            intent="compare",
            family="bar",
            metrics=[metric],
            dims=[_Dim(raw=x, proposal=proposal, transform="bucket")],
            reads=[proposal.name],
            score=score,
            signals={"r": r},
            why=f"{y.column} follows {x.column} loosely (r {r:.2f}, {how}); compare it "
            f"across {x.column} bands instead of a scatter",
            priority=(5,),
        )
        return self.finish(cand, [x, y])

    def geo_points(self, m):
        points = [c for c in m.cards if c.role == "geo_point"]

        def find(hints):
            return next((c for c in points if set(c.column.lower().split("_")) & set(hints)), None)

        lat, lon = find(LAT_HINTS), find(LON_HINTS)
        if not (lat and lon):
            return []
        cand = Candidate(
            name=f"{snake(m.name)}_map",
            model=m.name,
            intent="geo",
            family="geo_point",
            metrics=[m.metrics[0]],
            dims=[_Dim(raw=lat), _Dim(raw=lon)],
            priority=(6,),
        )
        return [self.unmeasured(cand, f"where the rows are, from {lat.column} and {lon.column}")]

    def all_for(self, m):
        pool = [
            *self.trends(m),
            *self.breakdowns(m),
            *self.cross_tabs(m),
            *self.distributions(m),
            *self.relationships(m),
            *self.geo_points(m),
        ]
        for cand in pool:
            cand.input_candidates = [c for c in m.inputs if c not in cand.reads]
        pairs = self.dependent.get(m.name)
        if pairs:
            self.warnings.append(
                f"{m.name}: {'; '.join(pairs[:3])} each predict the other: use one as a "
                "drill-down of the other, never a cross-tab"
            )
        return pool


# --- the portfolio -----------------------------------------------------------


def choose(pool, kpi, doc, intent=None, room=None):
    """``(chosen, hero)``: the KPI set, then one pick per slot (the hero's
    slot first), a second round for slots that hold more, then free picks
    up to ``room``. Each pick is scored down for a family or a dimension
    already chosen, so the same chart twice loses to a different one."""
    pf = doc.portfolio
    room = pf.max_candidates if room is None else room
    chosen, families, reads = [], {}, {}

    def adjusted(cand):
        family = pf.repeat_family ** families.get(cand.family, 0)
        reuse = max((reads.get(d, 0) for d in cand.reads), default=0)
        return cand.score * family * pf.repeat_dimension**reuse

    def take(cands):
        live = [
            c
            for c in cands
            if all(c is not x for x in chosen) and adjusted(c) > 0 and adjusted(c) >= pf.min_score
        ]
        if not live or len(chosen) >= room:
            return None
        best = min(live, key=lambda c: (-adjusted(c), c.priority, c.name))
        chosen.append(best)
        families[best.family] = families.get(best.family, 0) + 1
        for d in best.reads:
            reads[d] = reads.get(d, 0) + 1
        return best

    if kpi is not None:
        take([kpi])
    slots = [s for s in pf.slots if "kpi" not in s.intents]
    asked = pf.slot_for(intent) if intent else None
    hero_slot = asked if asked in slots else None
    if hero_slot is None:
        hero_slot = next((s for s in slots if any(c.intent in s.intents for c in pool)), None)
    ordered = [hero_slot, *[s for s in slots if s is not hero_slot]] if hero_slot else slots
    hero = kpi if intent == "kpi" else None
    counts = {s.name: 0 for s in slots}
    for round_ in range(max(s.max for s in slots)):
        for slot in ordered:
            if counts[slot.name] != round_ or counts[slot.name] >= slot.max:
                continue
            members = [c for c in pool if c.intent in slot.intents]
            if slot is asked and round_ == 0:
                members = [c for c in members if c.intent == intent] or members
            picked = take(members)
            if picked:
                counts[slot.name] += 1
                hero = hero or picked
    while take(pool):
        pass
    return chosen, hero


def _parse_cards(cards):
    if not isinstance(cards, list) or not cards:
        raise CandidatesError(
            "'cards' must be a non-empty list of shape cards, each with its 'model'."
        )
    if len(cards) > MAX_CARDS:
        raise CandidatesError(
            f"{len(cards)} cards is more than {MAX_CARDS}; profile fewer columns."
        )
    try:
        return _parse_input_cards(cards)
    except InputsError as error:
        raise CandidatesError(str(error)) from error


def _parse_stats(stats, max_rows):
    if stats is None:
        return Stats()
    if isinstance(stats, Stats):
        parsed = stats
    elif isinstance(stats, dict):
        parsed = Stats(**stats)
    else:
        raise CandidatesError("'stats' must be an object: {groups: [...], correlations: [...]}.")
    if len(parsed.groups) > MAX_GROUPS:
        raise CandidatesError(f"{len(parsed.groups)} stat groups is more than {MAX_GROUPS}.")
    if len(parsed.correlations) > MAX_CORRELATIONS:
        raise CandidatesError(
            f"{len(parsed.correlations)} correlations is more than {MAX_CORRELATIONS}."
        )
    if max_rows:
        for group in parsed.groups:
            if len(group.rows) > max_rows:
                raise CandidatesError(
                    f"stats for {group.by} carry {len(group.rows)} rows, more than {max_rows}; "
                    "group by a coarser grain or a top-N first"
                )
        for corr in parsed.correlations:
            if len(corr.pairs) > max_rows:
                raise CandidatesError(
                    f"{len(corr.pairs)} pairs for {corr.columns} is more than {max_rows}; "
                    "pass r from corr() instead"
                )
    return parsed


def _detail_table(models, budget):
    """The lookup table over the first model with an identifier: its key, then
    time, splits, inputs and measures, within the full-width column budget."""
    for m in models:
        keys = m.of("key")
        if not keys:
            continue
        columns = []
        for tag in ("key", "axis", "split_candidate", "input_candidate", "measure"):
            columns += [c.column for c in m.of(tag) if c.column not in columns]
        request = RecommendRequest(
            dimensions=[keys[0]], intent="detail", context=RequestContext(model=m.name)
        )
        return {
            "model": m.name,
            "key": keys[0].column,
            "columns": columns[:budget],
            "why": f"{keys[0].column} identifies each row: look rows up here, never chart them",
            "request": request.model_dump(mode="json", exclude_defaults=True, exclude_none=True),
        }
    return None


class _Wanted:
    """``stats_wanted`` built lane by lane (trends, splits, cross-tabs,
    correlations) and dealt round-robin, so no kind starves the others,
    within what ``_parse_stats`` will accept on the next call."""

    def __init__(self, stats, layer, max_rows):
        self.stats = stats
        self.layer = layer
        self.max_rows = max_rows
        self.lanes = {"trend": [], "split": [], "cross": [], "correlation": []}

    def given(self, model, keys, metric):
        return any(
            group.model in (None, model)
            and sorted(group.keys) == sorted(keys)
            and _measures(group, metric)
            for group in self.stats.groups
        )

    def group(self, lane, m, metric, keys, **extra):
        if not self.given(m.name, keys, metric):
            by = keys[0] if len(keys) == 1 else list(keys)
            want = {"model": m.name, "metric": metric.name, "expression": metric.expression}
            self.lanes[lane].append({**want, "by": by, **extra})

    def correlation(self, m, x, y):
        columns = sorted((x.column, y.column))
        if any(
            c.model in (None, m.name) and sorted(c.columns) == columns
            for c in self.stats.correlations
        ):
            return
        want = {"model": m.name, "correlation": [x.column, y.column]}
        if self.layer.dialect_for(m.name) in NO_CORR_DIALECTS:
            want.update(pairs=self.max_rows, method="spearman")
        else:
            node = exp.Corr(this=_clipped(x), expression=_clipped(y))
            clipped = any(c.stats and c.stats.p99 is not None for c in (x, y))
            want.update(
                expression=self.layer.sql(m.name, node),
                method="pearson_p99" if clipped else "pearson",
            )
        self.lanes["correlation"].append(want)

    def dealt(self):
        room = {
            "group": MAX_GROUPS - len(self.stats.groups),
            "correlation": MAX_CORRELATIONS - len(self.stats.correlations),
        }
        out = []
        for i in range(max(len(lane) for lane in self.lanes.values())):
            for name, lane in self.lanes.items():
                kind = "correlation" if name == "correlation" else "group"
                if i < len(lane) and room[kind] > 0 and len(out) < MAX_STATS_WANTED:
                    out.append(lane[i])
                    room[kind] -= 1
        return out


def _stats_wanted(models, stats, max_rows, doc, layer, pivot_columns):
    """The queries that would measure the unmeasured: each time axis at a grain
    the query cap allows (the primary metric, then the other headline metrics
    on the first axis), the primary metric across each split or input and each
    cross-tab small enough to fetch whole, then robust correlations between
    measures. Already-supplied stats are skipped."""
    wanted = _Wanted(stats, layer, max_rows)
    cap = max_rows or doc.reductions.regrain.points_max
    for m in models:
        primary = m.primary()
        axes = m.of("axis")
        others, columns = [], {primary.column}
        for metric in _headline_metrics(m.chartable(), doc.portfolio.kpi_metrics.max):
            if metric.column not in columns or metric.column is None:
                others += [metric] if metric is not primary else []
                columns.add(metric.column)
        for metrics, cards in (([primary], axes), (others, axes[:1])):
            for card in cards:
                grain = _grain_for(card, cap)
                extra = {"grain": grain}
                if grain != (card.time_grain or "day"):
                    extra["by_expression"] = layer.sql(m.name, _truncated(card.column, grain))
                for metric in metrics:
                    wanted.group("trend", m, metric, (card.column,), **extra)
        for card in [s.raw for s in m.splits] + m.of("input_candidate"):
            wanted.group("split", m, primary, (card.column,))
        for _, a, b, _, _ in m.cross_pairs(doc.pairing_limits, pivot_columns):
            if _raw_cells(a.raw, b.raw) <= cap:
                wanted.group("cross", m, primary, (a.raw.column, b.raw.column))
        measures = m.of("measure")
        for i, x in enumerate(measures):
            for y in measures[i + 1 :]:
                wanted.correlation(m, x, y)
    return wanted.dealt()


def _drop_reason(card):
    if card.bucket() == "one":
        return "one value: nothing to compare"
    if card.role == "text":
        return "free text is a label, not a dimension"
    return "a point coordinate needs its pair (latitude and longitude) for a map"


def score_candidates(
    cards, stats=None, intent=None, dialect="duckdb", max_rows=None, rules=None, interactivity=None
):
    """``{semantic_layer, candidates, detail_table, stats_wanted?, dropped,
    warnings}`` for shape cards (each with its ``model``) and optional
    GROUP BY ``stats``. Only the portfolio is returned, with the semantic
    objects it uses; ``dialect`` is one SQLGlot dialect or ``{model: dialect}``;
    ``max_rows`` bounds each stat (the caller's query cap)."""
    doc = rules or load_insight_design()
    interactivity = interactivity or load_interactivity()
    parsed = _parse_cards(cards)
    stats = _parse_stats(stats, max_rows)
    by_model = {}
    for card in parsed:
        by_model.setdefault(card.model, []).append(ShapeCard(**card.model_dump(exclude={"model"})))
    layer = _Layer(dialect, {name: {c.column for c in cs} for name, cs in by_model.items()})
    warnings = []
    models = [
        _Model(name, cs, doc, interactivity, layer, warnings) for name, cs in by_model.items()
    ]
    for m in models:
        m.weigh(stats)
    builder = _Builder(doc, stats, layer)
    pool = [cand for m in models for cand in builder.all_for(m)]
    kpi = max((builder.kpis(m) for m in models), key=lambda c: len(c.metrics))
    detail = _detail_table(models, load_tables().column_budget.full_width)
    room = doc.portfolio.max_candidates - (1 if detail else 0)
    chosen, hero = choose(pool, kpi, doc, intent, room)
    if intent and intent != "detail" and intent not in {c.intent for c in chosen}:
        warnings.append(f"no candidate fits intent '{intent}' with these cards")
    warnings += builder.warnings
    metrics = {m.name: m.public() for cand in chosen for m in cand.metrics}
    dimensions = {p.name: p.public() for cand in chosen for p in cand.proposals}
    trim = doc.reductions.top_n_other.n_max
    result = {
        "semantic_layer": {
            "metrics": list(metrics.values()),
            "dimensions": list(dimensions.values()),
            "relations": _propose_relations(by_model),
        },
        "candidates": [c.public(trim, hero=c is hero) for c in chosen],
        "detail_table": detail,
        "dropped": [
            {"model": m.name, "column": c.column, "why": _drop_reason(c)}
            for m in models
            for c in m.of("dropped")
        ],
        "warnings": warnings,
    }
    wanted = _stats_wanted(models, stats, max_rows, doc, layer, builder.pivot_columns)
    if wanted:
        result["stats_wanted"] = wanted
    return result
