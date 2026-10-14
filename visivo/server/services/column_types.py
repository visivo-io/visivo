"""One classifier for DuckDB column types, shared by the profiler and the
shape-card roles, plus the JSON conversion both apply to DuckDB values."""

from sqlglot import exp

INTEGER, FLOAT, TEXT, BOOLEAN, TIME, OTHER = (
    "integer",
    "float",
    "text",
    "boolean",
    "time",
    "other",
)
NUMERIC_KINDS = (INTEGER, FLOAT)


def column_kind(col_type) -> str:
    """``integer`` | ``float`` | ``text`` | ``boolean`` | ``time`` | ``other``
    for a DuckDB type spelling such as ``DECIMAL(18,3)`` or ``TIMESTAMP WITH
    TIME ZONE``."""
    try:
        built = exp.DataType.build(str(col_type or ""), dialect="duckdb").this
    except Exception:
        return OTHER
    if built in exp.DataType.INTEGER_TYPES:
        return INTEGER
    if built in exp.DataType.REAL_TYPES:
        return FLOAT
    if built in exp.DataType.TEXT_TYPES:
        return TEXT
    if built == exp.DataType.Type.BOOLEAN:
        return BOOLEAN
    if built in exp.DataType.TEMPORAL_TYPES:
        return TIME
    return OTHER


def is_numeric(col_type) -> bool:
    return column_kind(col_type) in NUMERIC_KINDS


def json_value(value):
    """A DuckDB value as something ``json.dumps`` accepts: NaN to ``None``,
    dates to ISO strings, decimals to floats, anything else to its string."""
    if value is None or isinstance(value, (bool, int, str, list, dict)):
        return value
    if isinstance(value, float):
        return None if value != value else value
    if hasattr(value, "isoformat"):
        return value.isoformat()
    try:
        return float(value)
    except (TypeError, ValueError):
        return str(value)
