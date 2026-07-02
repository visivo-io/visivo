"""Tests for the shared schema path-segment validator (finding #2)."""

import pytest

from visivo.server.views.schema_path_safety import is_safe_path_segment


@pytest.mark.parametrize(
    "value",
    [
        "main",
        "orders",
        "preview-abc-123",
        "preview-3f2a_9",
        "model.name",
        "A_B-c.d",
    ],
)
def test_accepts_simple_identifiers(value):
    assert is_safe_path_segment(value) is True


@pytest.mark.parametrize(
    "value",
    [
        "..",
        "../etc",
        "../../etc/passwd",
        "a/b",
        "a\\b",
        "foo..bar",
        "",
        None,
        42,
        "has space",
        "semi;colon",
    ],
)
def test_rejects_traversal_and_non_identifiers(value):
    assert is_safe_path_segment(value) is False
