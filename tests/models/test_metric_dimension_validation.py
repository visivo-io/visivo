"""
Tests for SQL identifier validation in Metric and Dimension models.
"""

import pytest
from pydantic import ValidationError
from visivo.models.metric import Metric
from visivo.models.dimension import Dimension


class TestMetricNameValidation:
    """Test that metric names are validated as SQL identifiers."""

    def test_valid_metric_names(self):
        """Test that valid SQL identifiers are accepted."""
        # Simple valid names
        valid_names = [
            "total_revenue",
            "user_count",
            "avg_order_value",
            "revenue2024",
            "_private_metric",
            "UPPERCASE_METRIC",
            "mixedCase123",
        ]

        for name in valid_names:
            metric = Metric(name=name, expression="SUM(amount)")
            assert metric.name == name

    def test_invalid_metric_names(self):
        """Test that invalid SQL identifiers are rejected."""
        invalid_names = [
            "123_starts_with_number",  # Starts with number
            "metric;drop table",  # SQL injection attempt
            "metric'name",  # Single quote
            "metric--comment",  # SQL comment syntax
        ]

        for name in invalid_names:
            with pytest.raises(ValidationError):
                Metric(name=name, expression="SUM(amount)")

    def test_names_requiring_quotes(self):
        """Test names that would need quotes are rejected."""
        # These names are invalid as SQL identifiers without quotes
        names_needing_quotes = [
            "metric with spaces",
            "metric-with-hyphens",
            "metric.with.dots",
        ]

        for name in names_needing_quotes:
            with pytest.raises(ValidationError):
                Metric(name=name, expression="SUM(amount)")

    def test_none_name_allowed(self):
        """Test that None is allowed for name (anonymous metrics)."""
        metric = Metric(name=None, expression="SUM(amount)")
        assert metric.name is None


class TestDimensionNameValidation:
    """Test that dimension names are validated as SQL identifiers."""

    def test_valid_dimension_names(self):
        """Test that valid SQL identifiers are accepted."""
        valid_names = [
            "order_year",
            "customer_segment",
            "is_premium",
            "fiscal_quarter",
            "_internal_dim",
            "UPPER_CASE_DIM",
            "dim2024",
        ]

        for name in valid_names:
            dimension = Dimension(name=name, expression="strftime('%Y', date)")
            assert dimension.name == name

    def test_invalid_dimension_names(self):
        """Test that invalid SQL identifiers are rejected."""
        invalid_names = [
            "456_invalid",  # Starts with number
            "dim;delete from",  # SQL injection attempt
            "dim'quote",  # Single quote in name
            "dim--comment",  # SQL comment syntax
        ]

        for name in invalid_names:
            with pytest.raises(ValidationError):
                Dimension(name=name, expression="strftime('%Y', date)")

    def test_names_with_spaces(self):
        """Test that names with spaces are rejected."""
        names_with_spaces = [
            "order year",
            "customer full name",
            "is high value",
            "dim-with-dash",
            "dim.with.dots",
        ]

        for name in names_with_spaces:
            with pytest.raises(ValidationError):
                Dimension(name=name, expression="CASE WHEN x > 100 THEN 1 ELSE 0 END")

    def test_none_name_allowed(self):
        """Test that None is allowed for name (anonymous dimensions)."""
        dimension = Dimension(name=None, expression="strftime('%Y', date)")
        assert dimension.name is None


class TestSQLKeywordHandling:
    """Test how SQL keywords are handled in names."""

    def test_reserved_keywords_accepted(self):
        """Test that SQL keywords are accepted as names (they're valid identifiers)."""
        # SQL keywords are actually valid identifiers in most databases
        keywords = ["SELECT", "FROM", "WHERE", "JOIN", "GROUP", "ORDER", "HAVING"]

        for keyword in keywords:
            # These should be accepted - they match the pattern [a-zA-Z_][a-zA-Z0-9_]*
            metric = Metric(name=keyword, expression="COUNT(*)")
            assert metric.name == keyword

            dimension = Dimension(name=keyword, expression="field + 1")
            assert dimension.name == keyword

    def test_keywords_with_underscore_accepted(self):
        """Test that keywords with underscores are accepted."""
        # These should be valid since they're not exact keywords
        names = ["SELECT_count", "FROM_date", "WHERE_clause", "user_GROUP"]

        for name in names:
            metric = Metric(name=name, expression="COUNT(*)")
            assert metric.name == name

            dimension = Dimension(name=name, expression="field + 1")
            assert dimension.name == name
