"""
Tests for SQL identifier validation in Metric and Dimension models.
"""

import pytest
from pydantic import ValidationError
from visivo.models.metric import Metric
from visivo.models.dimension import Dimension


class TestMetricNameValidation:
    """Test that metric names are validated as SQL identifiers."""

    @pytest.mark.parametrize(
        "name",
        [
            "total_revenue",
            "user_count",
            "avg_order_value",
            "revenue2024",
            "_private_metric",
            "UPPERCASE_METRIC",
            "mixedCase123",
        ],
    )
    def test_valid_metric_names(self, name):
        """Test that valid SQL identifiers are accepted."""
        metric = Metric(name=name, expression="SUM(amount)")
        assert metric.name == name

    @pytest.mark.parametrize(
        "name",
        [
            "123_starts_with_number",  # Starts with number
            "metric;drop table",  # SQL injection attempt
            "metric'name",  # Single quote
            "metric--comment",  # SQL comment syntax
            "metric with spaces",  # Spaces not allowed
            "metric-with-hyphens",  # Hyphens not allowed
            "metric.with.dots",  # Dots not allowed
        ],
    )
    def test_invalid_metric_names(self, name):
        """Test that invalid SQL identifiers are rejected."""
        with pytest.raises(ValidationError):
            Metric(name=name, expression="SUM(amount)")

    def test_none_name_allowed(self):
        """Test that None is allowed for name (anonymous metrics)."""
        metric = Metric(name=None, expression="SUM(amount)")
        assert metric.name is None


class TestDimensionNameValidation:
    """Test that dimension names are validated as SQL identifiers."""

    @pytest.mark.parametrize(
        "name",
        [
            "order_year",
            "customer_segment",
            "is_premium",
            "fiscal_quarter",
            "_internal_dim",
            "UPPER_CASE_DIM",
            "dim2024",
        ],
    )
    def test_valid_dimension_names(self, name):
        """Test that valid SQL identifiers are accepted."""
        dimension = Dimension(name=name, expression="strftime('%Y', date)")
        assert dimension.name == name

    @pytest.mark.parametrize(
        "name",
        [
            "456_invalid",  # Starts with number
            "dim;delete from",  # SQL injection attempt
            "dim'quote",  # Single quote
            "dim--comment",  # SQL comment syntax
            "order year",  # Spaces not allowed
            "customer full name",  # Spaces not allowed
            "is high value",  # Spaces not allowed
            "dim-with-dash",  # Dashes not allowed
            "dim.with.dots",  # Dots not allowed
        ],
    )
    def test_invalid_dimension_names(self, name):
        """Test that invalid SQL identifiers are rejected."""
        with pytest.raises(ValidationError):
            Dimension(name=name, expression="strftime('%Y', date)")

    def test_none_name_allowed(self):
        """Test that None is allowed for name (anonymous dimensions)."""
        dimension = Dimension(name=None, expression="strftime('%Y', date)")
        assert dimension.name is None


class TestSQLKeywordHandling:
    """Test how SQL keywords are handled in names."""

    @pytest.mark.parametrize(
        "keyword", ["SELECT", "FROM", "WHERE", "JOIN", "GROUP", "ORDER", "HAVING"]
    )
    def test_reserved_keywords_accepted(self, keyword):
        """Test that SQL keywords are accepted as names (they're valid identifiers)."""
        # SQL keywords are actually valid identifiers in most databases
        metric = Metric(name=keyword, expression="COUNT(*)")
        assert metric.name == keyword

        dimension = Dimension(name=keyword, expression="field + 1")
        assert dimension.name == keyword

    @pytest.mark.parametrize(
        "name",
        [
            "SELECT_field",
            "FROM_table",
            "WHERE_clause",
            "JOIN_type",
        ],
    )
    def test_keywords_with_underscore_accepted(self, name):
        """Test that keywords with underscores are accepted."""
        metric = Metric(name=name, expression="COUNT(*)")
        assert metric.name == name


class TestEdgeCases:
    """Test edge cases for name validation."""

    @pytest.mark.parametrize(
        "name,expression",
        [
            ("_", "COUNT(*)"),  # Single underscore
            ("__", "SUM(amount)"),  # Double underscore
            ("_123", "AVG(value)"),  # Underscore followed by numbers
            ("a", "MAX(id)"),  # Single letter
            ("A", "MIN(date)"),  # Single uppercase letter
        ],
    )
    def test_unusual_but_valid_names(self, name, expression):
        """Test unusual but valid identifier names."""
        metric = Metric(name=name, expression=expression)
        assert metric.name == name

    @pytest.mark.parametrize(
        "name",
        [
            "",  # Empty string
            " ",  # Single space
            "\t",  # Tab character
            "\n",  # Newline
            "!@#$%",  # Special characters
        ],
    )
    def test_completely_invalid_names(self, name):
        """Test completely invalid names."""
        with pytest.raises(ValidationError):
            Metric(name=name, expression="COUNT(*)")
