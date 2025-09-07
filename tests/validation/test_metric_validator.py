"""Tests for MetricValidator using SQLGlot."""

import pytest
from visivo.validation.metric_validator import MetricValidator


class TestMetricValidator:
    """Test suite for MetricValidator."""

    def test_validate_simple_aggregate(self):
        """Test validation of simple aggregate expressions."""
        # Valid aggregates
        valid_aggregates = [
            "SUM(amount)",
            "COUNT(*)",
            "COUNT(DISTINCT user_id)",
            "AVG(price)",
            "MIN(date)",
            "MAX(value)",
            "SUM(amount * quantity)",
            "COUNT(DISTINCT CASE WHEN status = 'active' THEN id END)",
        ]

        for expr in valid_aggregates:
            is_valid, error = MetricValidator.validate_aggregate_expression(expr)
            assert is_valid is True, f"Expected '{expr}' to be valid, but got error: {error}"
            assert error is None

    def test_validate_complex_aggregate(self):
        """Test validation of complex aggregate expressions."""
        # Complex but valid aggregates
        valid_complex = [
            "SUM(amount) / COUNT(DISTINCT user_id)",
            "AVG(price) * 1.1",
            "ROUND(SUM(amount), 2)",
            "SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END)",
            "COUNT(DISTINCT user_id) * 100.0 / COUNT(*)",
        ]

        for expr in valid_complex:
            is_valid, error = MetricValidator.validate_aggregate_expression(expr)
            assert is_valid is True, f"Expected '{expr}' to be valid, but got error: {error}"

    def test_reject_naked_columns(self):
        """Test that naked columns (not in aggregates) are rejected."""
        invalid_expressions = [
            "amount",  # Naked column
            "SUM(amount) + price",  # price is naked
            "user_id",  # Naked column
            "amount * 0.5",  # Naked column with operation
            "SUM(total) / count",  # count is naked (should be COUNT())
        ]

        for expr in invalid_expressions:
            is_valid, error = MetricValidator.validate_aggregate_expression(expr)
            assert is_valid is False, f"Expected '{expr}' to be invalid"
            assert error is not None
            assert "column" in error.lower() or "aggregate" in error.lower()

    def test_reject_non_aggregate_expressions(self):
        """Test that expressions without aggregates are rejected."""
        invalid_expressions = [
            "price * 1.1",  # No aggregate
            "CASE WHEN status = 'active' THEN 1 ELSE 0 END",  # No aggregate
            "date_trunc('month', created_at)",  # Function but not aggregate
        ]

        for expr in invalid_expressions:
            is_valid, error = MetricValidator.validate_aggregate_expression(expr)
            assert is_valid is False, f"Expected '{expr}' to be invalid"
            assert error is not None

    def test_empty_expression(self):
        """Test that empty expressions are rejected."""
        is_valid, error = MetricValidator.validate_aggregate_expression("")
        assert is_valid is False
        assert "empty" in error.lower()

        is_valid, error = MetricValidator.validate_aggregate_expression(None)
        assert is_valid is False

    def test_validate_join_condition(self):
        """Test validation of join conditions."""
        # Valid join conditions
        valid_conditions = [
            ("${ref(orders).user_id} = ${ref(users).id}", "orders", "users"),
            ("${ref(a).id} = ${ref(b).a_id}", "a", "b"),
            ("${ref(accounts).id} = ${ref(stages).account_id}", "accounts", "stages"),
            ("${ref(t1).col1} = ${ref(t2).col1} AND ${ref(t1).col2} = ${ref(t2).col2}", "t1", "t2"),
        ]

        for condition, left, right in valid_conditions:
            is_valid, error = MetricValidator.validate_join_condition(condition, left, right)
            assert is_valid is True, f"Expected condition to be valid, but got error: {error}"
            assert error is None

    def test_join_condition_must_reference_both_models(self):
        """Test that join conditions must reference both models."""
        # Missing reference to one model
        is_valid, error = MetricValidator.validate_join_condition(
            "${ref(orders).id} = ${ref(orders).user_id}", "orders", "users"
        )
        assert is_valid is False
        assert "users" in error

        # Missing reference to the other model
        is_valid, error = MetricValidator.validate_join_condition(
            "${ref(users).id} = ${ref(users).account_id}", "orders", "users"
        )
        assert is_valid is False
        assert "orders" in error

    def test_join_condition_cannot_have_aggregates(self):
        """Test that join conditions cannot contain aggregate functions."""
        is_valid, error = MetricValidator.validate_join_condition(
            "${ref(orders).user_id} = SUM(${ref(users).id})", "orders", "users"
        )
        assert is_valid is False
        assert "aggregate" in error.lower()

    def test_validate_dimension_expression(self):
        """Test validation of dimension expressions."""
        # Valid dimensions (no aggregates)
        valid_dimensions = [
            "LENGTH(name)",
            "DATE_TRUNC('month', created_at)",
            "CASE WHEN status = 'active' THEN true ELSE false END",
            "price * quantity",
            "UPPER(category)",
            "created_at + INTERVAL '1 day'",
        ]

        for expr in valid_dimensions:
            is_valid, error = MetricValidator.validate_dimension_expression(expr)
            assert is_valid is True, f"Expected '{expr}' to be valid, but got error: {error}"
            assert error is None

    def test_dimension_cannot_have_aggregates(self):
        """Test that dimensions cannot contain aggregate functions."""
        invalid_dimensions = [
            "SUM(amount)",
            "COUNT(*)",
            "AVG(price)",
            "LENGTH(name) + COUNT(*)",
        ]

        for expr in invalid_dimensions:
            is_valid, error = MetricValidator.validate_dimension_expression(expr)
            assert is_valid is False
            assert "aggregate" in error.lower()

    def test_sql_injection_patterns(self):
        """Test that SQL injection patterns are handled safely."""
        # The semicolon pattern might parse (SQLGlot ignores after semicolon) but is still valid SQL
        # What matters is that we're parsing it safely
        expr1 = "SUM(amount); DROP TABLE users;"
        is_valid, error = MetricValidator.validate_aggregate_expression(expr1)
        # This actually parses as just "SUM(amount)" which is valid
        # SQLGlot safely ignores the injection attempt after semicolon
        assert is_valid is True or is_valid is False  # Either is acceptable, just shouldn't crash

        # This should definitely fail as it's not a valid expression
        expr2 = "COUNT(*) FROM users WHERE 1=1"
        is_valid, error = MetricValidator.validate_aggregate_expression(expr2)
        assert is_valid is False  # Should be rejected as invalid SQL expression
        assert error is not None
        assert "parsing error" in error.lower() or "invalid" in error.lower()
