"""Tests for InsightProps schema validation behavior (B08).

Covers:
- visivo-internal metadata (`file_path`, `path`) is stripped before
  jsonschema validation, so it doesn't trigger spurious
  "Additional properties are not allowed" errors.
- The "additionalProperties" error message includes a sample of valid
  Plotly props so authors can spot typos.
"""

import pytest

from visivo.models.props.insight_props import InsightProps

# ---------------------------------------------------------------------------
# B08 part 1: file_path / path don't leak into validation
# ---------------------------------------------------------------------------


def test_file_path_does_not_break_validation():
    """The parser may attach file_path to props for diagnostic context;
    it must not cause schema validation to fail."""
    # Construct via dict to mimic parser behavior assigning extras.
    props = InsightProps(type="bar", file_path="some/path.visivo.yml")
    assert props.type.value == "bar"


def test_path_does_not_break_validation():
    props = InsightProps(type="scatter", path="dashboards/foo.visivo.yml")
    assert props.type.value == "scatter"


# ---------------------------------------------------------------------------
# B08 part 2: name (a Plotly-valid prop) actually validates
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("trace_type", ["bar", "scatter", "histogram"])
def test_name_prop_accepted(trace_type):
    """`name` is a valid Plotly property at root for these trace types.
    Setting it for legend labelling should not raise."""
    props = InsightProps(type=trace_type, name="User Completed")
    # Pydantic stores extras when extra='allow' on JsonSchemaBase
    assert props.model_dump().get("name") == "User Completed"


# ---------------------------------------------------------------------------
# B08 part 3: invalid prop produces a helpful error
# ---------------------------------------------------------------------------


def test_invalid_prop_message_lists_valid_props():
    with pytest.raises(ValueError) as exc:
        InsightProps(type="bar", garblegarble=42)
    msg = str(exc.value)
    # Either jsonschema_rs uses the modern phrase or the older one.
    assert "Additional properties" in msg or "additionalProperties" in msg
    # The message should include a list of valid property names.
    assert "Valid Plotly properties" in msg
    # Sanity-check: at least one well-known Plotly prop should appear in
    # the suggestion list.
    assert "name" in msg or "type" in msg


def test_valid_props_unchanged_no_error():
    """Sanity: a valid prop combination still validates cleanly."""
    props = InsightProps(type="bar", name="x", marker={"color": "red"})
    assert props.model_dump().get("name") == "x"
    assert props.model_dump().get("marker") == {"color": "red"}


# ---------------------------------------------------------------------------
# Integration: a realistic insight props block including file_path + extras
# ---------------------------------------------------------------------------


def test_realistic_props_with_file_path_and_user_extra():
    """Mirror the actual parser output: file_path is set, plus a valid
    user-supplied extra prop (`name`)."""
    props = InsightProps(
        type="bar",
        name="User Completed",
        file_path="dashboards/kpi.visivo.yml",
    )
    dumped = props.model_dump()
    assert dumped["type"] == "bar"
    assert dumped["name"] == "User Completed"
    # file_path is preserved on the model (parser may need it later)
    # even though it's stripped before schema validation.
    assert dumped.get("file_path") == "dashboards/kpi.visivo.yml"
