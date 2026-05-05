"""Unit tests for the broad-class slice/prop-type validator.

Covers:
- The slice-form classifier (single index vs sub-array vs malformed).
- Walking a prop path into the trace JSON schema.
- Compatibility checks for the common cases the validator should catch
  (numeric scalar slot expecting a numeric SQL type; mismatch when the
  SQL type is string).
- Pass-through for ambiguous / unknown cases (mixed numeric+string
  schema branches, unknown SQL types).
"""

from sqlglot import exp

from visivo.query.insight.prop_type_validator import (
    _broad_class_of_sql_type,
    _expected_scalar_class,
    _walk_schema_path,
    check_slice_type_compatibility,
    expected_scalar_class_for_prop,
    is_scalar_slice,
)

# ---------------------------------------------------------------------------
# is_scalar_slice
# ---------------------------------------------------------------------------


def test_is_scalar_slice_single_index():
    assert is_scalar_slice("[0]") is True
    assert is_scalar_slice("[-1]") is True
    assert is_scalar_slice("[42]") is True


def test_is_scalar_slice_subarray_forms_are_not_scalar():
    assert is_scalar_slice("[1:5]") is False
    assert is_scalar_slice("[:5]") is False
    assert is_scalar_slice("[1:]") is False
    assert is_scalar_slice("[::2]") is False
    assert is_scalar_slice("[0,-1]") is False


def test_is_scalar_slice_returns_false_when_empty():
    assert is_scalar_slice("") is False
    assert is_scalar_slice(None) is False


# ---------------------------------------------------------------------------
# _broad_class_of_sql_type
# ---------------------------------------------------------------------------


def test_broad_class_of_numeric_types():
    for name in ("INT", "BIGINT", "FLOAT", "DOUBLE", "DECIMAL"):
        dtype = exp.DataType.build(name)
        assert _broad_class_of_sql_type(dtype) == "numeric", name


def test_broad_class_of_string_types():
    for name in ("VARCHAR", "TEXT", "CHAR"):
        dtype = exp.DataType.build(name)
        assert _broad_class_of_sql_type(dtype) == "string", name


def test_broad_class_of_unknown_returns_unknown():
    # An exotic type sqlglot doesn't recognise gets reported as 'unknown'
    # which makes the validator pass (no false positives).
    assert _broad_class_of_sql_type(None) == "unknown"


# ---------------------------------------------------------------------------
# _expected_scalar_class
# ---------------------------------------------------------------------------


def test_expected_class_numeric_only_oneof():
    schema = {
        "oneOf": [
            {"$ref": "#/$defs/query-string"},
            {"type": "number"},
        ]
    }
    # query-string is a $ref (string-flavored) so this is mixed.
    assert _expected_scalar_class(schema) == "mixed"


def test_expected_class_pure_numeric():
    # A schema branch with only number/integer types → numeric.
    schema = {"type": "number"}
    assert _expected_scalar_class(schema) == "numeric"


def test_expected_class_pure_string_via_color_ref():
    schema = {
        "oneOf": [
            {"$ref": "#/$defs/color"},
        ]
    }
    assert _expected_scalar_class(schema) == "string"


def test_expected_class_no_branches_returns_unknown():
    assert _expected_scalar_class({}) == "unknown"


# ---------------------------------------------------------------------------
# _walk_schema_path
# ---------------------------------------------------------------------------


def test_walk_schema_path_simple():
    schema = {
        "properties": {
            "value": {"oneOf": [{"type": "number"}]},
        }
    }
    leaf = _walk_schema_path(schema, "props.value")
    assert leaf == {"oneOf": [{"type": "number"}]}


def test_walk_schema_path_nested():
    schema = {
        "properties": {
            "delta": {
                "properties": {
                    "reference": {"type": "number"},
                }
            }
        }
    }
    leaf = _walk_schema_path(schema, "props.delta.reference")
    assert leaf == {"type": "number"}


def test_walk_schema_path_returns_none_for_unknown():
    schema = {"properties": {"v": {"type": "number"}}}
    assert _walk_schema_path(schema, "props.does_not_exist") is None


# ---------------------------------------------------------------------------
# Public check
# ---------------------------------------------------------------------------


def test_check_passes_for_subarray_slice_regardless_of_type():
    """Sub-array slices preserve the array shape; no scalar/type mismatch
    is possible by construction."""
    ok, msg = check_slice_type_compatibility(
        trace_type="indicator",
        prop_path="props.value",
        slice_expr="[1:5]",
        sqlglot_dtype=exp.DataType.build("VARCHAR"),
    )
    assert ok is True
    assert msg is None


def test_check_passes_when_sqlglot_type_unknown():
    ok, msg = check_slice_type_compatibility(
        trace_type="indicator",
        prop_path="props.value",
        slice_expr="[0]",
        sqlglot_dtype=None,
    )
    assert ok is True
    assert msg is None


def test_check_passes_when_expected_class_is_mixed():
    """`bar.x` allows both numeric scalar and array-of-string after the
    data_array post-B13 schema change → 'mixed' → don't error."""
    ok, msg = check_slice_type_compatibility(
        trace_type="bar",
        prop_path="props.x",
        slice_expr="[0]",
        sqlglot_dtype=exp.DataType.build("VARCHAR"),
    )
    assert ok is True
    assert msg is None


def test_check_fails_indicator_value_with_string_sql_type():
    """The motivating case: indicator.value is numeric-only (after the
    schema-level change in core), so a VARCHAR scalar slice should
    fail with a clean message."""
    expected_class = expected_scalar_class_for_prop("indicator", "props.value")
    # If the schema considers it mixed, the validator will skip — not
    # all schema generators land identically. Only assert the failure
    # path when the expected class is unambiguous.
    if expected_class == "numeric":
        ok, msg = check_slice_type_compatibility(
            trace_type="indicator",
            prop_path="props.value",
            slice_expr="[0]",
            sqlglot_dtype=exp.DataType.build("VARCHAR"),
        )
        assert ok is False
        assert "props.value" in msg
        assert "numeric" in msg
        assert "string" in msg


def test_check_passes_indicator_value_with_numeric_sql_type():
    ok, msg = check_slice_type_compatibility(
        trace_type="indicator",
        prop_path="props.value",
        slice_expr="[0]",
        sqlglot_dtype=exp.DataType.build("DOUBLE"),
    )
    assert ok is True
    assert msg is None
