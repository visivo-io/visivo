"""Test that resolved metrics are not added to GROUP BY clauses."""

import pytest
from unittest.mock import Mock, MagicMock
from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.models.trace import Trace
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.duckdb_source import DuckdbSource
from visivo.models.metric import Metric
from visivo.query.statement_classifier import StatementClassifier, StatementEnum


class TestMetricGroupBy:
    """Test that metrics resolved in traces don't end up in GROUP BY."""

    def test_metric_not_in_groupby(self):
        """Test that a resolved metric expression is not added to GROUP BY."""
        # Create a model with metrics
        model = SqlModel(
            name="test_model",
            sql="SELECT x, y FROM test_table",
            metrics=[
                Metric(name="y_stddev", expression="STDDEV_POP(y)"),
                Metric(name="y_var", expression="VAR_POP(y)"),
            ],
        )

        # Create a source
        source = DuckdbSource(name="test_source", type="duckdb", database=":memory:")

        # Create a trace that references the metric
        trace = Trace(
            name="test_trace",
            model="ref(test_model)",
            props={
                "type": "scatter",
                "x": "?{query(x)}",
                "y": "?{query(${ref(test_model).y_stddev})}",
            },
        )

        # Create the tokenizer
        tokenizer = TraceTokenizer(trace=trace, model=model, source=source)
        tokenized = tokenizer.tokenize()

        # Check that the metric expression was resolved
        assert "props.y" in tokenized.select_items
        assert "STDDEV_POP(y)" in tokenized.select_items["props.y"]

        # Check that the metric is NOT in groupby_statements
        if hasattr(tokenized, "groupby_statements"):
            # The resolved metric should not be in GROUP BY
            for statement in tokenized.groupby_statements:
                assert "STDDEV_POP" not in statement
                assert "VAR_POP" not in statement

    def test_vanilla_field_in_groupby(self):
        """Test that vanilla fields are correctly added to GROUP BY."""
        model = SqlModel(name="test_model", sql="SELECT x, y FROM test_table")

        source = DuckdbSource(name="test_source", type="duckdb", database=":memory:")

        # Create a trace with a vanilla field
        trace = Trace(
            name="test_trace",
            model="ref(test_model)",
            props={
                "type": "scatter",
                "x": "?{query(x)}",
                "y": "?{query(y)}",  # This is a vanilla field, should be in GROUP BY
            },
        )

        tokenizer = TraceTokenizer(trace=trace, model=model, source=source)
        tokenized = tokenizer.tokenize()

        # Check that vanilla fields are in groupby_statements
        if hasattr(tokenized, "groupby_statements"):
            # The tokenizer includes the full query() statement
            assert any("x" in stmt for stmt in tokenized.groupby_statements)
            assert any("y" in stmt for stmt in tokenized.groupby_statements)

    def test_mixed_metric_and_vanilla(self):
        """Test a trace with both metrics and vanilla fields."""
        model = SqlModel(
            name="test_model",
            sql="SELECT category, value FROM test_table",
            metrics=[
                Metric(name="avg_value", expression="AVG(value)"),
                Metric(name="sum_value", expression="SUM(value)"),
            ],
        )

        source = DuckdbSource(name="test_source", type="duckdb", database=":memory:")

        # Create a trace with both a vanilla field and a metric
        trace = Trace(
            name="test_trace",
            model="ref(test_model)",
            props={
                "type": "scatter",
                "x": "?{query(category)}",  # Vanilla field
                "y": "?{query(${ref(test_model).avg_value})}",  # Metric
            },
        )

        tokenizer = TraceTokenizer(trace=trace, model=model, source=source)
        tokenized = tokenizer.tokenize()

        # Check select items
        assert "props.x" in tokenized.select_items
        assert "props.y" in tokenized.select_items
        assert "AVG(value)" in tokenized.select_items["props.y"]

        # Check GROUP BY
        if hasattr(tokenized, "groupby_statements"):
            # Only category should be in GROUP BY, not the AVG metric
            assert any("category" in stmt for stmt in tokenized.groupby_statements)
            for statement in tokenized.groupby_statements:
                assert "AVG" not in statement
                assert "SUM" not in statement

    def test_complex_metric_expression(self):
        """Test that complex metric expressions are handled correctly."""
        model = SqlModel(
            name="test_model",
            sql="SELECT x, y FROM test_table",
            metrics=[
                Metric(name="complex_metric", expression="ROUND(STDDEV_POP(y), 2)"),
            ],
        )

        source = DuckdbSource(name="test_source", type="duckdb", database=":memory:")

        trace = Trace(
            name="test_trace",
            model="ref(test_model)",
            props={
                "type": "scatter",
                "x": "?{query(x)}",
                "y": "?{query(${ref(test_model).complex_metric})}",
            },
        )

        tokenizer = TraceTokenizer(trace=trace, model=model, source=source)
        tokenized = tokenizer.tokenize()

        # Check that the complex metric was resolved
        assert "props.y" in tokenized.select_items
        assert "ROUND(STDDEV_POP(y), 2)" in tokenized.select_items["props.y"]

        # Ensure it's not in GROUP BY
        if hasattr(tokenized, "groupby_statements"):
            for statement in tokenized.groupby_statements:
                assert "STDDEV_POP" not in statement
                assert "ROUND" not in statement or "STDDEV_POP" not in statement
