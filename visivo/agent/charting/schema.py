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

import datetime as _dt
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
    top_n: List[TopValue] = Field(default_factory=list)
    stats: Optional[ColumnStats] = None

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
    time_required: bool = False
    time_forbidden: bool = False
    metrics: MinMax = Field(default_factory=MinMax)
    dimensions: MinMax = Field(default_factory=MinMax)
    dimension_roles: List[Role] = Field(default_factory=list)
    min_time_points: Optional[int] = Field(default=None, ge=0)
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


class Review(_Strict):
    state: Literal["pending", "approved", "changes_requested"] = "pending"
    by: Optional[str] = None
    date: Optional[_dt.date] = None


class DataShape(_Strict):
    metrics: MinMax = Field(default_factory=MinMax)
    dimensions: MinMax = Field(default_factory=MinMax)
    dimension_roles: List[Role] = Field(default_factory=list)
    cardinality: Optional[MinMax] = None


class TraceEntry(_Strict):
    """One ``rules/traces/<type>.yml``. Fields that feed ``families.yml`` are
    ``data_shape``, ``encodings_that_scale``, ``limits``, ``transforms``,
    ``pairings`` and ``layout``; the rest is for the rendered skill."""

    type: str
    family: str
    status: Literal["preferred", "niche", "deprecated"] = "preferred"
    tier: Literal["core", "extended"]
    author: str
    review: Review = Field(default_factory=Review)
    confidence: Optional[float] = Field(default=None, ge=0, le=1)
    one_liner: str
    use_when: List[str] = Field(max_length=4)
    avoid_when: List[str] = Field(max_length=4)
    data_shape: DataShape
    required_props: List[str] = Field(default_factory=list)
    minimal_yaml: str
    encodings_that_scale: List[str] = Field(default_factory=list)
    limits: Limits = Field(default_factory=Limits)
    transforms: List[str] = Field(default_factory=list)
    visivo_gotchas: List[str] = Field(default_factory=list, max_length=5)
    pairings: List[str] = Field(default_factory=list)
    layout: LayoutHint = Field(default_factory=LayoutHint)
    mobile: Optional[str] = None

    @model_validator(mode="after")
    def _review_markers(self):
        if self.type not in KNOWN_TYPES:
            raise ValueError(f"'{self.type}' is not a Plotly trace type or a table type")
        if self.tier == "extended" and self.confidence is None:
            raise ValueError("an extended-tier entry must state its confidence")
        if len(self.minimal_yaml.strip().splitlines()) > 15:
            raise ValueError("minimal_yaml must be 15 lines or fewer")
        return self


class LayoutRule(_Strict):
    """One row of ``layout.yml``: how a row role is sized and bounded."""

    row_role: RowRole
    height: Union[str, int] = "medium"
    max_per_row: int = Field(default=4, ge=1)
    width_shares: List[float] = Field(default_factory=list)
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _shares_sum_to_one(self):
        if self.width_shares and abs(sum(self.width_shares) - 1.0) > 1e-6:
            raise ValueError("width_shares must sum to 1")
        return self


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
