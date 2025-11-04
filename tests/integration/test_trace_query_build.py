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

        # STEP 1: Check unresolved query statements
        print("\n=== STEP 1: Unresolved Query Statements ===")
        unresolved = insight.get_all_query_statements(dag)
        for key, value in unresolved:
            print(f"{key}: {value}")
            if "marker.color" in key:
                assert "${threshold}" in value, f"Should have ${{threshold}}, got: {value}"
                assert "${ref(threshold)}" not in value, f"Should NOT have ${{ref(threshold)}}, got: {value}"

        # STEP 2: Create InsightQueryBuilder
        print("\n=== STEP 2: Create InsightQueryBuilder ===")
        builder = InsightQueryBuilder(insight, dag, output_dir)
        print(f"Is dynamic: {builder.is_dyanmic}")
        print(f"Unresolved statements: {len(builder.unresolved_query_statements)}")

        # Check unresolved statements
        for key, value in builder.unresolved_query_statements:
            if "marker.color" in key:
                print(f"\nUnresolved {key}: {value}")
                assert "${threshold}" in value, f"Should still have ${{threshold}}, got: {value}"

        # STEP 3: Resolve
        print("\n=== STEP 3: Resolve (FieldResolver) ===")
        builder.resolve()

        # Check resolved statements
        for key, value in builder.resolved_query_statements:
            if "marker.color" in key:
                print(f"\nResolved {key}: {value}")
                # This is where the bug appears - after FieldResolver

        # STEP 4: Build query
        print("\n=== STEP 4: Build Final Query ===")
        post_query = builder.post_query
        print(f"\nFinal post_query:\n{post_query}")

        # Check for the bug
        if "'_0'" in post_query or '"_0"' in post_query or "{'_0'" in post_query:
            print("\n❌ BUG DETECTED: Dict placeholder format found!")
            print("This should be ${threshold} not {'_0': ...}")
        else:
            print("\n✅ No dict placeholder format found")
