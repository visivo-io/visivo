"""From a column profile to a ``ShapeCard`` (VIS-1412).

A profile says what a column *contains*; a shape card says what it *is for*:
a time axis, a category to split by, a measure to aggregate, an identifier to
look up. Pure functions over the unified profile shape, so the Explorer and
the agent classify a column the same way because they call the same code.
"""

from visivo.agent.charting.schema import ShapeCard
from visivo.server.services.geo_lists import geo_kind_for

TIME_TYPES = ("DATE", "TIMESTAMP", "TIME", "DATETIME")
INTEGER_TYPES = (
    "INT",
    "BIGINT",
    "SMALLINT",
    "TINYINT",
    "HUGEINT",
    "UBIGINT",
    "UINTEGER",
    "USMALLINT",
    "UTINYINT",
)
FLOAT_TYPES = ("DOUBLE", "FLOAT", "REAL", "DECIMAL", "NUMERIC")
BOOLEAN_TYPES = ("BOOL",)

# Below this many distinct integer values a count is a category to compare
# across, not a quantity to bin: hour of day, passenger count, star rating.
DISCRETE_MAX_DISTINCT = 30
# A text column with more distinct values than this is prose or an identifier.
CATEGORICAL_MAX_DISTINCT = 1000
# Average length above which a text column is free text rather than a label.
LABEL_MAX_AVG_LENGTH = 40
# Distinct / non-null ratio at or above which a column identifies its row.
IDENTIFIER_MIN_RATIO = 0.95
IDENTIFIER_MIN_ROWS = 20
TOP_N_ROLES = ("categorical", "boolean", "numeric_discrete", "geo_region")

ID_NAME_HINTS = ("id", "uuid", "guid", "key", "code", "number", "num", "no")
LAT_HINTS = ("lat", "latitude")
LON_HINTS = ("lon", "lng", "long", "longitude")
ADDITIVE_HINTS = (
    "amount",
    "total",
    "revenue",
    "sales",
    "fare",
    "tip",
    "tips",
    "distance",
    "duration",
    "qty",
    "quantity",
    "count",
    "cost",
    "spend",
    "volume",
    "units",
    "sum",
)
NON_ADDITIVE_HINTS = (
    "rate",
    "ratio",
    "pct",
    "percent",
    "percentage",
    "avg",
    "average",
    "mean",
    "score",
    "price",
    "temperature",
    "temp",
    "age",
    "index",
    "lat",
    "latitude",
    "lon",
    "lng",
    "longitude",
)

SECOND = 1.0
GRAINS = (
    ("second", SECOND),
    ("minute", 60 * SECOND),
    ("hour", 3600 * SECOND),
    ("day", 86400 * SECOND),
    ("week", 7 * 86400 * SECOND),
    ("month", 30 * 86400 * SECOND),
    ("quarter", 91 * 86400 * SECOND),
    ("year", 365 * 86400 * SECOND),
)


def _upper(value):
    return str(value or "").upper()


def _is_time(col_type):
    return any(t in _upper(col_type) for t in TIME_TYPES)


def _is_integer(col_type):
    upper = _upper(col_type)
    return any(upper.startswith(t) or upper == t for t in INTEGER_TYPES)


def _is_float(col_type):
    upper = _upper(col_type)
    return any(upper.startswith(t) for t in FLOAT_TYPES)


def _is_boolean(col_type):
    return _upper(col_type).startswith(BOOLEAN_TYPES)


def _name_tokens(name):
    return [t for t in str(name).lower().replace("-", "_").split("_") if t]


def _has_hint(name, hints):
    tokens = _name_tokens(name)
    return any(t in hints for t in tokens)


def _ratio(numerator, denominator):
    return (numerator / denominator) if denominator else 0.0


def _looks_like_identifier(name, col_type, distinct, non_null):
    if non_null < IDENTIFIER_MIN_ROWS:
        return False
    if _ratio(distinct, non_null) < IDENTIFIER_MIN_RATIO:
        return False
    if _is_float(col_type):
        # A measured quantity is unique per row too; only a name says id.
        return _has_hint(name, ID_NAME_HINTS)
    return True


def _parse_moment(value):
    """Seconds since the epoch for a date/datetime/ISO string, else ``None``."""
    from datetime import date, datetime

    if value is None:
        return None
    if isinstance(value, datetime):
        return value.timestamp()
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day).timestamp()
    try:
        return datetime.fromisoformat(str(value)).timestamp()
    except ValueError:
        return None


def time_grain_for(col_min, col_max, distinct):
    """The grain at which ``distinct`` points evenly fill the span."""
    start, end = _parse_moment(col_min), _parse_moment(col_max)
    if start is None or end is None or distinct is None or distinct < 2:
        return None
    step = (end - start) / (distinct - 1)
    if step <= 0:
        return None
    best = GRAINS[0][0]
    for name, seconds in GRAINS:
        if step >= seconds * 0.75:
            best = name
    return best


def _additive(name, role):
    if role not in ("numeric_continuous", "numeric_discrete"):
        return None
    if _has_hint(name, NON_ADDITIVE_HINTS):
        return False
    if _has_hint(name, ADDITIVE_HINTS):
        return True
    return None


def _role(name, column, distinct, non_null, top_values):
    col_type = column.get("type")
    if _is_boolean(col_type):
        return "boolean", None
    if _is_time(col_type):
        return "time", None
    if _is_integer(col_type) or _is_float(col_type):
        tokens = _name_tokens(name)
        if any(t in LAT_HINTS or t in LON_HINTS for t in tokens):
            return "geo_point", "latlon"
        if _looks_like_identifier(name, col_type, distinct, non_null):
            return "identifier", None
        if _is_integer(col_type) and distinct <= DISCRETE_MAX_DISTINCT:
            return "numeric_discrete", None
        if _is_float(col_type) and distinct <= 10:
            return "numeric_discrete", None
        return "numeric_continuous", None
    # Text and everything else.
    avg_length = column.get("avg_length")
    prose = avg_length is not None and avg_length > LABEL_MAX_AVG_LENGTH
    if not prose and _looks_like_identifier(name, col_type, distinct, non_null):
        return "identifier", None
    geo = geo_kind_for([tv["value"] for tv in top_values]) if top_values else None
    if geo:
        return "geo_region", geo
    if prose or distinct > CATEGORICAL_MAX_DISTINCT:
        return "text", None
    return "categorical", None


def _skew(mean, median, stddev):
    if mean is None or median is None or not stddev:
        return None
    return 3 * (mean - median) / stddev


def shape_card(column, row_count, sampled=False):
    """One column of a unified profile as a ``ShapeCard``.

    ``column`` is one entry of ``profile["columns"]``: ``name, type,
    null_count, null_percentage, distinct, min, max, avg, median, std_dev,
    q25, q75, p99, zeros_pct, avg_length, top_values``. Missing stats are
    tolerated; the card is as good as the profile.
    """
    name = column["name"]
    distinct = int(column.get("distinct") or 0)
    null_count = int(column.get("null_count") or 0)
    non_null = max(int(row_count or 0) - null_count, 0)
    top_values = column.get("top_values") or []
    role, geo_kind = _role(name, column, distinct, non_null, top_values)

    numeric = role in ("numeric_continuous", "numeric_discrete", "identifier", "geo_point")
    stats = None
    if column.get("min") is not None or column.get("max") is not None:
        stats = {
            "min": column.get("min"),
            "max": column.get("max"),
            "mean": column.get("avg") if numeric else None,
            "median": column.get("median") if numeric else None,
            "stddev": column.get("std_dev") if numeric else None,
            "skew": (
                _skew(column.get("avg"), column.get("median"), column.get("std_dev"))
                if numeric
                else None
            ),
            "p99": column.get("p99") if numeric else None,
            "zeros_pct": column.get("zeros_pct") if numeric else None,
        }
        stats = {k: _jsonable(v) for k, v in stats.items()}

    # Top values describe a column you split or filter by; for a measure, an
    # identifier or prose they are twenty arbitrary rows.
    top_n = (
        [
            {"value": tv["value"], "share": round(_ratio(tv["count"], non_null), 4)}
            for tv in top_values
        ]
        if role in TOP_N_ROLES
        else []
    )

    time_grain = (
        time_grain_for(column.get("min"), column.get("max"), distinct) if role == "time" else None
    )

    return ShapeCard(
        column=name,
        role=role,
        cardinality=distinct,
        null_pct=round(_ratio(null_count, row_count), 4) if row_count else 0.0,
        time_grain=time_grain,
        time_span_points=distinct if role == "time" else None,
        geo_kind=geo_kind,
        additive=_additive(name, role),
        top_n=top_n,
        stats=stats,
    )


def shape_cards(profile):
    """Every column of a unified profile as cards, in profile order."""
    row_count = profile.get("row_count") or 0
    return [shape_card(c, row_count, profile.get("sampled", False)) for c in profile["columns"]]


def _jsonable(value):
    if value is None or isinstance(value, (int, float, str)):
        return value
    if hasattr(value, "isoformat"):
        return value.isoformat()
    try:
        return float(value)
    except (TypeError, ValueError):
        return str(value)
