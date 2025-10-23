"""Tests for Insight input sanitization in props and interactions."""

import pytest
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps
from visivo.models.interaction import InsightInteraction
from visivo.models.inputs.types.dropdown import DropdownInput
from tests.factories.model_factories import SourceFactory


class TestInsightInputSanitization:
    """Tests for input reference sanitization in insight props and interactions."""

    def test_insight_with_input_in_props_marker_color(self):
        """Test that input refs in props.marker.color are sanitized before FieldResolver."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        color_input = DropdownInput(
            name="color_choice", label="Choose Color", options=["red", "blue", "green"]
        )

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                marker={
                    "color": "?{${ref(color_choice)}}",
                },
            ),
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            inputs=[color_input],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()

        # Should not crash - this is the main assertion
        query_statements = insight.get_all_query_statements(dag)

        # Verify the marker.color statement is sanitized
        marker_color_statement = None
        for key, value in query_statements:
            if "props.marker.color" in key:
                marker_color_statement = value
                break

        assert marker_color_statement is not None
        assert "'visivo-input-placeholder-string'" in marker_color_statement
        assert "/* replace" in marker_color_statement
        assert "color_choice" in marker_color_statement

    def test_insight_with_input_in_interactions_filter(self):
        """Test that input refs in interactions.filter work correctly (existing behavior)."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        threshold_input = DropdownInput(
            name="min_amount", label="Minimum Amount", options=["100", "500", "1000"]
        )

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
            ),
            interactions=[
                InsightInteraction(
                    filter="?{${ref(orders).amount} > ${ref(min_amount)}}"
                ),
            ],
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            inputs=[threshold_input],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()

        # Should not crash
        query_statements = insight.get_all_query_statements(dag)

        # Verify filter is sanitized
        filter_statement = None
        for key, value in query_statements:
            if key == "filter":
                filter_statement = value
                break

        assert filter_statement is not None
        assert "'visivo-input-placeholder-string'" in filter_statement
        assert "/* replace" in filter_statement

    def test_insight_with_input_in_both_props_and_interactions(self):
        """Test that inputs in BOTH props and interactions are sanitized."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        color_input = DropdownInput(
            name="color_choice", label="Color", options=["red", "blue"]
        )
        threshold_input = DropdownInput(
            name="min_amount", label="Minimum", options=["100", "500"]
        )

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                marker={"color": "?{${ref(color_choice)}}"},
            ),
            interactions=[
                InsightInteraction(
                    filter="?{${ref(orders).amount} > ${ref(min_amount)}}"
                ),
            ],
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            inputs=[color_input, threshold_input],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()

        # Should not crash
        query_statements = insight.get_all_query_statements(dag)

        # Count sanitized statements
        sanitized_count = sum(
            1
            for _, value in query_statements
            if "'visivo-input-placeholder-string'" in value
        )

        assert sanitized_count == 2  # One in props, one in interaction

    def test_insight_with_mixed_refs_in_props(self):
        """Test that ONLY input refs are replaced, model refs are left for FieldResolver."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        threshold_input = DropdownInput(
            name="threshold", label="Threshold", options=["5", "10"]
        )

        # Marker color uses BOTH model ref and input ref
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                marker={
                    "color": "?{CASE WHEN ${ref(orders).amount} > ${ref(threshold)} THEN 'red' ELSE 'blue' END}",
                },
            ),
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            inputs=[threshold_input],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()

        # Should not crash
        query_statements = insight.get_all_query_statements(dag)

        # Find marker.color statement
        marker_color_statement = None
        for key, value in query_statements:
            if "props.marker.color" in key:
                marker_color_statement = value
                break

        assert marker_color_statement is not None

        # Model ref should still be present (not sanitized)
        assert "${ref(orders).amount}" in marker_color_statement

        # Input ref should be sanitized
        assert "'visivo-input-placeholder-string'" in marker_color_statement
        assert "${ref(threshold)}" not in marker_color_statement

    def test_sanitize_input_refs_helper_method(self):
        """Test the _sanitize_input_refs helper method directly."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        threshold_input = DropdownInput(
            name="threshold", label="Threshold", options=["5", "10"]
        )

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
            ),
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            inputs=[threshold_input],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()

        # Test the helper directly
        test_input = "CASE WHEN ${ref(orders).x} > ${ref(threshold)} THEN 'high' END"
        result = insight._sanitize_input_refs(test_input, dag)

        # Model ref should remain
        assert "${ref(orders).x}" in result

        # Input ref should be replaced
        assert "'visivo-input-placeholder-string'" in result
        assert "${ref(threshold)}" not in result

        # Comment should be added
        assert "/* replace" in result
        assert "threshold" in result

    def test_input_placeholder_format(self):
        """Test that placeholder format matches what frontend expects."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        color_input = DropdownInput(name="color", label="Color", options=["red", "blue"])

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                marker={"color": "?{${ref(color)}}"},
            ),
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            inputs=[color_input],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()
        query_statements = insight.get_all_query_statements(dag)

        # Find marker.color statement
        marker_color_statement = None
        for key, value in query_statements:
            if "props.marker.color" in key:
                marker_color_statement = value
                break

        # Placeholder should be a valid SQL string literal
        assert marker_color_statement.startswith("'visivo-input-placeholder-string'")

        # Comment should include input name for frontend parsing
        assert "/* replace('visivo-input-placeholder-string', Input(color)" in marker_color_statement

    def test_get_query_statements_with_input_in_props_does_not_crash(self):
        """Test that get_all_query_statements() doesn't crash with input in props.

        This is the core test - it verifies that inputs are sanitized BEFORE reaching
        the FieldResolver, preventing the IndexError that occurred before the fix.
        """
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        color_input = DropdownInput(
            name="color", label="Color", options=["red", "blue"]
        )

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                marker={"color": "?{${ref(color)}}"},
            ),
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            inputs=[color_input],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()

        # This should not crash with IndexError - the main assertion
        query_statements = insight.get_all_query_statements(dag)

        assert query_statements is not None
        assert len(query_statements) > 0

        # Verify the input was sanitized
        has_placeholder = any(
            "'visivo-input-placeholder-string'" in value
            for _, value in query_statements
        )
        assert has_placeholder
