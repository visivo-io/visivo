"""
Integration tests for Input-Interaction pipeline (Phases 1 + 2).

Tests verify:
1. Input jobs execute and generate JSON files
2. Insight dependencies include inputs (DAG integration)
3. JS template literal conversion in interactions (Phase 2)
4. Mixed refs (models unchanged, inputs converted)
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
from tests.support.utils import temp_folder
from visivo.jobs.run_input_job import action as input_action
from visivo.models.base.query_string import QueryString
from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps


class TestInputInteractionPipeline:
    """Integration tests for Input + Interaction pipeline."""

    def test_static_input_job_execution(self):
        """Phase 1: Verify static input job executes and generates JSON files."""
        # ARRANGE
        output_dir = temp_folder()
        source = SourceFactory()
        input_obj = InputFactory(name="threshold", options=["10", "20", "30"])
        project = ProjectFactory(sources=[source], inputs=[input_obj])
        dag = project.dag()

        # ACT - Run Input Job
        input_result = input_action(input_obj, dag, output_dir)

        # ASSERT - Input Job Success
        assert input_result.success, f"Input job failed: {input_result.message}"

        input_json = Path(output_dir) / "inputs" / f"{input_obj.name_hash()}.json"
        assert input_json.exists(), "Input JSON not created"

        with open(input_json, "r") as f:
            data = json.load(f)
        assert data["type"] == "single-select", f"Expected single-select, got {data['type']}"
        assert data["structure"] == "options", f"Expected options structure"
        assert set(data["results"]["options"]) == {"10", "20", "30"}, "Options don't match"

    def test_js_template_literal_conversion(self):
        """Phase 2: Verify ${ref(input).accessor} converts to ${input.accessor} in interactions."""
        # ARRANGE
        source = SourceFactory()
        model = SqlModelFactory(name="data", sql="SELECT 1 as x", source=f"ref({source.name})")
        input_obj = InputFactory(name="threshold", options=["10", "20", "30"])
        insight = Insight(
            name="filtered",
            props=InsightProps(type="scatter", x="?{${ref(data).x}}"),
            interactions=[{"filter": "?{${ref(data).x} > ${ref(threshold).value}}"}],
        )
        project = ProjectFactory(
            sources=[source], models=[model], inputs=[input_obj], insights=[insight]
        )
        dag = project.dag()

        # ACT - Check field_values_with_js_template_literals
        interaction = insight.interactions[0]
        js_values = interaction.field_values_with_js_template_literals(dag)

        # ASSERT - Input refs converted to JS template literals
        filter_value = js_values.get("filter")
        assert filter_value is not None, "Filter value not found"
        assert "${threshold.value}" in filter_value, "JS template literal not created"
        assert "${ref(threshold).value}" not in filter_value, "Old ref() syntax should be converted"
        # Model refs should remain unchanged
        assert "${ref(data).x}" in filter_value, "Model ref should remain unchanged"

    def test_dag_execution_order(self):
        """DAG Integration: Verify insights depend on inputs in the DAG."""
        # ARRANGE
        output_dir = temp_folder()
        source = SourceFactory()
        model = SqlModelFactory(name="data", sql="SELECT 1 as x", source=f"ref({source.name})")
        input_obj = InputFactory(name="filter_value", options=["1", "2", "3"])
        insight = Insight(
            name="filtered",
            props=InsightProps(type="scatter", x="?{${ref(data).x}}"),
            interactions=[{"filter": "?{${ref(data).x} = ${ref(filter_value).value}}"}],
        )
        project = ProjectFactory(
            sources=[source], models=[model], inputs=[input_obj], insights=[insight]
        )
        dag = project.dag()

        # ACT - Get DAG dependencies
        insight_children = insight.child_items()

        # ASSERT - Insight depends on input (accessor syntax still creates ref dependency)
        assert "ref(filter_value)" in insight_children, "Insight doesn't depend on input"
        assert "ref(data)" in insight_children, "Insight doesn't depend on model"

        # Verify input job function exists
        from visivo.jobs.dag_runner import input_job

        assert input_job is not None, "input_job function not available"

        # Create the input job
        input_job_obj = input_job(dag, output_dir, input_obj)
        assert input_job_obj is not None, "Input job not created"

    def test_multiple_inputs_mixed_refs(self):
        """Verify multiple input refs and model refs coexist correctly."""
        # ARRANGE
        source = SourceFactory()
        model = SqlModelFactory(
            name="data", sql="SELECT 50 as value, 'X' as category", source=f"ref({source.name})"
        )
        input1 = InputFactory(name="min_value", options=["10", "20", "30"])
        input2 = InputFactory(name="max_value", options=["100", "200", "300"])

        insight = Insight(
            name="filtered",
            props=InsightProps(
                type="scatter", x="?{${ref(data).value}}", y="?{${ref(data).category}}"
            ),
            interactions=[
                {
                    "filter": "?{${ref(data).value} > ${ref(min_value).value} AND ${ref(data).value} < ${ref(max_value).value}}"
                }
            ],
        )

        project = ProjectFactory(
            sources=[source],
            models=[model],
            inputs=[input1, input2],
            insights=[insight],
        )
        dag = project.dag()

        # ACT - Check field_values_with_js_template_literals
        interaction = insight.interactions[0]
        js_values = interaction.field_values_with_js_template_literals(dag)

        # ASSERT - Mixed refs correct
        filter_value = js_values.get("filter")
        assert filter_value is not None, "Filter value not found"
        # Model refs should remain unchanged
        assert "${ref(data).value}" in filter_value, "Model ref should remain unchanged"
        # Input refs should be converted to JS template literals with accessor
        assert "${min_value.value}" in filter_value, "Input ref should be JS template with accessor"
        assert "${max_value.value}" in filter_value, "Input ref should be JS template with accessor"
        assert "${ref(min_value).value}" not in filter_value, "Old input ref syntax present"
        assert "${ref(max_value).value}" not in filter_value, "Old input ref syntax present"
