"""Lightweight type compatibility check for sliced ``?{...}`` query strings.

Goal: when a user writes ``value: ?{MAX(x)}[0]`` on an indicator (which
expects a numeric scalar) but the underlying column resolves to a string
type, fail at compile time with a clean message rather than rendering a
broken or empty value.

Scope: BROAD type class only (numeric vs string). We deliberately do NOT
validate value content (e.g. "is this a valid hex color?") because the
prop schema doesn't expose the necessary granularity and Plotly will
either parse or warn at render time. The check fires only when the
authored value is a slice form ``?{expr}[N]`` (single index → scalar)
*and* the prop's allowed primitive types in the trace JSON schema make
the class evident.
"""

from __future__ import annotations

import json
import re
from importlib.resources import files
from typing import Optional, Tuple

from sqlglot import exp

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
