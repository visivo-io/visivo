"""The contracts between "what does this data look like" and "what should be
drawn" (VIS-1406).

Phase 1's profiler emits a ``ShapeCard`` per column. Phase 2's rule files
are ``FamilyRule``, ``TraceEntry`` and ``LayoutRule`` documents. Phase 2b's
recommender takes a ``RecommendRequest`` and returns a ``RecommendResponse``.
They land first so every later phase codes against one definition, and so the
rule YAML is validated the moment it is loaded rather than when a bad entry
produces a bad chart.

Nothing here is a project object: these models are not under
``visivo/models`` and never reach the project schema or a ``.visivo.yml``.
"""

from typing import Any, Dict, List, Literal, Optional, Tuple, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from visivo.models.props.types import PropType

Role = Literal[
    "time",
    "categorical",
    "numeric_continuous",
    "numeric_discrete",
    "identifier",
    "boolean",
    "geo_region",
    "geo_point",
    "text",
]

ORDERED_ROLES = ("time", "numeric_continuous", "numeric_discrete")

CardinalityBucket = Literal["one", "few", "some", "many", "high"]

# Upper bound (inclusive) of each bucket, in order. "high" is everything above.
CARDINALITY_BUCKETS: Tuple[Tuple[CardinalityBucket, int], ...] = (
    ("one", 1),
    ("few", 7),
    ("some", 20),
    ("many", 100),
)


def bucket_for(cardinality):
    """``few`` for 2–7 distinct values, ``some`` for 8–20, and so on."""
    for name, upper in CARDINALITY_BUCKETS:
        if cardinality <= upper:
            return name
    return "high"


GeoKind = Literal["iso3", "iso2", "country_name", "us_state", "fips", "latlon", "custom"]

TimeGrain = Literal["second", "minute", "hour", "day", "week", "month", "quarter", "year"]

Intent = Literal[
    "kpi",
    "trend",
    "compare",
    "rank",
    "composition",
    "distribution",
    "relationship",
    "flow",
    "change",
    "geo",
    "detail",
]

Aggregation = Literal["sum", "avg", "count", "count_distinct", "min", "max", "median", "rate"]

RowRole = Literal["inputs", "header", "kpi", "hero", "breakdown", "relationship", "detail"]

# Visivo tables are not Plotly traces but they compete with charts for the same
# slot, so the rule files treat them as families with types of their own.
TABLE_TYPES = ("table", "table_pivot")
TRACE_TYPES = frozenset(p.value for p in PropType)
KNOWN_TYPES = TRACE_TYPES | frozenset(TABLE_TYPES)

# The chart idioms the recommender ranks (P2a research, 00-method.md). A trace
# entry names its primary family here; `scatter` also serves `area` and `xy`.
FAMILIES = (
    "kpi",
    "line",
    "area",
    "xy",
    "bar",
    "heatmap",
    "distribution",
    "density2d",
    "part_of_whole",
    "hierarchy",
    "flow",
    "funnel",
    "waterfall",
    "geo_region",
    "geo_point",
    "geo_density",
    "financial",
    "multivariate",
    "polar",
    "ternary_smith",
    "three_d",
    "carpet",
    "image",
    "table",
)

REQUESTABLE = frozenset(FAMILIES) | KNOWN_TYPES


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- what a column looks like ----------------------------------------------


class TopValue(_Strict):
    value: Any
    share: float = Field(ge=0, le=1)


class ColumnStats(_Strict):
    min: Optional[Union[float, str]] = None
    max: Optional[Union[float, str]] = None
    mean: Optional[float] = None
    median: Optional[float] = None
    stddev: Optional[float] = None
    skew: Optional[float] = None
    p99: Optional[float] = None
    zeros_pct: Optional[float] = Field(default=None, ge=0, le=1)


class ShapeCard(_Strict):
    """One column, described well enough to choose a chart for it."""

    column: str
    role: Role
    cardinality: int = Field(ge=0)
    cardinality_bucket: Optional[CardinalityBucket] = None
    null_pct: float = Field(default=0, ge=0, le=1)
    time_grain: Optional[TimeGrain] = None
    time_span_points: Optional[int] = Field(default=None, ge=0)
    geo_kind: Optional[GeoKind] = None
    additive: Optional[bool] = None
    ordered: Optional[bool] = None
    top_n: List[TopValue] = Field(default_factory=list)
    stats: Optional[ColumnStats] = None

    def is_ordered(self):
        """Whether the values have a natural sequence a line can follow:
        time and numbers always do; a categorical does only if the profiler
        or the agent says so (sizes S/M/L, funnel stages)."""
        if self.ordered is not None:
            return self.ordered
        return self.role in ORDERED_ROLES

    def axis_points(self):
        return self.time_span_points or self.cardinality

    @model_validator(mode="after")
    def _derive_bucket(self):
        derived = bucket_for(self.cardinality)
        if self.cardinality_bucket is None:
            self.cardinality_bucket = derived
        elif self.cardinality_bucket != derived:
            raise ValueError(
                f"cardinality {self.cardinality} is '{derived}', not '{self.cardinality_bucket}'"
            )
        return self


# --- what the agent asks -----------------------------------------------------


class MetricSpec(_Strict):
    name: str
    agg: Aggregation
    card: Optional[ShapeCard] = None
    unit: Optional[str] = None


class Semantics(_Strict):
    part_of_whole: bool = False
    cumulative: bool = False
    ordered_stages: bool = False
    signed_contributions: bool = False
    hierarchy: bool = False
    boundaries_available: bool = False
    # P2f: the reader needs the figures themselves (reconciliation, audit).
    exact_values: bool = False
    # P2f: a composition that must show its totals; pivots render none, so
    # the skeleton says to build them in SQL.
    totals_required: bool = False


class RequestContext(_Strict):
    row_count: Optional[int] = Field(default=None, ge=0)
    existing_inputs: List[str] = Field(default_factory=list)
    max_results: int = Field(default=5, ge=1)
    # The model the columns come from, for the ${ref()}s in a skeleton.
    model: str = "model"
    # The first theme colorway colour (the built-in light theme's unless the tool reads another).
    theme_color: str = "#0a9396"


class DimensionCard(ShapeCard):
    """A shape card as score_candidates and recommend_inputs take it: the
    ``model`` the column comes from may ride along, so one list of cards
    serves every tool."""

    model: Optional[str] = None


class RecommendRequest(_Strict):
    """No cap on dimensions: some families exist to plot four or five of them.
    Each family gates its own count."""

    metrics: List[MetricSpec] = Field(default_factory=list)
    dimensions: List[DimensionCard] = Field(default_factory=list)
    intent: Optional[Intent] = None
    semantics: Semantics = Field(default_factory=Semantics)
    context: RequestContext = Field(default_factory=RequestContext)
    # The family or trace type the user named: it ranks first with its penalties
    # and warnings intact; only a hard gate still rejects it.
    requested: Optional[str] = None

    @field_validator("requested")
    @classmethod
    def _known_request(cls, requested):
        if requested is not None and requested not in REQUESTABLE:
            raise ValueError(f"'{requested}' is neither a family nor a trace type")
        return requested

    @field_validator("dimensions", mode="before")
    @classmethod
    def _plain_cards_too(cls, dimensions):
        """Callers in this package pass ShapeCards; widen them."""
        return [d.model_dump() if isinstance(d, ShapeCard) else d for d in dimensions or []]

    @model_validator(mode="after")
    def _model_from_the_cards(self):
        """The skeleton refs the cards' model when the context names none."""
        models = {d.model for d in self.dimensions if d.model}
        if "model" not in self.context.model_fields_set and len(models) == 1:
            self.context.model = models.pop()
        return self


# --- what the rules say ------------------------------------------------------


class MinMax(_Strict):
    min: int = Field(default=0, ge=0)
    max: Optional[int] = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _ordered(self):
        if self.max is not None and self.max < self.min:
            raise ValueError(f"max {self.max} is below min {self.min}")
        return self

    def admits(self, count):
        return count >= self.min and (self.max is None or count <= self.max)


class LayoutHint(_Strict):
    height: Union[str, int] = "medium"
    width_share: float = Field(default=1.0, gt=0, le=1)
    row_role: RowRole = "breakdown"


class HardGates(_Strict):
    """Structural conditions only: a chart that fails one would be wrong, not
    merely worse. Counts and ranges are never written here; they come from
    the member entries' ``data_shape`` (minimums gate, maximums rank)."""

    ordered_axis_required: bool = False
    axis_roles: List[Role] = Field(default_factory=list)
    # `when` clauses that must all fire, e.g. ordered_stages for a funnel.
    requires: List[str] = Field(default_factory=list)
    intents: List[Intent] = Field(default_factory=list)


class Limits(_Strict):
    series_ideal: Optional[int] = Field(default=None, ge=1)
    series_max: Optional[int] = Field(default=None, ge=1)
    repair: List[str] = Field(default_factory=list)
    # A top-N that would leave Other the largest value moves on to the next repair.
    other_not_largest: bool = False

    @model_validator(mode="after")
    def _ordered(self):
        if (
            self.series_ideal is not None
            and self.series_max is not None
            and self.series_max < self.series_ideal
        ):
            raise ValueError("series_max is below series_ideal")
        return self


class ScoreAdjustment(_Strict):
    when: str
    delta: float
    reason: str


class DataShape(_Strict):
    """Every threshold for an entry, in one place. ``cardinality`` counts the
    distinct values of the main dimension, ``axis_points`` the points along
    an ordered axis, ``rows`` the rows the trace draws, ``rows_per_group``
    the rows each category needs, and ``cells`` the marks a grid or grouped
    chart draws (rows × columns, or categories × metrics).

    These are where the chart stays readable, used to rank and to warn. They
    never stop the agent building a chart the user asked for by name."""

    metrics: MinMax = Field(default_factory=MinMax)
    dimensions: MinMax = Field(default_factory=MinMax)
    dimension_roles: List[Role] = Field(default_factory=list)
    cardinality: Optional[MinMax] = None
    axis_points: Optional[MinMax] = None
    rows: Optional[MinMax] = None
    rows_per_group: Optional[MinMax] = None
    cells: Optional[MinMax] = None


class Variation(_Strict):
    when: str
    then: str


class OtherUse(_Strict):
    use: str
    how: str


class TextLabels(_Strict):
    """When value labels on the marks stay readable: at most ``max_marks``
    marks (categories times series) at the entry's own layout width."""

    max_marks: int = Field(ge=1)


class TraceEntry(_Strict):
    """One ``rules/traces/<type>.yml``: what the agent reads to choose a trace
    and write it."""

    type: str
    family: str
    secondary_families: List[str] = Field(default_factory=list)
    status: Literal["preferred", "niche", "deprecated"] = "preferred"
    one_liner: str = Field(max_length=120)
    use_when: List[str] = Field(min_length=1, max_length=4)
    other_uses: List[OtherUse] = Field(default_factory=list, max_length=4)
    avoid_when: List[str] = Field(min_length=1, max_length=4)
    data_shape: DataShape
    required_props: List[str] = Field(default_factory=list)
    example: str
    variations: List[Variation] = Field(default_factory=list)
    limits: Limits = Field(default_factory=Limits)
    transforms: List[str] = Field(default_factory=list)
    gotchas: List[str] = Field(default_factory=list, max_length=5)
    pairings: List[str] = Field(default_factory=list)
    alternatives: List[str] = Field(default_factory=list)
    layout: LayoutHint = Field(default_factory=LayoutHint)
    mobile: Optional[str] = None
    # Read by the skeleton: labels only up to a size, and the props whose
    # category axis is ordered by the metric's total (time stays chronological).
    text_labels: Optional[TextLabels] = None
    order_axes: List[Literal["x", "y"]] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _consistent(self):
        if self.type not in KNOWN_TYPES:
            raise ValueError(f"'{self.type}' is not a Plotly trace type or a table type")
        for family in [self.family, *self.secondary_families]:
            if family not in FAMILIES:
                raise ValueError(f"'{family}' is not one of the families {list(FAMILIES)}")
        if self.family in self.secondary_families:
            raise ValueError("secondary_families repeats the primary family")
        if len(self.example.strip().splitlines()) > 20:
            raise ValueError("example must be 20 lines or fewer")
        if f"type: {self.type}" not in self.example and self.type not in TABLE_TYPES:
            raise ValueError(f"example must set 'type: {self.type}'")
        try:
            import yaml

            yaml.safe_load(self.example)
        except Exception as error:
            raise ValueError(f"example is not valid YAML: {str(error).splitlines()[0]}")
        return self

    def families(self):
        return [self.family, *self.secondary_families]


class FamilyRule(_Strict):
    """One row of ``families.yml``: the judgement a family adds on top of the
    entries ``trace_types`` claims, preferred first. The loader attaches them
    as ``members``; only a family without entries carries a ``data_shape``."""

    name: str
    trace_types: List[str] = Field(default_factory=list)
    hard_gates: HardGates = Field(default_factory=HardGates)
    score: List[ScoreAdjustment] = Field(default_factory=list)
    props: Dict[str, Any] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)
    skill: Optional[str] = None
    skeleton: Literal["chart", "table", "pivot"] = "chart"
    data_shape: Optional[DataShape] = None
    layout: Optional[LayoutHint] = None
    members: List[TraceEntry] = Field(default_factory=list, exclude=True)

    @model_validator(mode="after")
    def _known_types(self):
        unknown = [t for t in self.trace_types if t not in TRACE_TYPES]
        if unknown:
            raise ValueError(f"unknown trace types {unknown}")
        return self

    def layout_hint(self):
        """The family's own layout, else its preferred member's."""
        if self.layout is not None:
            return self.layout
        return self.members[0].layout if self.members else LayoutHint()


class Penalties(_Strict):
    out_of_range: float = Field(ge=0)
    repair: float = Field(ge=0)
    niche: float = Field(ge=0)


class FamiliesDoc(_Strict):
    """The whole of ``families.yml``."""

    penalties: Penalties
    builtin_boundaries: List[GeoKind] = Field(default_factory=list)
    families: List[FamilyRule] = Field(min_length=1)


# The ranges a repair can bring back within limits, in the order the recommender repairs them.
Measure = Literal["dimensions", "metrics", "series", "cardinality", "axis_points", "cells", "rows"]


class OtherRecipe(_Strict):
    """How a top-N draws its Other: one neutral colour, set on the insight
    through the props each type colours by, and last by its rank column. The
    named marks of a type that draws a null colour black take the theme's."""

    label: str
    color: str
    rank_column: str
    series_color: Dict[str, List[str]] = Field(default_factory=dict)
    slice_color: Dict[str, List[str]] = Field(default_factory=dict)
    null_is_black: List[str] = Field(default_factory=list)


class Transform(_Strict):
    """A repair or reshaping: how to apply it, the ranges it fixes, and the
    dimension roles it can act on (any when empty)."""

    name: str
    how: str
    fixes: List[Measure] = Field(default_factory=list)
    roles: List[Role] = Field(default_factory=list)
    other: Optional[OtherRecipe] = None

    def acts_on(self, role):
        return not self.roles or role in self.roles

    def instructions(self):
        if not self.other:
            return self.how
        fields = self.other.model_dump()
        return self.how.format(**{**fields, "null_is_black": " or ".join(fields["null_is_black"])})


class TransformsDoc(_Strict):
    """The whole of ``transforms.yml``."""

    # How many of each grain make the next coarser one (calendar facts).
    regrain_steps: Dict[TimeGrain, float] = Field(default_factory=dict)
    transforms: List[Transform] = Field(min_length=1)

    @model_validator(mode="after")
    def _unique(self):
        names = [t.name for t in self.transforms]
        if len(names) != len(set(names)):
            raise ValueError("transform names must be unique")
        return self

    def get(self, name):
        return next((t for t in self.transforms if t.name == name), None)


class Pairing(_Strict):
    """One row of ``pairings.yml``. An ``overlay`` is a second insight in the
    same chart; a ``companion`` is a separate item placed beside, above or
    below it. ``param`` names what a parametrised pairing takes, written
    ``name(value)`` in a trace entry."""

    name: str
    kind: Literal["overlay", "companion"]
    adds: str
    param: Optional[Literal["type", "family"]] = None
    insight_props: Dict[str, Any] = Field(default_factory=dict)
    chart_layout: Dict[str, Any] = Field(default_factory=dict)
    placement: Optional[Literal["above", "below", "beside"]] = None
    item: Optional[Literal["chart", "table", "kpi"]] = None

    @model_validator(mode="after")
    def _shape(self):
        if self.kind == "overlay" and not (self.insight_props or self.chart_layout):
            raise ValueError(f"overlay {self.name} needs insight_props or chart_layout")
        if self.kind == "companion" and (self.placement is None or self.item is None):
            raise ValueError(f"companion {self.name} needs a placement and an item")
        if self.kind == "companion" and (self.insight_props or self.chart_layout):
            raise ValueError(f"companion {self.name} is its own item; it sets no chart props")
        return self


class PairingsDoc(_Strict):
    """The whole of ``pairings.yml``: every way to combine insights."""

    pairings: List[Pairing] = Field(min_length=1)

    @model_validator(mode="after")
    def _unique(self):
        names = [p.name for p in self.pairings]
        if len(names) != len(set(names)):
            raise ValueError("pairing names must be unique")
        return self

    def get(self, name):
        return next((p for p in self.pairings if p.name == name), None)


def split_pairing(reference):
    """``("chart_beside", "bar")`` for ``chart_beside(bar)``; the argument is
    ``None`` for a plain name."""
    name, _, rest = reference.partition("(")
    return name.strip(), (rest.rstrip(")").strip() or None) if rest else None


HEIGHT_TOKENS = ("compact", "xsmall", "small", "medium", "large", "xlarge", "xxlarge")

# What each token resolves to at the top level of a dashboard. `compact` wraps
# markdown and inputs to their content; a chart or table there gets `small`.
HEIGHT_PX = {
    "xsmall": 128,
    "small": 256,
    "medium": 396,
    "large": 512,
    "xlarge": 768,
    "xxlarge": 1024,
}


def height_px(height):
    """Pixels for a height token or int; ``None`` for ``compact``."""
    if isinstance(height, int):
        return height
    return HEIGHT_PX.get(height)


def _check_height(value):
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        raise ValueError(f"height must be a token or a positive int, got {value!r}")
    if isinstance(value, int) and value <= 0:
        raise ValueError("a pixel height must be positive")
    if isinstance(value, str) and value not in HEIGHT_TOKENS:
        raise ValueError(f"'{value}' is not one of {HEIGHT_TOKENS}")
    return value


class LayoutRule(_Strict):
    """One row of ``layout.yml``: how a row role is sized and bounded.
    ``widths`` maps an item count to 12-unit column widths."""

    row_role: RowRole
    height: Union[str, int] = "medium"
    max_per_row: int = Field(default=4, ge=1)
    widths: Dict[int, List[int]] = Field(default_factory=dict)
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _consistent(self):
        _check_height(self.height)
        for count, widths in self.widths.items():
            if count > self.max_per_row:
                raise ValueError(f"widths for {count} items exceed max_per_row {self.max_per_row}")
            if len(widths) != count or sum(widths) != 12 or any(w <= 0 for w in widths):
                raise ValueError(
                    f"widths for {count} items must be {count} positive ints summing to 12"
                )
        return self

    def widths_for(self, count):
        """The 12-unit widths for ``count`` items; an even split when the file
        does not name one (12 is divisible by 1, 2, 3, 4, 6)."""
        if count in self.widths:
            return list(self.widths[count])
        if count <= 0 or 12 % count:
            raise ValueError(f"no width rule for {count} items in a {self.row_role} row")
        return [12 // count] * count


class LayoutTemplate(_Strict):
    name: str
    widths: List[int] = Field(min_length=1)
    height: Union[str, int] = "medium"
    slots: List[str] = Field(default_factory=list)
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _twelve(self):
        _check_height(self.height)
        if sum(self.widths) != 12:
            raise ValueError(f"template {self.name} widths must sum to 12")
        return self


class HeatmapHeight(_Strict):
    """A heatmap grows with its vertical category count: ``base + per_category
    * n`` snapped up to the next height stop, an int past the last stop."""

    base: int = 128
    per_category: int = 20
    stops: List[int] = Field(default_factory=lambda: [256, 396, 512, 768, 1024])
    max_px: int = 2048

    def pick(self, n_categories):
        px = self.base + self.per_category * max(n_categories, 0)
        for stop in self.stops:
            if px <= stop:
                return next(token for token, value in HEIGHT_PX.items() if value == stop)
        return min(px, self.max_px)


class GridLimits(_Strict):
    width_total: int = 12
    stack_breakpoint_px: int = 1024
    max_depth: int = Field(default=1, ge=0)
    max_items: int = Field(default=12, ge=1)
    max_content_rows: int = Field(default=8, ge=1)
    max_adjacent_large: int = Field(default=1, ge=1)
    max_inputs: int = Field(default=4, ge=1)


class KpiCluster(_Strict):
    """A hero chart with its KPIs beside it in sub-rows of at most
    ``max_per_sub_row``."""

    widths: List[int] = Field(default_factory=lambda: [8, 4])
    max_kpis: int = Field(default=8, ge=1)
    max_per_sub_row: int = Field(default=2, ge=1)
    sub_row_height: str = "xsmall"

    @model_validator(mode="after")
    def _valid(self):
        _check_height(self.sub_row_height)
        if sum(self.widths) != 12 or len(self.widths) != 2:
            raise ValueError("kpi_cluster widths must be two ints summing to 12")
        if 12 % self.max_per_sub_row:
            raise ValueError("kpi_cluster max_per_sub_row must divide 12")
        return self


class LayoutDoc(_Strict):
    """The whole of ``layout.yml``."""

    grid: GridLimits = Field(default_factory=GridLimits)
    order: List[RowRole]
    hero_by_intent: Dict[Intent, Optional[str]] = Field(default_factory=dict)
    row_role_by_family: Dict[str, RowRole] = Field(default_factory=dict)
    rules: List[LayoutRule]
    templates: List[LayoutTemplate] = Field(default_factory=list)
    height_by_family: Dict[str, Union[str, int]] = Field(default_factory=dict)
    heatmap_height: HeatmapHeight = Field(default_factory=HeatmapHeight)
    gauge_height: Union[str, int] = "medium"
    kpi_cluster: KpiCluster = Field(default_factory=KpiCluster)
    detail_height_by_rows: Dict[int, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _complete(self):
        roles = [r.row_role for r in self.rules]
        if len(roles) != len(set(roles)):
            raise ValueError("a row role may have one rule only")
        missing = [role for role in self.order if role not in roles]
        if missing:
            raise ValueError(f"order names roles without a rule: {missing}")
        if len(self.order) != len(set(self.order)):
            raise ValueError("order repeats a role")
        for family, height in self.height_by_family.items():
            _check_height(height)
        for rows, height in self.detail_height_by_rows.items():
            _check_height(height)
        _check_height(self.gauge_height)
        return self

    def rule(self, role):
        return next(r for r in self.rules if r.row_role == role)


# --- what the recommender answers -------------------------------------------


class Recommendation(_Strict):
    family: str
    trace_type: Optional[str] = None
    score: float
    why: List[str] = Field(min_length=1)
    encodings: Dict[str, str] = Field(default_factory=dict)
    transforms: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    yaml_skeleton: Optional[str] = None
    example_yaml: Optional[str] = None
    table_yaml: Optional[str] = None
    pairings: List[str] = Field(default_factory=list)
    alternatives: List[str] = Field(default_factory=list)
    layout: LayoutHint = Field(default_factory=LayoutHint)
    skill: Optional[str] = None


class Rejection(_Strict):
    family: str
    reason: str


class RecommendResponse(_Strict):
    recommendations: List[Recommendation] = Field(default_factory=list)
    rejected: List[Rejection] = Field(default_factory=list)
    transforms_suggested: List[str] = Field(default_factory=list)


# --- what interactivity.yml says ---------------------------------------------

Interaction = Literal["filter", "split", "sort", "prop"]

OptionsSource = Literal[
    "static",
    "from_top_n",
    "query_distinct",
    "sorted_distinct",
    "numeric_range",
    "date_range",
]

DefaultRule = Literal[
    "first_option",
    "top_value",
    "top_values",
    "full_span",
    "median",
    "recent_window",
]


class InputMatch(_Strict):
    role: List[Role] = Field(min_length=1)
    bucket: List[CardinalityBucket] = Field(default_factory=list)
    n_min: Optional[int] = Field(default=None, ge=0)
    n_max: Optional[int] = Field(default=None, ge=0)

    def admits(self, card):
        if card.role not in self.role:
            return False
        if self.bucket and card.cardinality_bucket not in self.bucket:
            return False
        if self.n_min is not None and card.cardinality < self.n_min:
            return False
        if self.n_max is not None and card.cardinality > self.n_max:
            return False
        return True


class InputShape(_Strict):
    type: Literal["single-select", "multi-select"]
    display: str
    options: OptionsSource
    static_options: List[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _static_has_options(self):
        if self.options == "static" and not self.static_options:
            raise ValueError("static options need static_options")
        return self


class Wiring(_Strict):
    interaction: Interaction
    expression: str
    path: Optional[str] = None


class CardToInput(_Strict):
    match: InputMatch
    input: Union[InputShape, Literal["none"]]
    default: Optional[DefaultRule] = None
    accessor: Union[str, List[str], None] = None
    wiring: Optional[Wiring] = None
    why: str
    warnings: List[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _complete(self):
        if self.input != "none" and (self.wiring is None or self.default is None):
            raise ValueError("an input rule needs a wiring and a default")
        return self


class Pattern(_Strict):
    name: str
    trigger: str
    wiring: Optional[str] = None
    example: Optional[str] = None
    snippet_ref: Optional[str] = None
    note: Optional[str] = None
    verified: bool = True
    supported: bool = True
    forbid_paths: List[str] = Field(default_factory=list)
    fallback: Optional[str] = None


class InputsRow(_Strict):
    height: str = "compact"
    position: str = "top"
    precede_with_markdown_header: bool = True


class DesignRules(_Strict):
    max_inputs_per_dashboard: int = Field(default=4, ge=1)
    max_inputs_mobile_row: int = Field(default=3, ge=1)
    inputs_row: InputsRow = Field(default_factory=InputsRow)
    chart_local_input: str = "beside its chart as [8, 4]"
    input_over_split_min_bucket: CardinalityBucket = "some"
    require_default: bool = True
    multi_select_default: str = "explicit_static_list"
    numeric_range_default: str = "full_span"
    string_operand_quoting: str = "'${ref(I).value}'"
    input_name_style: str = "snake_case"
    write_order: str = "inputs_before_insights"
    global_filter_must_wire_all: bool = True
    table_filtering: str = ""
    large_model_warning_rows: int = 1_000_000


class InteractivityDoc(_Strict):
    card_to_input: List[CardToInput] = Field(min_length=1)
    patterns: List[Pattern] = Field(default_factory=list)
    design_rules: DesignRules = Field(default_factory=DesignRules)

    @model_validator(mode="after")
    def _unique_patterns(self):
        names = [p.name for p in self.patterns]
        if len(names) != len(set(names)):
            raise ValueError("pattern names must be unique")
        return self

    def rule_for(self, card):
        """The first card_to_input entry that admits ``card``, or ``None``."""
        return next((r for r in self.card_to_input if r.match.admits(card)), None)

    def pattern(self, name):
        return next(p for p in self.patterns if p.name == name)


# --- what tables.yml says ----------------------------------------------------


class RowsPerPageRule(_Strict):
    enum: List[int] = Field(min_length=1)
    lookup: str
    long: int
    with_format_cells: str

    @model_validator(mode="after")
    def _long_is_a_member(self):
        if self.long not in self.enum:
            raise ValueError("`long` must be one of the enum values")
        return self

    def pick(self, rows, gradient=False):
        """The smallest page size that shows ``rows`` without a pager, when
        that is a small lookup table (or a gradient needs one page); ``long``
        otherwise."""
        if rows is not None and (rows <= 50 or gradient):
            for size in sorted(self.enum):
                if size >= rows:
                    return size
        return self.long


class ColumnBudget(_Strict):
    full_width: int = 12
    half_width: int = 6
    min_col_px: int = 80


class FormatCellsRule(_Strict):
    scope: Dict[str, str]
    colors: Dict[str, str]
    forbid: List[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _hex(self):
        for key in ("min", "max"):
            value = self.colors.get(key, "")
            if not (value.startswith("#") and len(value) in (4, 7)):
                raise ValueError(f"format_cells colour {key!r} must be hex, got {value!r}")
        return self


class PivotValues(_Strict):
    max: int = Field(default=3, ge=1)
    form: str
    aggs: List[str] = Field(min_length=1)


class PivotRules(_Strict):
    rows: str
    columns: str
    values: PivotValues
    source: str
    period_labels: str
    totals: str
    format_cells: FormatCellsRule


class DetailPlacement(_Strict):
    position: str = "last"
    width_share: float = 1.0
    height_by_rows: Dict[int, str] = Field(default_factory=dict)
    default_height: str = "large"
    never: List[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _heights(self):
        for height in [*self.height_by_rows.values(), self.default_height]:
            _check_height(height)
        return self


class PivotBeside(_Strict):
    max_columns: int = Field(default=6, ge=1)
    two_to_one_up_to: int = Field(default=4, ge=1)


class KpiTable(_Strict):
    max_rows: int = Field(default=3, ge=1)
    max_cols: int = Field(default=3, ge=1)
    height: str = "small"


class TablePlacement(_Strict):
    detail: DetailPlacement = Field(default_factory=DetailPlacement)
    pivot_beside_chart: PivotBeside = Field(default_factory=PivotBeside)
    kpi_table: KpiTable = Field(default_factory=KpiTable)
    max_tables_per_row: int = Field(default=1, ge=1)
    section: str = ""
    mobile: str = ""


class TablesDoc(_Strict):
    """The whole of ``tables.yml``."""

    rows_per_page: RowsPerPageRule
    visible_rows_by_height: Dict[str, int] = Field(default_factory=dict)
    column_budget: ColumnBudget = Field(default_factory=ColumnBudget)
    pivot_rules: PivotRules
    gotchas: List[str] = Field(min_length=1)
    placement: TablePlacement = Field(default_factory=TablePlacement)


# --- what insight_design.yml says --------------------------------------------


class MetricRule(_Strict):
    """An empty ``additive`` admits any additivity; ``heavy_tail_agg``
    replaces ``avg`` on a heavy tail."""

    roles: List[Role] = Field(min_length=1)
    additive: List[Optional[bool]] = Field(default_factory=list)
    aggs: List[Aggregation] = Field(default_factory=list)
    heavy_tail_agg: Optional[Aggregation] = None
    duration_agg: Optional[Aggregation] = None
    why: str

    def admits(self, card):
        return card.role in self.roles and (not self.additive or card.additive in self.additive)


class HeavyTail(_Strict):
    skew_over: float = Field(gt=0)
    p99_over_median: float = Field(gt=1)

    def holds(self, stats):
        if stats is None:
            return False
        if stats.skew is not None and stats.skew > self.skew_over:
            return True
        return bool(
            stats.p99 is not None
            and stats.median is not None
            and stats.median > 0
            and stats.p99 / stats.median > self.p99_over_median
        )


class PrimaryMetric(_Strict):
    """Before stats rank the totals, the first whose column holds one of
    ``words`` leads."""

    words: List[str] = Field(min_length=1)

    @model_validator(mode="after")
    def _plain(self):
        if any(w != w.lower() or not w.isalpha() for w in self.words):
            raise ValueError("primary_metric words are lower-case single words")
        return self

    def matches(self, column):
        tokens = "".join(c if c.isalnum() else " " for c in str(column).lower()).split()
        return [w for w in self.words if w in tokens]


class PairingLimits(_Strict):
    categoricals_with_time: int = Field(ge=0)
    chart_max_cells: int = Field(ge=1)
    pivot_max_cells: int = Field(ge=1)

    @model_validator(mode="after")
    def _ordered(self):
        if self.pivot_max_cells < self.chart_max_cells:
            raise ValueError("pivot_max_cells is below chart_max_cells")
        return self


class SplitVsInput(_Strict):
    top_n_min_share: float = Field(gt=0, le=1)


class Reduction(_Strict):
    when: str


class TopNOther(Reduction):
    n: int = Field(ge=1)
    n_max: int = Field(ge=1)

    @model_validator(mode="after")
    def _ordered(self):
        if self.n_max < self.n:
            raise ValueError("top_n_other n_max is below n")
        return self


class BucketReduction(Reduction):
    bins: int = Field(ge=2)


class Regrain(Reduction):
    # The readable range of a trend: fewer than points_min no longer reads as a
    # trend, more than points_max is too dense to draw. Input defaults keep a
    # time window at points_min or more, so they read it from here too.
    points_min: int = Field(ge=2)
    points_max: int = Field(ge=2)

    @model_validator(mode="after")
    def _a_range(self):
        if self.points_min >= self.points_max:
            raise ValueError("regrain.points_min must be below points_max")
        return self


class CollapseRare(Reduction):
    min_share: float = Field(gt=0, lt=1)


class Reductions(_Strict):
    top_n_other: TopNOther
    bucket: BucketReduction
    regrain: Regrain
    collapse_rare: CollapseRare
    clip_p99: Reduction


class Penalties(_Strict):
    high_nulls: float = Field(ge=0, le=1)
    constant_metric: float = Field(ge=0, le=1)
    cardinality_one: float = Field(ge=0, le=1)
    derived_correlation: float = Field(ge=0, le=1)
    dependent_pair: float = Field(ge=0, le=1)


class Scoring(_Strict):
    high_nulls: float = Field(gt=0, lt=1)
    derived_r: float = Field(gt=0, le=1)
    scatter_min_r: float = Field(ge=0, le=1)
    banded_min_r: float = Field(ge=0, le=1)
    anomaly_z: float = Field(gt=0)
    material_change: float = Field(gt=0)
    dependent_lambda: float = Field(gt=0, le=1)
    top_share_of: int = Field(ge=1)
    seasonality_lags: Dict[TimeGrain, int] = Field(min_length=1)
    unmeasured: float = Field(ge=0, le=1)
    penalties: Penalties

    @model_validator(mode="after")
    def _lags(self):
        if any(lag < 2 for lag in self.seasonality_lags.values()):
            raise ValueError("a seasonality lag must be at least 2")
        if self.banded_min_r > self.scatter_min_r:
            raise ValueError("banded_min_r is above scatter_min_r")
        return self


class PortfolioSlot(_Strict):
    name: str
    intents: List[Intent] = Field(min_length=1)
    max: int = Field(ge=1)


class Portfolio(_Strict):
    max_candidates: int = Field(ge=1)
    min_score: float = Field(ge=0, lt=1)
    kpi_metrics: MinMax
    slots: List[PortfolioSlot] = Field(min_length=1)
    repeat_family: float = Field(ge=0, le=1)
    repeat_dimension: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def _slots(self):
        intents = [i for slot in self.slots for i in slot.intents]
        if len(intents) != len(set(intents)):
            raise ValueError("an intent may belong to one portfolio slot only")
        if sum(slot.max for slot in self.slots) > self.max_candidates:
            raise ValueError("the slots hold more candidates than max_candidates")
        return self

    def slot_for(self, intent):
        return next((slot for slot in self.slots if intent in slot.intents), None)


class InsightDesignDoc(_Strict):
    """``insight_design.yml``. The input bucket and a trend's fewest points
    are read from ``interactivity.yml``, never restated here."""

    metric_by_role: List[MetricRule] = Field(min_length=1)
    heavy_tail: HeavyTail
    primary_metric: PrimaryMetric
    pairing_limits: PairingLimits
    split_vs_input: SplitVsInput
    reductions: Reductions
    scoring: Scoring
    portfolio: Portfolio

    @model_validator(mode="after")
    def _floor_admits_the_prior(self):
        if self.portfolio.min_score > self.scoring.unmeasured:
            raise ValueError("portfolio min_score is above scoring unmeasured")
        return self

    @model_validator(mode="after")
    def _every_card_has_one_rule(self):
        roles = Role.__args__
        for role in roles:
            for additive in (True, False, None):
                probe = ShapeCard(column="c", role=role, cardinality=2, additive=additive)
                matches = [r for r in self.metric_by_role if r.admits(probe)]
                if len(matches) != 1:
                    raise ValueError(
                        f"metric_by_role has {len(matches)} rules for role {role} "
                        f"with additive {additive}; it needs exactly one"
                    )
        return self

    def metric_rule(self, card):
        return next(r for r in self.metric_by_role if r.admits(card))
