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

from pydantic import BaseModel, ConfigDict, Field, model_validator

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
KNOWN_TYPES = frozenset(p.value for p in PropType) | frozenset(TABLE_TYPES)

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


class RequestContext(_Strict):
    row_count: Optional[int] = Field(default=None, ge=0)
    existing_inputs: List[str] = Field(default_factory=list)
    max_results: int = Field(default=5, ge=1)


class RecommendRequest(_Strict):
    """No cap on dimensions: some families exist to plot four or five of them.
    Each family gates its own count."""

    metrics: List[MetricSpec] = Field(default_factory=list)
    dimensions: List[ShapeCard] = Field(default_factory=list)
    intent: Optional[Intent] = None
    semantics: Semantics = Field(default_factory=Semantics)
    context: RequestContext = Field(default_factory=RequestContext)


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
    """What must be true of a request for a family to be drawable at all.
    Preferences belong in ``score``; a gate here means the chart would be
    wrong, not merely worse."""

    ordered_axis_required: bool = False
    metrics: MinMax = Field(default_factory=MinMax)
    dimensions: MinMax = Field(default_factory=MinMax)
    axis_roles: List[Role] = Field(default_factory=list)
    dimension_roles: List[Role] = Field(default_factory=list)
    axis_points: MinMax = Field(default_factory=MinMax)
    intents: List[Intent] = Field(default_factory=list)


class Limits(_Strict):
    series_ideal: Optional[int] = Field(default=None, ge=1)
    series_max: Optional[int] = Field(default=None, ge=1)
    repair: List[str] = Field(default_factory=list)

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


class FamilyRule(_Strict):
    """One row of ``families.yml``: when a family is allowed, how far it
    scales, and why it should rank where it does."""

    name: str
    trace_types: List[str] = Field(default_factory=list)
    hard_gates: HardGates = Field(default_factory=HardGates)
    limits: Limits = Field(default_factory=Limits)
    score: List[ScoreAdjustment] = Field(default_factory=list)
    encodings: Dict[str, str] = Field(default_factory=dict)
    pairings: List[str] = Field(default_factory=list)
    layout: LayoutHint = Field(default_factory=LayoutHint)
    warnings: List[str] = Field(default_factory=list)
    skill: Optional[str] = None

    @model_validator(mode="after")
    def _known_types(self):
        unknown = [t for t in self.trace_types if t not in KNOWN_TYPES]
        if unknown:
            raise ValueError(f"unknown trace types {unknown}")
        return self


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
    layout: LayoutHint = Field(default_factory=LayoutHint)
    mobile: Optional[str] = None

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
    pairings: List[str] = Field(default_factory=list)
    layout: LayoutHint = Field(default_factory=LayoutHint)
    skill: Optional[str] = None


class Rejection(_Strict):
    family: str
    reason: str


class RecommendResponse(_Strict):
    recommendations: List[Recommendation] = Field(default_factory=list)
    rejected: List[Rejection] = Field(default_factory=list)
    transforms_suggested: List[str] = Field(default_factory=list)
