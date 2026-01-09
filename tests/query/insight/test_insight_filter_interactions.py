"""Tests for InsightQueryBuilder handling of filter interactions.

This test file specifically targets the bug where interactions.filter is not
being compiled into the SQL WHERE clause.
"""

import pytest
import json
import os
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps
from visivo.models.interaction import InsightInteraction
from visivo.models.inputs.types.multi_select import MultiSelectInput
from visivo.query.insight.insight_query_builder import (
    InsightQueryBuilder,
    get_sample_value_for_input,
)
from visivo.query.accessor_validator import get_accessor_sample_value
from visivo.query.sqlglot_utils import parse_expression, has_aggregate_function
from tests.factories.model_factories import SourceFactory, MultiSelectInputFactory


class TestInsightFilterInteractions:
    """Tests for filter interactions in insights."""

    @pytest.fixture
    def create_schema_file(self, tmpdir):
        """Helper fixture to create schema files for models."""

        def _create_schema(model, output_dir):
            """Create a schema.json file for the given model."""
            schema_base = os.path.join(output_dir, "schema")
            os.makedirs(schema_base, exist_ok=True)
            schema_dir = os.path.join(schema_base, model.name)
            os.makedirs(schema_dir, exist_ok=True)
            schema_file = os.path.join(schema_dir, "schema.json")

            # Create a basic schema with x and y columns for filter tests
            model_hash = model.name_hash()
            schema_data = {
                model_hash: {
                    "x": "INTEGER",
                    "y": "INTEGER",
                    "id": "INTEGER",
                    "date": "DATE",
                    "amount": "DECIMAL",
                }
            }
            with open(schema_file, "w") as f:
                json.dump(schema_data, f)

        return _create_schema

    def test_insight_with_filter_interaction_produces_where_clause(
        self, tmpdir, create_schema_file
    ):
        """
        THIS IS THE KEY BUG REPRODUCTION TEST.

        Given: Insight with filter: CAST(${ref(model).x} AS VARCHAR) IN (${ref(input).values})
        When: InsightQueryBuilder.build() is called
        Then: post_query MUST contain WHERE clause with ${input.values} placeholder

        CURRENT BEHAVIOR (BUG): No WHERE clause in output
        EXPECTED BEHAVIOR: WHERE CAST("hash"."x" AS VARCHAR) IN (${selected_x_values.values})
        """
        # Create using factories
        source = SourceFactory()
        model = SqlModel(
            name="local_test_table",
            sql="SELECT x, y FROM test_data",
            source=f"ref({source.name})",
        )

        # Multi-select input with static options (for predictable sample values)
        multi_input = MultiSelectInput(
            name="selected_x_values",
            label="X Values (Query Checkboxes)",
            options=["1", "2", "3"],
        )

        # Insight with EXACT filter from user's config
        insight = Insight(
            name="checkboxes-filter-insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(local_test_table).x}}",
                y="?{${ref(local_test_table).y}}",
            ),
            interactions=[
                InsightInteraction(
                    filter="?{CAST(${ref(local_test_table).x} AS VARCHAR) IN (${ref(selected_x_values).values})}"
                )
            ],
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            inputs=[multi_input],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()
        create_schema_file(model, str(tmpdir))

        builder = InsightQueryBuilder(insight, dag, str(tmpdir))
        builder.resolve()
        query_info = builder.build()

        # KEY ASSERTIONS - These should FAIL with current code if the bug exists!
        assert (
            "WHERE" in query_info.post_query
        ), f"Expected WHERE clause in query: {query_info.post_query}"
        assert (
            "${selected_x_values.values}" in query_info.post_query
        ), f"Expected input placeholder in query: {query_info.post_query}"

    def test_filter_interaction_extracted_from_insight(self, tmpdir, create_schema_file):
        """Verify _get_all_interaction_query_statements returns filter statements."""
        source = SourceFactory()
        model = SqlModel(
            name="local_test_table",
            sql="SELECT x, y FROM test_data",
            source=f"ref({source.name})",
        )

        multi_input = MultiSelectInput(
            name="selected_x_values",
            label="X Values",
            options=["1", "2", "3"],
        )

        insight = Insight(
            name="test-insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(local_test_table).x}}",
                y="?{${ref(local_test_table).y}}",
            ),
            interactions=[
                InsightInteraction(
                    filter="?{CAST(${ref(local_test_table).x} AS VARCHAR) IN (${ref(selected_x_values).values})}"
                )
            ],
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            inputs=[multi_input],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()

        # Get all query statements from the insight
        statements = insight.get_all_query_statements(dag)

        # Verify filter is extracted
        filter_statements = [(key, val) for key, val in statements if key == "filter"]
        assert len(filter_statements) > 0, f"No filter statements found. Got: {statements}"

    def test_unresolved_query_statements_contains_complete_filter(self, tmpdir, create_schema_file):
        """
        DIAGNOSTIC TEST: Check that unresolved_query_statements contains the complete filter
        before FieldResolver runs.
        """
        source = SourceFactory()
        model = SqlModel(
            name="local_test_table",
            sql="SELECT x, y FROM test_data",
            source=f"ref({source.name})",
        )

        multi_input = MultiSelectInput(
            name="selected_x_values",
            label="X Values",
            options=["1", "2", "3"],
        )

        insight = Insight(
            name="test-insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(local_test_table).x}}",
                y="?{${ref(local_test_table).y}}",
            ),
            interactions=[
                InsightInteraction(
                    filter="?{CAST(${ref(local_test_table).x} AS VARCHAR) IN (${ref(selected_x_values).values})}"
                )
            ],
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            inputs=[multi_input],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()
        create_schema_file(model, str(tmpdir))

        builder = InsightQueryBuilder(insight, dag, str(tmpdir))

        # Check BEFORE resolve() - what are the unresolved statements?
        filter_statements = [
            (key, val) for key, val in builder.unresolved_query_statements if key == "filter"
        ]
        assert (
            len(filter_statements) > 0
        ), f"No filter in unresolved_query_statements. Got: {builder.unresolved_query_statements}"

        filter_key, unresolved_filter = filter_statements[0]
        # The unresolved filter should have the complete expression with:
        # - ${ref(local_test_table).x} for model reference
        # - ${selected_x_values.values} for input reference (converted from ${ref(selected_x_values).values})
        assert "IN" in unresolved_filter, f"Filter missing IN clause. Got: {unresolved_filter}"
        assert (
            "${selected_x_values.values}" in unresolved_filter
        ), f"Filter missing input placeholder. Got: {unresolved_filter}"

    def test_resolved_query_statements_contains_filter(self, tmpdir, create_schema_file):
        """
        DIAGNOSTIC TEST: Verify that after resolve(), the resolved_query_statements contains a filter.
        This helps isolate whether the bug is in resolve() or in _build_dynamic_query_string_directly().
        """
        from visivo.query.insight.insight_query_builder import (
            replace_input_placeholders_for_parsing,
        )

        source = SourceFactory()
        model = SqlModel(
            name="local_test_table",
            sql="SELECT x, y FROM test_data",
            source=f"ref({source.name})",
        )

        multi_input = MultiSelectInput(
            name="selected_x_values",
            label="X Values",
            options=["1", "2", "3"],
        )

        insight = Insight(
            name="test-insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(local_test_table).x}}",
                y="?{${ref(local_test_table).y}}",
            ),
            interactions=[
                InsightInteraction(
                    filter="?{CAST(${ref(local_test_table).x} AS VARCHAR) IN (${ref(selected_x_values).values})}"
                )
            ],
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            inputs=[multi_input],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()
        create_schema_file(model, str(tmpdir))

        builder = InsightQueryBuilder(insight, dag, str(tmpdir))

        # Print unresolved statements BEFORE resolve
        print(f"\nUNRESOLVED statements: {builder.unresolved_query_statements}")

        builder.resolve()

        # Print resolved statements AFTER resolve
        print(f"\nRESOLVED statements: {builder.resolved_query_statements}")

        # Check resolved_query_statements for filter
        filter_statements = [
            (key, val) for key, val in builder.resolved_query_statements if key == "filter"
        ]
        assert (
            len(filter_statements) > 0
        ), f"No filter in resolved_query_statements. Got: {builder.resolved_query_statements}"

        # Check the resolved filter is COMPLETE (contains IN clause)
        filter_key, filter_statement = filter_statements[0]
        assert (
            "IN" in filter_statement
        ), f"Resolved filter is incomplete - missing IN clause. Got: {filter_statement}"
        assert (
            "${selected_x_values.values}" in filter_statement
        ), f"Resolved filter is missing input placeholder. Got: {filter_statement}"

        # Check what replace_input_placeholders_for_parsing does with the resolved filter
        safe_statement, replacements = replace_input_placeholders_for_parsing(
            filter_statement, dag=dag, insight=insight, output_dir=str(tmpdir)
        )

        # Check if SQLGlot can parse the safe statement
        parsed = parse_expression(safe_statement, "duckdb")
        assert parsed is not None, (
            f"SQLGlot failed to parse safe_statement: {safe_statement}\n"
            f"Original: {filter_statement}\n"
            f"Replacements: {replacements}"
        )

        # Check if it's incorrectly detected as aggregate/window
        from visivo.query.sqlglot_utils import has_window_function

        is_aggregate = has_aggregate_function(parsed)
        is_window = has_window_function(parsed)
        assert not is_aggregate, f"Filter incorrectly detected as aggregate: {safe_statement}"
        assert not is_window, f"Filter incorrectly detected as window: {safe_statement}"

    def test_interaction_converts_input_refs_to_js_templates(self, tmpdir, create_schema_file):
        """
        Input ref ${ref(selected_x_values).values} should convert to ${selected_x_values.values}
        Model ref ${ref(local_test_table).x} should stay unchanged
        """
        source = SourceFactory()
        model = SqlModel(
            name="local_test_table",
            sql="SELECT x, y FROM test_data",
            source=f"ref({source.name})",
        )

        multi_input = MultiSelectInput(
            name="selected_x_values",
            label="X Values",
            options=["1", "2", "3"],
        )

        insight = Insight(
            name="test-insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(local_test_table).x}}",
                y="?{${ref(local_test_table).y}}",
            ),
            interactions=[
                InsightInteraction(
                    filter="?{CAST(${ref(local_test_table).x} AS VARCHAR) IN (${ref(selected_x_values).values})}"
                )
            ],
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            inputs=[multi_input],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()
        interaction = insight.interactions[0]

        result = interaction.field_values_with_js_template_literals(dag)

        # Input ref should be converted to JS template literal format
        assert (
            "${selected_x_values.values}" in result["filter"]
        ), f"Input ref not converted. Got: {result['filter']}"

        # Model ref should stay unchanged (will be resolved later by FieldResolver)
        assert (
            "${ref(local_test_table).x}" in result["filter"]
        ), f"Model ref should not be converted. Got: {result['filter']}"


class TestMultiSelectAccessorSampleValues:
    """Tests for multi-select .values accessor sample value format."""

    def test_multi_select_values_accessor_returns_sql_list(self):
        """
        Multi-select .values accessor should return format like: 'val1', 'val2', 'val3'
        NOT a single value like .value accessor.
        """
        multi_input = MultiSelectInputFactory(options=["A", "B", "C"])
        sample = get_sample_value_for_input(multi_input, accessor="values")

        # Should be SQL list format with quotes
        assert "'" in sample, f"Expected quoted values. Got: {sample}"
        assert "," in sample, f"Expected comma separators. Got: {sample}"

    def test_get_accessor_sample_value_for_values(self):
        """Direct test of get_accessor_sample_value for 'values' accessor."""
        options = ["1", "2", "3"]
        sample = get_accessor_sample_value("values", options)

        # Should be comma-separated quoted values
        assert sample == "'1', '2'", f"Expected \"'1', '2'\". Got: {sample}"


class TestSQLGlotParsingOfFilters:
    """Tests to verify SQLGlot can parse filter expressions."""

    def test_parse_expression_parses_in_clause(self):
        """SQLGlot should be able to parse IN clause with multiple values."""
        sql = "CAST(\"x\" AS VARCHAR) IN ('1','2','3')"
        parsed = parse_expression(sql, "duckdb")

        assert parsed is not None, f"Failed to parse: {sql}"

    def test_parse_expression_parses_in_clause_with_table_prefix(self):
        """SQLGlot should parse IN clause with table.column reference."""
        sql = "CAST(\"table_hash\".\"x\" AS VARCHAR) IN ('1','2','3')"
        parsed = parse_expression(sql, "duckdb")

        assert parsed is not None, f"Failed to parse: {sql}"

    def test_in_clause_filter_not_aggregate(self):
        """IN clause filter should not be detected as aggregate function."""
        sql = "CAST(\"x\" AS VARCHAR) IN ('1','2','3')"
        parsed = parse_expression(sql, "duckdb")

        assert parsed is not None, f"Failed to parse: {sql}"
        assert not has_aggregate_function(parsed), "IN clause incorrectly detected as aggregate"

    def test_in_clause_with_cast_not_aggregate(self):
        """CAST in IN clause should not be detected as aggregate."""
        sql = "CAST(\"table_hash\".\"x\" AS VARCHAR) IN ('1', '2')"
        parsed = parse_expression(sql, "duckdb")

        assert parsed is not None, f"Failed to parse: {sql}"
        assert not has_aggregate_function(
            parsed
        ), "CAST IN clause incorrectly detected as aggregate"
