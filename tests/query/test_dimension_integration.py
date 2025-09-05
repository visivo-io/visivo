"""
Integration tests for dimension resolution in TraceTokenizer.
Tests that project-level and model-level dimensions are properly resolved
when used in traces.
"""

import pytest
from visivo.models.project import Project
from visivo.models.dimension import Dimension
from visivo.models.models.sql_model import SqlModel
from visivo.models.trace import Trace
from visivo.models.trace_props.trace_props import TraceProps
from visivo.models.sources.sqlite_source import SqliteSource
from visivo.query.trace_tokenizer import TraceTokenizer
from tests.factories.model_factories import (
    SourceFactory,
    SqlModelFactory,
    ProjectFactory,
    TraceFactory,
)


class TestDimensionIntegration:
    """Integration tests for dimension resolution in traces."""

    def test_project_dimension_in_trace_tokenization(self):
        """Test that project-level dimensions are resolved in trace tokenization."""
        # Create a project with project-level dimensions
        source = SourceFactory(name="test_source", type="sqlite", database=":memory:")

        model = SqlModelFactory(
            name="orders", sql="SELECT * FROM orders", source="ref(test_source)"
        )

        # Create project-level dimensions
        year_dimension = Dimension(name="order_year", expression="strftime('%Y', order_date)")

        quarter_dimension = Dimension(
            name="order_quarter", expression="'Q' || ((strftime('%m', order_date) - 1) / 3 + 1)"
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dimensions=[year_dimension, quarter_dimension],
            dashboards=[],
        )

        # Create a trace that uses project-level dimensions
        trace = Trace(
            name="test_trace",
            model="ref(orders)",
            props=TraceProps(
                type="scatter",
                x="?{ ${ref(order_year)} }",
                y="?{ COUNT(*) }",
                marker={"color": "?{ ${ref(order_quarter)} }"},
            ),
        )

        # Tokenize the trace
        tokenizer = TraceTokenizer(trace=trace, model=model, source=source, project=project)

        tokenized = tokenizer.tokenize()

        # Verify that dimensions were resolved
        assert "(strftime('%Y', order_date))" in tokenized.select_items["props.x"]
        assert (
            "('Q' || ((strftime('%m', order_date) - 1) / 3 + 1))"
            in tokenized.select_items["props.marker.color"]
        )
        assert "COUNT(*)" in tokenized.select_items["props.y"]

    def test_model_dimension_in_trace_tokenization(self):
        """Test that model-level dimensions are resolved in trace tokenization."""
        source = SourceFactory(name="test_source", type="sqlite", database=":memory:")

        # Create model with dimensions
        model = SqlModel(
            name="sales",
            sql="SELECT * FROM sales",
            source="ref(test_source)",
            dimensions=[
                Dimension(name="sale_month", expression="strftime('%Y-%m', sale_date)"),
                Dimension(
                    name="sale_category",
                    expression="CASE WHEN amount > 1000 THEN 'large' ELSE 'small' END",
                ),
            ],
        )

        project = Project(name="test_project", sources=[source], models=[model], dashboards=[])

        # Create a trace using model dimensions
        trace = Trace(
            name="test_trace",
            model="ref(sales)",
            cohort_on="?{ ${ref(sale_category)} }",
            props=TraceProps(
                type="scatter", x="?{ ${ref(sales).sale_month} }", y="?{ SUM(amount) }"
            ),
        )

        # Tokenize the trace
        tokenizer = TraceTokenizer(trace=trace, model=model, source=source, project=project)

        tokenized = tokenizer.tokenize()

        # Verify that dimensions were resolved
        assert "(strftime('%Y-%m', sale_date))" in tokenized.select_items["props.x"]
        assert "SUM(amount)" in tokenized.select_items["props.y"]
        # cohort_on is resolved directly, not in select_items
        assert "(CASE WHEN amount > 1000 THEN 'large' ELSE 'small' END)" in str(tokenized.cohort_on)

    def test_dimension_in_filter_and_orderby(self):
        """Test that dimensions work in filter and order_by clauses."""
        source = SourceFactory(name="test_source", type="sqlite", database=":memory:")

        model = SqlModelFactory(
            name="transactions", sql="SELECT * FROM transactions", source="ref(test_source)"
        )

        # Create project-level dimension
        year_dimension = Dimension(name="tx_year", expression="strftime('%Y', transaction_date)")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dimensions=[year_dimension],
            dashboards=[],
        )

        # Create a trace with dimension in filter and order_by
        trace = Trace(
            name="test_trace",
            model="ref(transactions)",
            props=TraceProps(type="scatter", x="?{ transaction_date }", y="?{ SUM(amount) }"),
            filters=["?{ ${ref(tx_year)} >= '2023' }"],
            order_by=["?{ ${ref(tx_year)} DESC }"],
        )

        # Tokenize the trace
        tokenizer = TraceTokenizer(trace=trace, model=model, source=source, project=project)

        tokenized = tokenizer.tokenize()

        # Verify filter was resolved
        assert tokenized.filter_by is not None
        assert "(strftime('%Y', transaction_date)) >= '2023'" in str(tokenized.filter_by["vanilla"])

        # Verify order_by was resolved
        assert tokenized.order_by is not None
        assert "(strftime('%Y', transaction_date)) DESC" in tokenized.order_by[0]

    def test_project_dimension_overrides_model_dimension(self):
        """Test that project-level dimensions have priority over model-level dimensions."""
        source = SourceFactory(name="test_source", type="sqlite", database=":memory:")

        # Model with a dimension
        model = SqlModel(
            name="events",
            sql="SELECT * FROM events",
            source="ref(test_source)",
            dimensions=[
                Dimension(
                    name="model_event_month",
                    expression="strftime('%m', event_date)",  # Just month number
                )
            ],
        )

        # Project with a higher priority dimension
        project_dimension = Dimension(
            name="event_month",  # Different name to avoid validation error
            expression="strftime('%B', event_date)",  # Full month name
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dimensions=[project_dimension],
            dashboards=[],
        )

        # Create a trace using the dimension
        trace = Trace(
            name="test_trace",
            model="ref(events)",
            props=TraceProps(type="scatter", x="?{ ${ref(event_month)} }", y="?{ COUNT(*) }"),
        )

        # Tokenize the trace
        tokenizer = TraceTokenizer(trace=trace, model=model, source=source, project=project)

        tokenized = tokenizer.tokenize()

        # Should use project-level dimension (full month name)
        assert "(strftime('%B', event_date))" in tokenized.select_items["props.x"]
        # Model dimension with different name shouldn't be resolved here
        assert "model_event_month" not in tokenized.select_items["props.x"]

    def test_cross_model_dimension_tracking(self):
        """Test that cross-model dimensions properly track model references."""
        source = SourceFactory(name="test_source", type="sqlite", database=":memory:")

        # Create two models
        users_model = SqlModelFactory(
            name="users", sql="SELECT * FROM users", source="ref(test_source)"
        )

        orders_model = SqlModelFactory(
            name="orders", sql="SELECT * FROM orders", source="ref(test_source)"
        )

        # Create project-level dimension that references another model
        user_age_dimension = Dimension(
            name="user_age_group",
            expression="CASE WHEN ${ref(users).age} < 30 THEN 'young' ELSE 'adult' END",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[users_model, orders_model],
            dimensions=[user_age_dimension],
            dashboards=[],
        )

        # Create a trace on orders that uses the user dimension
        trace = Trace(
            name="test_trace",
            model="ref(orders)",
            props=TraceProps(type="scatter", x="?{ ${ref(user_age_group)} }", y="?{ COUNT(*) }"),
        )

        # Tokenize the trace
        tokenizer = TraceTokenizer(trace=trace, model=orders_model, source=source, project=project)

        tokenized = tokenizer.tokenize()

        # Verify that the users model was tracked as a referenced model
        assert "users" in tokenizer.referenced_models

        # Verify the dimension was resolved with the cross-model reference
        assert "users.age" in tokenized.select_items["props.x"]
        assert "CASE WHEN" in tokenized.select_items["props.x"]

    def test_nested_dimension_resolution(self):
        """Test that dimensions can reference other dimensions."""
        source = SourceFactory(name="test_source", type="sqlite", database=":memory:")

        model = SqlModelFactory(name="sales", sql="SELECT * FROM sales", source="ref(test_source)")

        # Create dimensions that reference each other
        base_dimension = Dimension(name="sale_year", expression="strftime('%Y', sale_date)")

        composite_dimension = Dimension(
            name="fiscal_year",
            expression="CASE WHEN strftime('%m', sale_date) >= '07' THEN ${ref(sale_year)} || '-' || (CAST(${ref(sale_year)} AS INT) + 1) ELSE (CAST(${ref(sale_year)} AS INT) - 1) || '-' || ${ref(sale_year)} END",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dimensions=[base_dimension, composite_dimension],
            dashboards=[],
        )

        # Create a trace using the composite dimension
        trace = Trace(
            name="test_trace",
            model="ref(sales)",
            props=TraceProps(type="scatter", x="?{ ${ref(fiscal_year)} }", y="?{ SUM(amount) }"),
        )

        # Tokenize the trace
        tokenizer = TraceTokenizer(trace=trace, model=model, source=source, project=project)

        tokenized = tokenizer.tokenize()

        # Verify nested dimension was fully resolved
        # The fiscal_year should have sale_year expressions substituted
        assert "strftime('%Y', sale_date)" in tokenized.select_items["props.x"]
        assert (
            "fiscal_year" not in tokenized.select_items["props.x"]
        )  # Should be resolved, not literal
        assert (
            "sale_year" not in tokenized.select_items["props.x"]
        )  # Should be resolved, not literal
