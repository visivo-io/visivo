"""
Tests for visivo.query.sqlglot_utils module.

This module tests SQL utility functions including:
- identify_column_references: Column qualification with sort order preservation
- classify_statement: SQL statement classification (aggregate, vanilla, window)
- strip_sort_order: ASC/DESC removal from expressions
- Other SQL parsing utilities
"""

import pytest
from visivo.query.sqlglot_utils import (
    identify_column_references,
    classify_statement,
    strip_sort_order,
    parse_expression,
    has_aggregate_function,
    has_window_function,
)


class TestIdentifyColumnReferences:
    """Tests for the identify_column_references function."""

    def test_simple_column_qualification(self):
        """Test qualifying a simple column reference."""
        model_hash = "model_abc"
        model_schema = {model_hash: {"amount": "INT", "date": "DATE"}}

        result = identify_column_references(
            model_hash=model_hash,
            model_schema=model_schema,
            expr_sql="amount",
            dialect="duckdb",
        )

        assert '"model_abc"."amount"' in result
        assert "ASC" not in result
        assert "DESC" not in result

    def test_expression_with_function(self):
        """Test qualifying an expression with aggregate function."""
        model_hash = "model_abc"
        model_schema = {model_hash: {"amount": "INT"}}

        result = identify_column_references(
            model_hash=model_hash,
            model_schema=model_schema,
            expr_sql="SUM(amount)",
            dialect="duckdb",
        )

        assert "SUM" in result.upper()
        assert '"model_abc"."amount"' in result

    def test_expression_with_desc(self):
        """Test that DESC sort order is preserved."""
        model_hash = "model_abc"
        model_schema = {model_hash: {"amount": "INT", "date": "DATE"}}

        result = identify_column_references(
            model_hash=model_hash,
            model_schema=model_schema,
            expr_sql="amount DESC",
            dialect="duckdb",
        )

        assert "DESC" in result
        assert '"model_abc"."amount"' in result
        # Should NOT be treated as an alias
        assert "AS" not in result or '"DESC"' not in result

    def test_expression_with_asc(self):
        """Test that ASC sort order is preserved."""
        model_hash = "model_abc"
        model_schema = {model_hash: {"date": "DATE"}}

        result = identify_column_references(
            model_hash=model_hash,
            model_schema=model_schema,
            expr_sql="date ASC",
            dialect="duckdb",
        )

        assert "ASC" in result
        assert '"model_abc"."date"' in result
        # Should NOT be treated as an alias
        assert "AS" not in result or '"ASC"' not in result

    def test_aggregate_expression_with_desc(self):
        """Test that DESC is preserved with aggregate expressions."""
        model_hash = "model_abc"
        model_schema = {model_hash: {"amount": "DECIMAL"}}

        result = identify_column_references(
            model_hash=model_hash,
            model_schema=model_schema,
            expr_sql="SUM(amount) DESC",
            dialect="duckdb",
        )

        assert "SUM" in result.upper()
        assert "DESC" in result
        assert '"model_abc"."amount"' in result

    def test_multiple_columns_no_ordering(self):
        """Test expression with multiple columns without ordering."""
        model_hash = "model_abc"
        model_schema = {model_hash: {"price": "DECIMAL", "quantity": "INT"}}

        result = identify_column_references(
            model_hash=model_hash,
            model_schema=model_schema,
            expr_sql="price * quantity",
            dialect="duckdb",
        )

        assert '"model_abc"."price"' in result
        assert '"model_abc"."quantity"' in result
        assert "ASC" not in result
        assert "DESC" not in result

    def test_case_expression_without_ordering(self):
        """Test CASE expression without sort order."""
        model_hash = "model_abc"
        model_schema = {model_hash: {"status": "VARCHAR", "amount": "DECIMAL"}}

        result = identify_column_references(
            model_hash=model_hash,
            model_schema=model_schema,
            expr_sql="CASE WHEN status = 'active' THEN amount ELSE 0 END",
            dialect="duckdb",
        )

        assert "CASE" in result.upper()
        assert '"model_abc"."status"' in result
        assert '"model_abc"."amount"' in result


class TestClassifyStatement:
    """Tests for the classify_statement function."""

    def test_classify_vanilla_statement(self):
        """Test classifying a simple SELECT statement."""
        result = classify_statement("column_name", dialect="duckdb")
        assert result == "vanilla"

    def test_classify_aggregate_statement(self):
        """Test classifying an aggregate statement."""
        result = classify_statement("SUM(amount)", dialect="duckdb")
        assert result == "aggregate"

    def test_classify_window_statement(self):
        """Test classifying a window function statement."""
        result = classify_statement(
            "ROW_NUMBER() OVER (PARTITION BY category ORDER BY amount)", dialect="duckdb"
        )
        assert result == "window"

    def test_classify_count_aggregate(self):
        """Test classifying COUNT as aggregate."""
        result = classify_statement("COUNT(*)", dialect="duckdb")
        assert result == "aggregate"

    def test_classify_avg_aggregate(self):
        """Test classifying AVG as aggregate."""
        result = classify_statement("AVG(price)", dialect="duckdb")
        assert result == "aggregate"


class TestStripSortOrder:
    """Tests for the strip_sort_order function."""

    def test_strip_desc(self):
        """Test stripping DESC from expression."""
        result = strip_sort_order("column_name DESC", dialect="duckdb")
        assert "DESC" not in result
        assert "column_name" in result

    def test_strip_asc(self):
        """Test stripping ASC from expression."""
        result = strip_sort_order("column_name ASC", dialect="duckdb")
        assert "ASC" not in result
        assert "column_name" in result

    def test_strip_no_ordering(self):
        """Test expression without ordering passes through unchanged."""
        result = strip_sort_order("column_name", dialect="duckdb")
        assert result == "column_name"

    def test_strip_from_aggregate(self):
        """Test stripping ordering from aggregate expression."""
        result = strip_sort_order("SUM(amount) DESC", dialect="duckdb")
        assert "DESC" not in result
        assert "SUM" in result.upper()
        assert "amount" in result


class TestParseExpression:
    """Tests for the parse_expression function."""

    def test_parse_simple_column(self):
        """Test parsing a simple column reference."""
        result = parse_expression("column_name", dialect="duckdb")
        assert result is not None

    def test_parse_aggregate_function(self):
        """Test parsing an aggregate function."""
        result = parse_expression("SUM(amount)", dialect="duckdb")
        assert result is not None
        assert has_aggregate_function(result) is True

    def test_parse_window_function(self):
        """Test parsing a window function."""
        result = parse_expression(
            "ROW_NUMBER() OVER (PARTITION BY category ORDER BY amount)", dialect="duckdb"
        )
        assert result is not None
        assert has_window_function(result) is True

    def test_parse_empty_string(self):
        """Test parsing empty string returns None."""
        result = parse_expression("", dialect="duckdb")
        assert result is None

    def test_parse_whitespace_only(self):
        """Test parsing whitespace only returns None."""
        result = parse_expression("   ", dialect="duckdb")
        assert result is None


class TestHasAggregateFunction:
    """Tests for the has_aggregate_function function."""

    def test_sum_is_aggregate(self):
        """Test SUM is detected as aggregate."""
        expr = parse_expression("SUM(amount)", dialect="duckdb")
        assert has_aggregate_function(expr) is True

    def test_count_is_aggregate(self):
        """Test COUNT is detected as aggregate."""
        expr = parse_expression("COUNT(*)", dialect="duckdb")
        assert has_aggregate_function(expr) is True

    def test_avg_is_aggregate(self):
        """Test AVG is detected as aggregate."""
        expr = parse_expression("AVG(price)", dialect="duckdb")
        assert has_aggregate_function(expr) is True

    def test_simple_column_not_aggregate(self):
        """Test simple column is not aggregate."""
        expr = parse_expression("column_name", dialect="duckdb")
        assert has_aggregate_function(expr) is False

    def test_arithmetic_not_aggregate(self):
        """Test arithmetic expression is not aggregate."""
        expr = parse_expression("price * quantity", dialect="duckdb")
        assert has_aggregate_function(expr) is False


class TestHasWindowFunction:
    """Tests for the has_window_function function."""

    def test_row_number_is_window(self):
        """Test ROW_NUMBER is detected as window function."""
        expr = parse_expression("ROW_NUMBER() OVER (ORDER BY amount)", dialect="duckdb")
        assert has_window_function(expr) is True

    def test_rank_is_window(self):
        """Test RANK is detected as window function."""
        expr = parse_expression(
            "RANK() OVER (PARTITION BY category ORDER BY amount)", dialect="duckdb"
        )
        assert has_window_function(expr) is True

    def test_sum_over_is_window(self):
        """Test SUM OVER is detected as window function."""
        expr = parse_expression("SUM(amount) OVER (PARTITION BY category)", dialect="duckdb")
        assert has_window_function(expr) is True

    def test_simple_aggregate_not_window(self):
        """Test simple aggregate without OVER is not window."""
        expr = parse_expression("SUM(amount)", dialect="duckdb")
        assert has_window_function(expr) is False

    def test_simple_column_not_window(self):
        """Test simple column is not window function."""
        expr = parse_expression("column_name", dialect="duckdb")
        assert has_window_function(expr) is False
