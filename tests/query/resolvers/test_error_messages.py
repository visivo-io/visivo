"""Tests for column-not-found error formatting (smoke-test bug #10)."""

from visivo.query.resolvers.error_messages import format_column_not_found_error


def test_empty_schema_points_at_the_real_cause_not_a_missing_column():
    # A model that resolved NO columns (e.g. its sql references a nonexistent
    # table) must not be reported as a plain "column not found ... (no columns
    # available)" — it should name the likely cause.
    msg = format_column_not_found_error("sex", "lifts", {})
    assert "resolved no columns at all" in msg
    assert "table that does not exist" in msg
    assert "has not been run yet" in msg
    # The old, misleading "(no columns available)" table is NOT shown.
    assert "no columns available" not in msg


def test_non_empty_schema_lists_available_columns():
    msg = format_column_not_found_error("sx", "lifts", {"sex": "VARCHAR", "total": "DOUBLE"})
    assert "Column 'sx' not found on model 'lifts'" in msg
    assert "Available columns:" in msg
    assert "sex" in msg and "total" in msg
    # The empty-schema hint must NOT fire when columns exist.
    assert "resolved no columns at all" not in msg


def test_quoted_case_still_notes_exact_case_when_columns_exist():
    msg = format_column_not_found_error("Sex", "lifts", {"sex": "VARCHAR"}, is_quoted=True)
    assert "Exact case match required" in msg
    assert "Available columns:" in msg
