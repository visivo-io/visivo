"""
Integration tests for uniform input format in insight queries (Phase 2).

Tests verify that insights with inputs in BOTH props and interactions
generate uniform ${input_name.accessor} format in the final query, not {'_0': ...} placeholders.

This test suite catches the bug where interactions use JS template literals (${input.accessor})
but props use placeholder dictionaries ({'_0': ...}).
"""

import pytest
import re
from pathlib import Path

from tests.factories.model_factories import (
    SourceFactory,
    SqlModelFactory,
    InputFactory,
    ProjectFactory,
)
from tests.support.utils import temp_folder
from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps
from visivo.models.interaction import InsightInteraction
from visivo.query.insight.insight_query_builder import InsightQueryBuilder


class TestInputUniformFormat:
    """
    Integration tests verifying uniform ${input_name.accessor} format in insight queries.

    These tests verify that the InsightQueryBuilder generates consistent
    input references regardless of whether inputs appear in props or interactions.
    """

    @pytest.fixture
    def setup_basic_project(self, tmpdir):
        """Create basic project with source, model, and schema file."""
        output_dir = str(tmpdir)
        source = SourceFactory()
        model = SqlModelFactory(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        # Create schema file for the model
        schema_dir = Path(output_dir) / "schema" / model.name
        schema_dir.mkdir(parents=True, exist_ok=True)

        import json

        schema_file = schema_dir / "schema.json"
        schema_data = {
            model.name_hash(): {
                "id": "INTEGER",
                "date": "DATE",
                "amount": "DECIMAL",
                "category": "VARCHAR",
                "user_id": "INTEGER",
            }
        }
        schema_file.write_text(json.dumps(schema_data))

        return {
            "output_dir": output_dir,
            "source": source,
            "model": model,
        }

    def test_props_only_with_input_generates_dollar_format(self, setup_basic_project):
        """Test that props-only input refs generate ${input_name.accessor} format."""
        # ARRANGE
        setup = setup_basic_project
        threshold_input = InputFactory(name="threshold", options=["100", "500", "1000"])

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
            sources=[setup["source"]],
            models=[setup["model"]],
            inputs=[threshold_input],
            insights=[insight],
        )

        # ACT
        dag = project.dag()

        builder = InsightQueryBuilder(insight, dag, setup["output_dir"])
        builder.resolve()
        post_query = builder.post_query

        # ASSERT - Should use ${threshold.value} format
        assert post_query is not None, "post_query should not be None"
        assert "${threshold.value}" in post_query, "Should contain ${threshold.value} format"
        # Should NOT contain old placeholder format
        assert "'_0'" not in post_query, "Should not contain '_0' placeholder"
        assert "{'_0'" not in post_query, "Should not contain {'_0' dict format"

    def test_interactions_only_with_input_generates_dollar_format(self, setup_basic_project):
        """Test that interaction-only input refs generate ${input_name.accessor} format."""
        # ARRANGE
        setup = setup_basic_project
        min_value_input = InputFactory(name="min_value", options=["10", "50", "100"])

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
            ),
            interactions=[
                InsightInteraction(filter="?{${ref(orders).amount} > ${ref(min_value).value}}"),
            ],
        )

        project = ProjectFactory(
            sources=[setup["source"]],
            models=[setup["model"]],
            inputs=[min_value_input],
            insights=[insight],
        )

        # ACT
        dag = project.dag()
        builder = InsightQueryBuilder(insight, dag, setup["output_dir"])
        builder.resolve()
        post_query = builder.post_query

        # ASSERT - Should use ${min_value.value} format
        assert post_query is not None
        assert "${min_value.value}" in post_query, "Should contain ${min_value.value} format"
        assert "'_0'" not in post_query, "Should not contain '_0' placeholder"
        assert "{'_0'" not in post_query, "Should not contain {'_0' dict format"

    def test_props_and_interactions_both_use_uniform_format(self, setup_basic_project):
        """
        CRITICAL TEST: Verify props AND interactions both use ${input_name.accessor} format.

        This is the main bug scenario - props might use {'_0': ...} while
        interactions use ${input_name.accessor}, causing inconsistency.
        """
        # ARRANGE
        setup = setup_basic_project
        threshold_input = InputFactory(name="threshold", options=["100", "500", "1000"])

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                # Input in props
                marker={
                    "color": "?{CASE WHEN ${ref(orders).amount} > ${ref(threshold).value} THEN 'green' ELSE 'red' END}"
                },
            ),
            # Input in interactions
            interactions=[
                InsightInteraction(filter="?{${ref(orders).amount} > ${ref(threshold).value}}"),
            ],
        )

        project = ProjectFactory(
            sources=[setup["source"]],
            models=[setup["model"]],
            inputs=[threshold_input],
            insights=[insight],
        )

        # ACT
        dag = project.dag()
        builder = InsightQueryBuilder(insight, dag, setup["output_dir"])
        builder.resolve()
        post_query = builder.post_query

        # ASSERT - Both should use ${threshold.value} format
        assert post_query is not None

        # Count occurrences of ${threshold.value}
        threshold_count = post_query.count("${threshold.value}")
        assert (
            threshold_count >= 2
        ), f"Expected at least 2 occurrences of ${{threshold.value}}, got {threshold_count}"

        # Should NOT contain any placeholder dict format
        assert "'_0'" not in post_query, "Should not contain '_0' placeholder"
        assert "{'_0'" not in post_query, "Should not contain {'_0' dict format"
        assert '"_0"' not in post_query, 'Should not contain "_0" placeholder'

        # Use regex to verify no placeholder patterns exist
        placeholder_pattern = re.compile(r"['\"]_\d+['\"]")
        matches = placeholder_pattern.findall(post_query)
        assert len(matches) == 0, f"Found placeholder patterns: {matches}"

    def test_multiple_inputs_in_props_and_interactions(self, setup_basic_project):
        """Test multiple different inputs across props and interactions."""
        # ARRANGE
        setup = setup_basic_project
        min_input = InputFactory(name="min_value", options=["10", "50", "100"])
        max_input = InputFactory(name="max_value", options=["500", "1000", "5000"])
        category_input = InputFactory(name="category", options=["A", "B", "C"])

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                # Input in props
                text="?{CONCAT('Category: ', ${ref(category).value})}",
            ),
            # Multiple inputs in interactions
            interactions=[
                InsightInteraction(
                    filter="?{${ref(orders).amount} >= ${ref(min_value).value} AND ${ref(orders).amount} <= ${ref(max_value).value}}"
                ),
                InsightInteraction(split="?{${ref(orders).category} = ${ref(category).value}}"),
            ],
        )

        project = ProjectFactory(
            sources=[setup["source"]],
            models=[setup["model"]],
            inputs=[min_input, max_input, category_input],
            insights=[insight],
        )

        # ACT
        dag = project.dag()
        builder = InsightQueryBuilder(insight, dag, setup["output_dir"])
        builder.resolve()
        post_query = builder.post_query

        # ASSERT - All inputs should use ${input_name.value} format
        assert post_query is not None
        assert "${min_value.value}" in post_query, "Should contain ${min_value.value}"
        assert "${max_value.value}" in post_query, "Should contain ${max_value.value}"
        assert "${category.value}" in post_query, "Should contain ${category.value}"

        # Should NOT contain any placeholder dict format
        assert "'_0'" not in post_query, "Should not contain '_0'"
        assert "'_1'" not in post_query, "Should not contain '_1'"
        assert "'_2'" not in post_query, "Should not contain '_2'"
        assert "{'_" not in post_query, "Should not contain placeholder dict"

    def test_input_in_case_statement_in_props(self, setup_basic_project):
        """Test input reference inside CASE statement in props."""
        # ARRANGE
        setup = setup_basic_project
        threshold_input = InputFactory(name="threshold", options=["100", "500"])

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="bar",
                x="?{${ref(orders).category}}",
                y="?{${ref(orders).amount}}",
                marker={
                    "color": "?{CASE WHEN ${ref(orders).amount} > ${ref(threshold).value} THEN 'green' WHEN ${ref(orders).amount} = ${ref(threshold).value} THEN 'yellow' ELSE 'red' END}"
                },
            ),
        )

        project = ProjectFactory(
            sources=[setup["source"]],
            models=[setup["model"]],
            inputs=[threshold_input],
            insights=[insight],
        )

        # ACT
        dag = project.dag()
        builder = InsightQueryBuilder(insight, dag, setup["output_dir"])
        builder.resolve()
        post_query = builder.post_query

        # ASSERT
        assert post_query is not None
        # Should have multiple occurrences in CASE statement
        threshold_count = post_query.count("${threshold.value}")
        assert (
            threshold_count >= 2
        ), f"Expected multiple ${{threshold.value}} in CASE, got {threshold_count}"
        assert "'_0'" not in post_query, "Should not contain placeholder"

    def test_input_in_split_interaction(self, setup_basic_project):
        """Test input in split interaction generates correct format."""
        # ARRANGE
        setup = setup_basic_project
        threshold_input = InputFactory(name="threshold", options=["100", "500"])

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
            ),
            interactions=[
                # Split interaction with CASE using input
                InsightInteraction(
                    split="?{CASE WHEN ${ref(orders).amount} >= ${ref(threshold).value} THEN 'High' ELSE 'Low' END}"
                ),
            ],
        )

        project = ProjectFactory(
            sources=[setup["source"]],
            models=[setup["model"]],
            inputs=[threshold_input],
            insights=[insight],
        )

        # ACT
        dag = project.dag()
        builder = InsightQueryBuilder(insight, dag, setup["output_dir"])
        builder.resolve()
        post_query = builder.post_query

        # ASSERT
        assert post_query is not None
        assert "${threshold.value}" in post_query, "Split should contain ${threshold.value}"
        assert "'_0'" not in post_query, "Should not contain placeholder"

    def test_mixed_refs_models_and_inputs(self, setup_basic_project):
        """Test that model refs and input refs coexist correctly."""
        # ARRANGE
        setup = setup_basic_project
        threshold_input = InputFactory(name="threshold", options=["100", "500"])

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                # Model refs
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                # Input ref in props
                marker={"size": "?{${ref(threshold).value} / 10}"},
            ),
            interactions=[
                # Mixed model + input refs in filter
                InsightInteraction(
                    filter="?{${ref(orders).amount} > ${ref(threshold).value} AND ${ref(orders).user_id} IS NOT NULL}"
                ),
            ],
        )

        project = ProjectFactory(
            sources=[setup["source"]],
            models=[setup["model"]],
            inputs=[threshold_input],
            insights=[insight],
        )

        # ACT
        dag = project.dag()
        builder = InsightQueryBuilder(insight, dag, setup["output_dir"])
        builder.resolve()
        post_query = builder.post_query

        # ASSERT
        assert post_query is not None
        # Model refs should be qualified with model hash
        model_hash = setup["model"].name_hash()
        assert model_hash in post_query, f"Should contain model hash {model_hash}"
        # Input refs should use ${input_name.value}
        assert "${threshold.value}" in post_query, "Should contain ${threshold.value}"
        # No placeholders
        assert "'_0'" not in post_query, "Should not contain placeholder"

    def test_input_in_aggregate_filter_having(self, setup_basic_project):
        """Test input reference in HAVING clause (aggregate filter)."""
        # ARRANGE
        setup = setup_basic_project
        min_total_input = InputFactory(name="min_total", options=["1000", "5000", "10000"])

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="bar",
                x="?{${ref(orders).category}}",
                y="?{SUM(${ref(orders).amount})}",
            ),
            interactions=[
                # HAVING clause with input
                InsightInteraction(
                    filter="?{SUM(${ref(orders).amount}) > ${ref(min_total).value}}", aggregate=True
                ),
            ],
        )

        project = ProjectFactory(
            sources=[setup["source"]],
            models=[setup["model"]],
            inputs=[min_total_input],
            insights=[insight],
        )

        # ACT
        dag = project.dag()
        builder = InsightQueryBuilder(insight, dag, setup["output_dir"])
        builder.resolve()
        post_query = builder.post_query

        # ASSERT
        assert post_query is not None
        assert "${min_total.value}" in post_query, "Should contain ${min_total.value} in HAVING"
        assert "'_0'" not in post_query, "Should not contain placeholder"

    def test_input_in_sort_expression(self, setup_basic_project):
        """Test input in sort interaction."""
        # ARRANGE
        setup = setup_basic_project
        sort_by_input = InputFactory(name="sort_field", options=["date", "amount", "category"])

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
            ),
            interactions=[
                # Sort with input (dynamic sort field)
                InsightInteraction(sort="?{${ref(sort_field).value}}"),
            ],
        )

        project = ProjectFactory(
            sources=[setup["source"]],
            models=[setup["model"]],
            inputs=[sort_by_input],
            insights=[insight],
        )

        # ACT
        dag = project.dag()
        builder = InsightQueryBuilder(insight, dag, setup["output_dir"])
        builder.resolve()
        post_query = builder.post_query

        # ASSERT
        assert post_query is not None
        assert "${sort_field.value}" in post_query, "Should contain ${sort_field.value}"
        assert "'_0'" not in post_query, "Should not contain placeholder"

    def test_complex_expression_with_multiple_input_refs(self, setup_basic_project):
        """Test complex expression with the same input referenced multiple times."""
        # ARRANGE
        setup = setup_basic_project
        multiplier_input = InputFactory(name="multiplier", options=["2", "3", "5"])

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                # Same input used multiple times in one expression
                marker={
                    "size": "?{(${ref(orders).amount} * ${ref(multiplier).value}) / (${ref(multiplier).value} + 1)}"
                },
            ),
        )

        project = ProjectFactory(
            sources=[setup["source"]],
            models=[setup["model"]],
            inputs=[multiplier_input],
            insights=[insight],
        )

        # ACT
        dag = project.dag()
        builder = InsightQueryBuilder(insight, dag, setup["output_dir"])
        builder.resolve()
        post_query = builder.post_query

        # ASSERT
        assert post_query is not None
        # Should have multiple occurrences
        multiplier_count = post_query.count("${multiplier.value}")
        assert (
            multiplier_count >= 2
        ), f"Expected multiple ${{multiplier.value}}, got {multiplier_count}"
        assert "'_0'" not in post_query, "Should not contain placeholder"

    def test_input_validator_format(self, setup_basic_project):
        """
        Verify that the generated query format is compatible with InputValidator.

        InputValidator expects ${input_name.accessor} format for client-side replacement.
        """
        # ARRANGE
        setup = setup_basic_project
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
            interactions=[
                InsightInteraction(filter="?{${ref(orders).amount} > ${ref(threshold).value}}"),
            ],
        )

        project = ProjectFactory(
            sources=[setup["source"]],
            models=[setup["model"]],
            inputs=[threshold_input],
            insights=[insight],
        )

        # ACT
        dag = project.dag()
        builder = InsightQueryBuilder(insight, dag, setup["output_dir"])
        builder.resolve()
        post_query = builder.post_query

        # ASSERT - Verify InputValidator compatible format
        assert post_query is not None

        # Should contain ${input_name.accessor} format that InputValidator expects
        input_pattern = re.compile(r"\$\{threshold\.value\}")
        matches = input_pattern.findall(post_query)
        assert (
            len(matches) >= 2
        ), f"Expected multiple ${{threshold.value}} patterns, found {len(matches)}"

        # Should NOT contain any internal placeholder format
        internal_placeholder_pattern = re.compile(r"['\"]_\d+['\"]|visivo-input-placeholder")
        internal_matches = internal_placeholder_pattern.findall(post_query)
        assert len(internal_matches) == 0, f"Found internal placeholders: {internal_matches}"
