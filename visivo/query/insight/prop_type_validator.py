"""Compile-time type checks on the SQL a prop's ``?{...}`` resolves to.

Two independent checks live here:

1. **Sliced-scalar class check** (the original): when a user writes
   ``value: ?{MAX(x)}[0]`` on an indicator (which expects a numeric scalar)
   but the underlying column resolves to a string type, fail at compile
   time with a clean message rather than rendering a broken or empty value.

   Scope: BROAD type class only (numeric vs string). We deliberately do NOT
   validate value content (e.g. "is this a valid hex color?") because the
   prop schema doesn't expose the necessary granularity and Plotly will
   either parse or warn at render time. The check fires only when the
   authored value is a slice form ``?{expr}[N]`` (single index → scalar)
   *and* the prop's allowed primitive types in the trace JSON schema make
   the class evident.

2. **Positional-axis plottability gate** (WB9 / S5-14): a prop bound to a
   coordinate of the chart (``x``, ``y``, ``lat``, ``r``, ...) whose SQL
   resolves to a *record-shaped* type — a STRUCT, MAP, OBJECT, UNION or
   NESTED — cannot be drawn on an axis. Today that combination builds
   "successfully" and renders a blank chart: the worst failure mode there
   is, because the run reports SUCCESS. The gate turns it into a build
   error carrying a :class:`~visivo.models.diagnostic.Diagnostic`.

   The concrete production case is a doubled query string. ``?{?{site}}``
   leaves a residual ``?{...}`` in the resolved SQL, and
   ``sqlglot.parse_one("?{site}")`` silently parses that as a DuckDB
   STRUCT literal ``{'_0': site}``. Nothing downstream complains; the
   parquet column comes back as ``STRUCT(VARCHAR)`` and Plotly draws
   nothing.
"""

from __future__ import annotations

import json
import re
from importlib.resources import files
from typing import List, Optional, Tuple

import sqlglot
from sqlglot import exp

from visivo.models.diagnostic import (
    Diagnostic,
    DiagnosticObjectRef,
    DiagnosticPhase,
    DiagnosticSeverity,
)

# Minimum mapping from sqlglot DataType.this names to broad classes.
# Anything not in this set defaults to "unknown" (no validation fires).
_NUMERIC = {
    "TINYINT",
    "SMALLINT",
    "INT",
    "INTEGER",
    "BIGINT",
    "FLOAT",
    "DOUBLE",
    "DECIMAL",
    "NUMERIC",
    "REAL",
    "NUMBER",
}
_STRING = {
    "CHAR",
    "VARCHAR",
    "TEXT",
    "STRING",
    "NCHAR",
    "NVARCHAR",
    "JSON",
}
_BOOLEAN = {"BOOLEAN", "BOOL"}


def _broad_class_of_sql_type(sqlglot_dtype: Optional[exp.DataType]) -> str:
    """Return 'numeric' / 'string' / 'boolean' / 'unknown' for a sqlglot type."""
    if sqlglot_dtype is None:
        return "unknown"
    name = (
        sqlglot_dtype.this.value
        if hasattr(sqlglot_dtype.this, "value")
        else str(sqlglot_dtype.this)
    )
    if name in _NUMERIC:
        return "numeric"
    if name in _STRING:
        return "string"
    if name in _BOOLEAN:
        return "boolean"
    return "unknown"


_SLICE_PATTERN = re.compile(r"\[(?:-?\d+|-?\d*:-?\d*(?::-?\d+)?|-?\d+(?:\s*,\s*-?\d+)+)\]$")


def is_scalar_slice(slice_expr: str) -> bool:
    """Return True if ``slice_expr`` (e.g. ``"[0]"``, ``"[1:5]"``) yields a
    single value (``[N]``) rather than a sub-array."""
    if not slice_expr:
        return False
    inner = slice_expr.strip()[1:-1]
    if not inner:
        return False
    if ":" in inner or "," in inner:
        return False
    try:
        int(inner)
        return True
    except ValueError:
        return False


def _walk_schema_path(schema: dict, prop_path: str) -> Optional[dict]:
    """Walk a dotted prop path (e.g. ``"props.value"``,
    ``"props.marker.colorscale[0]"``) into the trace JSON schema and return
    the leaf node. Returns None if the path is unreachable.
    """
    parts = prop_path.split(".")
    if parts and parts[0] == "props":
        parts = parts[1:]
    node = schema
    for part in parts:
        # array index segment like "colorscale[0]" -> walk the property,
        # then descend into items.
        m = re.match(r"^([^\[]+)((?:\[\d+\])*)$", part)
        if not m:
            return None
        prop_name = m.group(1)
        if "properties" in node and prop_name in node["properties"]:
            node = node["properties"][prop_name]
        else:
            return None
        for _ in re.findall(r"\[\d+\]", m.group(2)):
            if "items" in node:
                node = node["items"]
            else:
                return None
    return node


def _expected_scalar_class(prop_schema: dict) -> str:
    """Inspect a prop's JSON-schema node and return what BROAD class is
    expected when binding a *scalar* value to it.

    Returns one of:
      'numeric'  - the prop's oneOf allows {"type": "number" / "integer"}
                   but no string-typed branch.
      'string'   - the prop's oneOf allows a string-typed branch (color,
                   colorscale, enum, raw string) but no numeric branch.
      'mixed'    - both numeric and string branches allowed (e.g.
                   data_array props with the post-B13 scalar broadcast).
                   We don't fail in 'mixed' cases.
      'unknown'  - we can't determine the expected class; treat as no-op.
    """
    if not isinstance(prop_schema, dict):
        return "unknown"

    branches = []
    if "oneOf" in prop_schema and isinstance(prop_schema["oneOf"], list):
        branches.extend(prop_schema["oneOf"])
    elif "anyOf" in prop_schema and isinstance(prop_schema["anyOf"], list):
        branches.extend(prop_schema["anyOf"])
    else:
        # Bare type (no union)
        branches.append(prop_schema)

    has_numeric = False
    has_string = False
    for branch in branches:
        if not isinstance(branch, dict):
            continue
        # Recurse one level into nested oneOf (the generator wraps arrayOk
        # in a oneOf-of-oneOf shape).
        sub_branches = branch["oneOf"] if isinstance(branch.get("oneOf"), list) else [branch]
        for sb in sub_branches:
            if not isinstance(sb, dict):
                continue
            t = sb.get("type")
            if t in ("number", "integer"):
                has_numeric = True
            elif t == "string":
                has_string = True
            ref = sb.get("$ref")
            if ref:
                # query-string is type:string; color/colorscale defs are
                # also string-flavored. Treat any $ref except numeric
                # types as string-class.
                has_string = True

    if has_numeric and has_string:
        return "mixed"
    if has_numeric:
        return "numeric"
    if has_string:
        return "string"
    return "unknown"


_TRACE_SCHEMA_CACHE: dict = {}


def _load_trace_schema(trace_type: str) -> Optional[dict]:
    if trace_type not in _TRACE_SCHEMA_CACHE:
        try:
            schema_path = files("visivo.schema").joinpath(f"{trace_type}.schema.json")
            with open(schema_path) as f:
                _TRACE_SCHEMA_CACHE[trace_type] = json.load(f)
        except (FileNotFoundError, OSError):
            _TRACE_SCHEMA_CACHE[trace_type] = None
    return _TRACE_SCHEMA_CACHE[trace_type]


def expected_scalar_class_for_prop(trace_type: str, prop_path: str) -> str:
    """Convenience: load the trace schema and walk to ``prop_path``."""
    schema = _load_trace_schema(trace_type)
    if schema is None:
        return "unknown"
    leaf = _walk_schema_path(schema, prop_path)
    if leaf is None:
        return "unknown"
    return _expected_scalar_class(leaf)


def check_slice_type_compatibility(
    trace_type: str,
    prop_path: str,
    slice_expr: str,
    sqlglot_dtype: Optional[exp.DataType],
) -> Tuple[bool, Optional[str]]:
    """Validate that a sliced ``?{expr}[N]`` resolves to a SQL type whose
    broad class matches the prop's expected scalar class.

    Returns ``(ok, error_message_or_None)``.

    Only fires when:
      * ``slice_expr`` is a single-index form (yields a scalar at runtime).
      * ``sqlglot_dtype`` was successfully inferred.
      * The prop's JSON schema expresses an unambiguous scalar class.
    Otherwise returns ``(True, None)`` (no validation).
    """
    if not is_scalar_slice(slice_expr):
        return True, None

    sql_class = _broad_class_of_sql_type(sqlglot_dtype)
    if sql_class == "unknown":
        return True, None

    expected = expected_scalar_class_for_prop(trace_type, prop_path)
    if expected in ("unknown", "mixed"):
        return True, None

    if expected == sql_class:
        return True, None

    # Boolean is permissive on either side for now (some sources don't
    # support real BOOLEAN; numeric 0/1 is common).
    if sql_class == "boolean" or expected == "boolean":
        return True, None

    return False, (
        f"Type mismatch on '{prop_path}': the slice expression expects a "
        f"{expected} scalar but the query column resolves to a {sql_class} "
        f"({sqlglot_dtype.sql() if sqlglot_dtype else 'unknown'} in SQL). "
        f"Either change the source column type or remove the slice suffix."
    )


# ---------------------------------------------------------------------------
# WB9 / S5-14: positional-axis plottability gate
# ---------------------------------------------------------------------------

# The props whose value IS a coordinate of the rendered chart — the ones a
# record-shaped value silently blanks. Derived by reading every trace schema
# in ``visivo/schema/*.schema.json`` and keeping the props that place a datum
# on an axis:
#
#   x, y, z            cartesian / 3-D (scatter, bar, box, heatmap, surface, ...)
#   lat, lon           geographic (scattergeo, scattermap*, densitymap*)
#   r, theta           polar (scatterpolar, barpolar, area)
#   a, b, c            ternary / carpet (scatterternary, scattercarpet, carpet)
#   real, imag         smith chart (scattersmith)
#   open, high, low, close   price axes (candlestick, ohlc)
#   values, labels     magnitude + category axes (pie, funnelarea, sunburst,
#                      treemap, icicle)
#   parents            the hierarchy edge that places a node (sunburst,
#                      treemap, icicle) — a record here blanks the chart the
#                      same way ``labels`` does
#
# Deliberately EXCLUDED, with reasons:
#   * ``ids`` — present on every trace type but it is a key for animation
#     frames / selection, not a coordinate. A weird value there does not
#     blank the plot.
#   * ``customdata``, ``text``, ``hovertext``, ``meta`` — Plotly explicitly
#     allows arbitrary nested values in these; rejecting a STRUCT there
#     would be a false positive.
#   * ``props.domain.x`` / ``props.error_x.array`` / ``props.marker.*`` —
#     leaves that happen to share a name with an axis. Matching is on the
#     EXACT top-level path ``props.<name>`` for exactly this reason.
#   * ``parcoords`` / ``parcats`` / ``splom`` ``dimensions[i].values`` and
#     ``sankey``'s ``node``/``link`` — genuinely positional but nested inside
#     array-of-object props with their own binding rules. Out of scope here
#     rather than guessed at.
#   * ``area``'s legacy ``t`` — a single-letter prop on a deprecated trace
#     type; too generic a name to claim on the strength of one schema.
POSITIONAL_AXIS_PROP_NAMES = frozenset(
    {
        "x",
        "y",
        "z",
        "lat",
        "lon",
        "r",
        "theta",
        "a",
        "b",
        "c",
        "real",
        "imag",
        "open",
        "high",
        "low",
        "close",
        "values",
        "labels",
        "parents",
    }
)


# Types a Plotly axis CAN render. Enumerated deliberately (the positive half
# of the classification) so that "did we just start rejecting something that
# used to work?" is answerable by reading one list. Everything here reaches
# the browser as a number, a string or a date after the parquet round-trip,
# and Plotly plots all three on an axis:
#   * numerics of every width/sign/precision, including the unsigned and
#     wide integer types ClickHouse/DuckDB emit;
#   * strings of every flavour (categorical axes), plus the string-backed
#     scalars (UUID, INET, IP*, ENUM*, MONEY, XML, JSON/JSONB/VARIANT/SUPER
#     — semi-structured columns arrive as JSON *text* and plot as categories);
#   * temporals (date/time axes) and INTERVAL;
#   * BOOLEAN, which plots as a two-value categorical axis.
#
# Names are sqlglot ``exp.DataType.Type`` MEMBERS (what ``annotate_types``
# puts in ``DataType.this``), not SQL spellings — so "INT" and not "INTEGER",
# "DOUBLE" and not "REAL". A test asserts every name here is a real member,
# so a typo cannot quietly become a dead entry.
PLOTTABLE_AXIS_TYPES = frozenset(
    {
        # --- numeric ---------------------------------------------------
        "TINYINT",
        "SMALLINT",
        "MEDIUMINT",
        "INT",
        "BIGINT",
        "INT128",
        "INT256",
        "UTINYINT",
        "USMALLINT",
        "UMEDIUMINT",
        "UINT",
        "UBIGINT",
        "UINT128",
        "UINT256",
        "FLOAT",
        "DOUBLE",
        "UDOUBLE",
        "DECIMAL",
        "UDECIMAL",
        "BIGDECIMAL",
        "DECIMAL32",
        "DECIMAL64",
        "DECIMAL128",
        "DECIMAL256",
        "MONEY",
        "SMALLMONEY",
        "SERIAL",
        "SMALLSERIAL",
        "BIGSERIAL",
        "YEAR",
        # --- string / string-backed scalars -----------------------------
        "CHAR",
        "NCHAR",
        "VARCHAR",
        "NVARCHAR",
        "BPCHAR",
        "TEXT",
        "TINYTEXT",
        "MEDIUMTEXT",
        "LONGTEXT",
        "FIXEDSTRING",
        "NAME",
        "ENUM",
        "ENUM8",
        "ENUM16",
        "LOWCARDINALITY",
        "UUID",
        "INET",
        "IPADDRESS",
        "IPPREFIX",
        "IPV4",
        "IPV6",
        "XML",
        "JSON",
        "JSONB",
        "VARIANT",
        "SUPER",
        # --- temporal ---------------------------------------------------
        "DATE",
        "DATE32",
        "DATETIME",
        "DATETIME2",
        "DATETIME64",
        "SMALLDATETIME",
        "TIME",
        "TIMETZ",
        "TIMESTAMP",
        "TIMESTAMPTZ",
        "TIMESTAMPNTZ",
        "TIMESTAMPLTZ",
        "TIMESTAMP_S",
        "TIMESTAMP_MS",
        "TIMESTAMP_NS",
        "INTERVAL",
        # --- boolean ----------------------------------------------------
        "BOOLEAN",
    }
)


# Types an axis CANNOT render: record-shaped values. After the parquet
# round-trip each row's value is an object/dict, and Plotly draws nothing for
# an axis of objects — the exact silent-blank failure WB9 exists to stop.
#
# This is sqlglot's own ``exp.DataType.STRUCT_TYPES`` (STRUCT / OBJECT /
# NESTED / UNION) plus MAP, spelled out here rather than imported so the
# rejected set is pinned by THIS file and cannot widen under us when sqlglot
# reclassifies a type.
#
# ARRAY and LIST are deliberately NOT here even though they are also nested:
# a positional prop carrying a scalar slice (``x: ?{...}[0]``) binds a SINGLE
# row's value to the prop, so an array-valued column becomes a perfectly
# plottable array of scalars. Rejecting arrays would be a real false positive.
NON_PLOTTABLE_AXIS_TYPES = frozenset({"STRUCT", "OBJECT", "NESTED", "UNION", "MAP"})


def axis_plottability(sqlglot_dtype: Optional[exp.DataType]) -> str:
    """Classify a resolved SQL type for use on a positional axis.

    Returns ``"plottable"``, ``"non_plottable"``, or ``"unknown"``.

    The classification is deliberately THREE-way, not a bare allowlist test.
    sqlglot knows ~120 type names and dialects keep adding more; a type in
    neither list is reported ``"unknown"`` and the gate does nothing. The
    cost of a missed silent-blank chart is one bad render; the cost of a
    false positive is a build that used to work now refusing to run, so the
    gate only ever fails on a type we are certain about.
    """
    if sqlglot_dtype is None:
        return "unknown"
    this = getattr(sqlglot_dtype, "this", None)
    name = this.value if hasattr(this, "value") else str(this)
    if name in NON_PLOTTABLE_AXIS_TYPES:
        return "non_plottable"
    if name in PLOTTABLE_AXIS_TYPES:
        return "plottable"
    return "unknown"


def is_positional_axis_prop(prop_path: str) -> bool:
    """True when ``prop_path`` is a TOP-LEVEL positional axis prop.

    Matches ``props.x`` but not ``props.domain.x``, ``props.error_x.array``
    or ``props.marker.color`` — see ``POSITIONAL_AXIS_PROP_NAMES`` for why
    the match is anchored to the top level.
    """
    if not prop_path:
        return False
    parts = prop_path.split(".")
    if len(parts) != 2 or parts[0] != "props":
        return False
    return parts[1] in POSITIONAL_AXIS_PROP_NAMES


def _column_names_in(sql: Optional[str], dialect: Optional[str] = None) -> List[str]:
    """Column identifiers referenced by ``sql``, in order, deduped.

    Parsed with SQLGlot (never a regex). Returns ``[]`` when the fragment
    does not parse — the caller then names the expression instead.
    """
    if not sql:
        return []
    try:
        parsed = sqlglot.parse_one(sql, dialect=dialect) if dialect else sqlglot.parse_one(sql)
    except Exception:
        return []
    if parsed is None:
        return []
    names: List[str] = []
    for column in parsed.find_all(exp.Column):
        name = column.name
        if name and name not in names:
            names.append(name)
    return names


def check_positional_axis_plottability(
    *,
    insight_name: str,
    prop_path: str,
    sqlglot_dtype: Optional[exp.DataType],
    resolved_sql: Optional[str] = None,
    dialect: Optional[str] = None,
) -> Optional[Diagnostic]:
    """Gate a positional-axis prop on the type its SQL resolves to.

    Returns ``None`` when the prop is fine (not positional, type unknown, or
    a type an axis can render) and a :class:`Diagnostic` describing the
    failure otherwise. Never raises — a caller inside a build should be able
    to trust it.
    """
    if not is_positional_axis_prop(prop_path):
        return None
    if axis_plottability(sqlglot_dtype) != "non_plottable":
        return None

    this = getattr(sqlglot_dtype, "this", None)
    type_name = this.value if hasattr(this, "value") else str(this)
    try:
        full_type = sqlglot_dtype.sql()
    except Exception:
        full_type = type_name

    columns = _column_names_in(resolved_sql, dialect)
    if columns:
        column_clause = f" built from column{'s' if len(columns) > 1 else ''} " + ", ".join(
            f"'{c}'" for c in columns
        )
    else:
        column_clause = ""

    message = (
        f"Insight '{insight_name}': positional axis prop '{prop_path}' resolves to a "
        f"{type_name}{column_clause}. A chart axis cannot plot a {type_name}, so this "
        f"insight would build successfully and then render an empty chart."
    )

    hint = f"Bind '{prop_path}' to a single scalar column or expression."
    if type_name == "STRUCT":
        hint += (
            " A STRUCT here is almost always a doubled query string — check the prop's "
            "value for a nested '?{?{ ... }}', which SQLGlot parses as a struct literal."
        )

    detail_lines = [f"Resolved SQL type: {full_type}"]
    if resolved_sql:
        detail_lines.append(f"Resolved expression: {resolved_sql}")

    return Diagnostic(
        id=f"compile:non_plottable_axis_type:{insight_name}:{prop_path}",
        severity=DiagnosticSeverity.ERROR,
        phase=DiagnosticPhase.COMPILE,
        code="non_plottable_axis_type",
        message=message,
        object=DiagnosticObjectRef(type="insight", name=insight_name),
        field=prop_path,
        detail="\n".join(detail_lines),
        hint=hint,
    )


class PositionalAxisTypeError(ValueError):
    """A positional-axis prop resolved to a type no axis can render.

    Subclasses ``ValueError`` so every existing ``except Exception`` /
    ``except ValueError`` build handler keeps behaving exactly as it does
    for the other compile-time prop failures, while carrying the structured
    :attr:`diagnostic` for callers that can render it (the same pattern
    ``JoinPathError`` uses for its structured join fields).
    """

    def __init__(self, diagnostic: Diagnostic):
        self.diagnostic = diagnostic
        message = diagnostic.message
        if diagnostic.hint:
            message = f"{message} {diagnostic.hint}"
        super().__init__(message)
