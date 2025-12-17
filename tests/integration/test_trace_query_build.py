"""
Trace the full query building process to see where the dict format comes from.
"""

import pytest
import json
from pathlib import Path

from tests.factories.model_factories import (
    SourceFactory,
    SqlModelFactory,
    InputFactory,
    ProjectFactory,
)
from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps
from visivo.query.insight.insight_query_builder import InsightQueryBuilder


class TestTraceQueryBuild:
    """Trace query building process step by step."""

    def test_trace_full_query_build_process(self, tmpdir):
        """Trace each step of query building to find where dict format appears."""
        # ARRANGE
        output_dir = str(tmpdir)
        source = SourceFactory()
        model = SqlModelFactory(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )
        threshold_input = InputFactory(name="threshold", options=["100", "500"])

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                marker={
                    "color": "?{CASE WHEN ${ref(orders).amount} > ${ref(threshold).value} THEN 'green' ELSE 'red' END}"
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

        # Create schema file
        schema_dir = Path(output_dir) / "schema" / model.name
        schema_dir.mkdir(parents=True, exist_ok=True)
        schema_file = schema_dir / "schema.json"
        schema_data = {
            model.name_hash(): {
                "id": "INTEGER",
                "date": "DATE",
                "amount": "DECIMAL",
            }
        }
        schema_file.write_text(json.dumps(schema_data))

        # Check unresolved query statements
        unresolved = insight.get_all_query_statements(dag)
        for key, value in unresolved:
            if "marker.color" in key:
                assert (
                    "${threshold.value}" in value
                ), f"Should have ${{threshold.value}}, got: {value}"
                assert (
                    "${ref(threshold).value}" not in value
                ), f"Should NOT have ${{ref(threshold).value}}, got: {value}"

        # Create InsightQueryBuilder
        builder = InsightQueryBuilder(insight, dag, output_dir)

        # Check unresolved statements
        for key, value in builder.unresolved_query_statements:
            if "marker.color" in key:
                assert (
                    "${threshold.value}" in value
                ), f"Should still have ${{threshold.value}}, got: {value}"

        # Resolve
        builder.resolve()

        # Build query
        post_query = builder.post_query

        # Check for the bug - should not have placeholder format
        assert "'_0'" not in post_query, "Dict placeholder format found!"
        assert '"_0"' not in post_query, "Dict placeholder format found!"
        assert "{'_0'" not in post_query, "Dict placeholder format found!"
