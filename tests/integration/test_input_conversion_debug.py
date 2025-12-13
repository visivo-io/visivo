"""
Debug test to verify input reference conversion works correctly.
"""

import pytest
from tests.factories.model_factories import (
    SourceFactory,
    SqlModelFactory,
    InputFactory,
    ProjectFactory,
)
from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps


class TestInputConversionDebug:
    """Debug tests to trace input conversion flow."""

    def test_insight_get_all_query_statements_converts_input_refs(self):
        """Verify that get_all_query_statements() converts ${ref(input)} to ${input}."""
        # ARRANGE
        source = SourceFactory()
        model = SqlModelFactory(name="orders", source=f"ref({source.name})")
        threshold_input = InputFactory(name="threshold", options=["100", "500"])

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                marker={
                    "color": "?{CASE WHEN ${ref(orders).amount} > ${ref(threshold)} THEN 'green' ELSE 'red' END}"
                },
            ),
        )

        project = ProjectFactory(
            sources=[source],
            models=[model],
            inputs=[threshold_input],
            insights=[insight],
        )

        dag = project.dag()

        # ACT - Get query statements (should convert input refs)
        query_statements = insight.get_all_query_statements(dag)

        # ASSERT - Find the marker.color statement
        marker_color_stmt = None
        for key, value in query_statements:
            if "marker.color" in key:
                marker_color_stmt = value
                break

        assert marker_color_stmt is not None, "marker.color statement not found"

        # Should have converted ${ref(threshold)} to ${threshold}
        assert (
            "${threshold}" in marker_color_stmt
        ), f"Should contain ${{threshold}}, got: {marker_color_stmt}"
        assert (
            "${ref(threshold)}" not in marker_color_stmt
        ), f"Should NOT contain ${{ref(threshold)}}, got: {marker_color_stmt}"

        # Model refs should still have ref()
        assert (
            "${ref(orders)" in marker_color_stmt
        ), f"Should still contain ${{ref(orders)}}, got: {marker_color_stmt}"

    def test_dag_can_find_input_by_name(self):
        """Verify that inputs are properly added to the DAG and can be found by name."""
        # ARRANGE
        source = SourceFactory()
        model = SqlModelFactory(name="orders", source=f"ref({source.name})")
        threshold_input = InputFactory(name="threshold", options=["100", "500"])

        project = ProjectFactory(
            sources=[source],
            models=[model],
            inputs=[threshold_input],
            insights=[],
        )

        dag = project.dag()

        # ACT - Try to find input in DAG
        try:
            input_node = dag.get_descendant_by_name("threshold")

            # ASSERT
            from visivo.models.inputs import Input

            assert isinstance(input_node, Input), f"Should be Input, got {type(input_node)}"
            assert (
                input_node.name == "threshold"
            ), f"Should have name 'threshold', got {input_node.name}"
        except ValueError as e:
            pytest.fail(f"Input not found in DAG: {e}")

    def test_convert_input_refs_to_js_templates_directly(self):
        """Test the _convert_input_refs_to_js_templates method directly."""
        # ARRANGE
        source = SourceFactory()
        model = SqlModelFactory(name="orders", source=f"ref({source.name})")
        threshold_input = InputFactory(name="threshold", options=["100", "500"])

        insight = Insight(
            name="test_insight",
            props=InsightProps(type="scatter", x="?{${ref(orders).date}}"),
        )

        project = ProjectFactory(
            sources=[source],
            models=[model],
            inputs=[threshold_input],
            insights=[insight],
        )

        dag = project.dag()

        # ACT - Test conversion directly
        test_expr = (
            "CASE WHEN ${ref(orders).amount} > ${ref(threshold)} THEN 'green' ELSE 'red' END"
        )
        converted = insight._convert_input_refs_to_js_templates(test_expr, dag)

        # ASSERT
        assert "${threshold}" in converted, f"Should contain ${{threshold}}, got: {converted}"
        assert (
            "${ref(threshold)}" not in converted
        ), f"Should NOT contain ${{ref(threshold)}}, got: {converted}"
        assert (
            "${ref(orders).amount}" in converted
        ), f"Should still have ${{ref(orders).amount}}, got: {converted}"
