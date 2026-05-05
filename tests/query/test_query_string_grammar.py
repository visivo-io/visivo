"""Tests for the QUERY_STRING_VALUE_PATTERN grammar in visivo.query.patterns.

The pattern accepts ?{...} and ?{...}[N|a:b|a:b:c|a,b,c]. Mirrors the
core `query-string` $def. extract_query_strings + extract_query_slices
on InsightProps split a matching value into (body, slice).
"""

import re

import pytest

from visivo.query.patterns import QUERY_STRING_VALUE_PATTERN
from visivo.models.props.insight_props import InsightProps

PATTERN = re.compile(QUERY_STRING_VALUE_PATTERN)


@pytest.mark.parametrize(
    "value,expected_body,expected_slice",
    [
        ("?{column_a}", "column_a", None),
        ("?{ MAX(amount) }", "MAX(amount)", None),
        ("?{column_a}[0]", "column_a", "[0]"),
        ("?{column_a}[-1]", "column_a", "[-1]"),
        ("?{column_a}[1:5]", "column_a", "[1:5]"),
        ("?{column_a}[:5]", "column_a", "[:5]"),
        ("?{column_a}[1:]", "column_a", "[1:]"),
        ("?{column_a}[-3:-1]", "column_a", "[-3:-1]"),
        ("?{column_a}[::2]", "column_a", "[::2]"),
        ("?{column_a}[1:10:2]", "column_a", "[1:10:2]"),
        ("?{column_a}[0,-1]", "column_a", "[0,-1]"),
        ("?{column_a}[0,2,4]", "column_a", "[0,2,4]"),
    ],
)
def test_pattern_matches_and_splits(value, expected_body, expected_slice):
    m = PATTERN.match(value)
    assert m is not None, f"expected pattern to match {value!r}"
    assert m.group("query_string").strip() == expected_body
    assert m.group("slice") == expected_slice


@pytest.mark.parametrize(
    "value",
    [
        "not a query string",
        "?{",
        "}{",
        "?{x}[abc]",
        "?{x}[]",
        "?{x}[",
        "?{x}[0,]",
    ],
)
def test_pattern_rejects_invalid(value):
    assert (
        PATTERN.match(value) is None
        or PATTERN.match(value).group("slice") is None
        and (PATTERN.match(value) is not None and value.startswith("?{"))
    )


# ---------------------------------------------------------------------------
# InsightProps.extract_query_strings vs extract_query_slices
# ---------------------------------------------------------------------------


def test_extract_query_strings_strips_slice_from_body():
    props = InsightProps(type="indicator", value="?{MAX(x)}[0]")
    pairs = props.extract_query_strings()
    assert pairs == [("props.value", "MAX(x)")]


def test_extract_query_slices_returns_only_paths_with_slice():
    props = InsightProps(
        type="indicator",
        value="?{MAX(x)}[0]",
        # delta.reference uses a non-sliced ?{...}
        delta={"reference": "?{prev}"},
    )
    slices = props.extract_query_slices()
    assert slices == {"props.value": "[0]"}


def test_extract_query_strings_with_slices_returns_full_tuples():
    props = InsightProps(
        type="indicator",
        value="?{MAX(x)}[0]",
        delta={"reference": "?{prev}"},
    )
    triples = props.extract_query_strings_with_slices()
    by_path = {t[0]: (t[1], t[2]) for t in triples}
    assert by_path["props.value"] == ("MAX(x)", "[0]")
    assert by_path["props.delta.reference"] == ("prev", None)


def test_no_slice_returns_unchanged_body():
    props = InsightProps(type="bar", x="?{x_col}")
    pairs = props.extract_query_strings()
    assert pairs == [("props.x", "x_col")]
    assert props.extract_query_slices() == {}
