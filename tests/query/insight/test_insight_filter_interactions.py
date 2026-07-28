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
            schema_base = os.path.join(output_dir, "schemas")
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

    def test_multiselect_first_accessor_with_default_values_keeps_where_clause(
        self, tmpdir, create_schema_file
    ):
        """Smoke-test bug #3 end-to-end reproduction: a multi-select `.first`
        accessor whose input has a `display.default.values` list must NOT drop
        the filter. Pre-fix, get_accessor_sample_value received the list and
        produced `"['Raw']"`, yielding malformed SQL that SQLGlot rejected, so
        the whole filter was silently discarded (no WHERE)."""
        source = SourceFactory()
        model = SqlModel(
            name="local_test_table",
            sql="SELECT x, y FROM test_data",
            source=f"ref({source.name})",
        )
        equip = MultiSelectInput(
            name="equip",
            label="Equipment",
            options=["Raw", "Single-ply", "Multi-ply"],
            display={"type": "dropdown", "default": {"values": ["Raw"]}},
        )
        insight = Insight(
            name="first-accessor-filter",
            props=InsightProps(
                type="scatter",
                x="?{${ref(local_test_table).x}}",
                y="?{${ref(local_test_table).y}}",
            ),
            interactions=[
                InsightInteraction(
                    filter="?{CAST(${ref(local_test_table).x} AS VARCHAR) = '${ref(equip).first}'}"
                )
            ],
        )
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            inputs=[equip],
            insights=[insight],
            dashboards=[],
        )
        dag = project.dag()
        create_schema_file(model, str(tmpdir))

        builder = InsightQueryBuilder(insight, dag, str(tmpdir))
        builder.resolve()
        query_info = builder.build()

        assert (
            "WHERE" in query_info.post_query
        ), f"filter was silently dropped (no WHERE): {query_info.post_query}"
        assert (
            "${equip.first}" in query_info.post_query
        ), f"input placeholder missing from query: {query_info.post_query}"

    def test_single_select_values_accessor_raises_precise_message(self, tmpdir, create_schema_file):
        """Smoke-test bug #12: a single-select input referenced with `.values`
        now raises the precise "Did you mean .value?" message during build,
        instead of leaving the placeholder for SQLGlot to reject with a generic
        "Expecting )". Wires the previously test-only accessor validator into the
        real build path."""
        from visivo.models.inputs.types.single_select import SingleSelectInput
        from visivo.query.accessor_validator import AccessorValidationError

        source = SourceFactory()
        model = SqlModel(
            name="local_test_table", sql="SELECT x, y FROM test_data", source=f"ref({source.name})"
        )
        ss = SingleSelectInput(name="ss1", label="SS", options=["a", "b"])
        insight = Insight(
            name="wrong-accessor",
            props=InsightProps(
                type="scatter",
                x="?{${ref(local_test_table).x}}",
                y="?{${ref(local_test_table).y}}",
            ),
            interactions=[
                InsightInteraction(
                    filter="?{CAST(${ref(local_test_table).x} AS VARCHAR) IN (${ref(ss1).values})}"
                )
            ],
        )
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            inputs=[ss],
            insights=[insight],
            dashboards=[],
        )
        dag = project.dag()
        create_schema_file(model, str(tmpdir))

        builder = InsightQueryBuilder(insight, dag, str(tmpdir))
        with pytest.raises(AccessorValidationError) as exc_info:
            builder.resolve()
            builder.build()
        message = str(exc_info.value)
        assert "single-select" in message
        # Tight guard: `.value` alone is trivially a substring of `.values`, so
        # assert the actual guidance rendered.
        assert "Did you mean .value?" in message

    def _build_single_select_filter(self, tmpdir, create_schema_file, filter_expr):
        from visivo.models.inputs.types.single_select import SingleSelectInput

        source = SourceFactory()
        model = SqlModel(
            name="local_test_table", sql="SELECT x, y FROM test_data", source=f"ref({source.name})"
        )
        ss = SingleSelectInput(name="ss1", label="SS", options=["Raw", "Wraps"])
        insight = Insight(
            name="value-filter",
            props=InsightProps(
                type="scatter",
                x="?{${ref(local_test_table).x}}",
                y="?{${ref(local_test_table).y}}",
            ),
            interactions=[InsightInteraction(filter=filter_expr)],
        )
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            inputs=[ss],
            insights=[insight],
            dashboards=[],
        )
        dag = project.dag()
        create_schema_file(model, str(tmpdir))
        builder = InsightQueryBuilder(insight, dag, str(tmpdir))
        builder.resolve()
        return builder.build()

    def test_bare_single_select_value_filter_is_quoted(self, tmpdir, create_schema_file):
        """Smoke-test bug #13: a BARE single-select `.value` in an equality
        resolves to a QUOTED string literal, so the client substitutes
        `= 'Raw'`, not `= Raw` (which SQL reads as a column)."""
        query_info = self._build_single_select_filter(
            tmpdir, create_schema_file, "?{${ref(local_test_table).x} = ${ref(ss1).value}}"
        )
        assert "'${ss1.value}'" in query_info.post_query
        assert "''" not in query_info.post_query  # not double-quoted

    def test_already_quoted_single_select_value_is_not_double_quoted(
        self, tmpdir, create_schema_file
    ):
        """The established manual-quote pattern stays correct (no `''...''`)."""
        query_info = self._build_single_select_filter(
            tmpdir, create_schema_file, "?{${ref(local_test_table).x} = '${ref(ss1).value}'}"
        )
        assert "'${ss1.value}'" in query_info.post_query
        assert "''" not in query_info.post_query

    def test_column_picker_input_in_a_prop_stays_a_bare_identifier(
        self, tmpdir, create_schema_file
    ):
        """Adversarial-review CRITICAL: a single-select used to PICK a column
        (`y: ${ref(ycol).value}`) must stay a bare identifier — quoting it would
        make the y-axis the constant string 'x' for every row (silent wrong
        data). Role, not type: a projection is never a value operand."""
        from visivo.models.inputs.types.single_select import SingleSelectInput

        source = SourceFactory()
        model = SqlModel(
            name="local_test_table", sql="SELECT x, y FROM test_data", source=f"ref({source.name})"
        )
        ycol = SingleSelectInput(name="ycol", label="Y", options=["x", "y"])
        insight = Insight(
            name="col-picker",
            props=InsightProps(
                type="scatter",
                x="?{${ref(local_test_table).x}}",
                y="?{${ref(ycol).value}}",
            ),
        )
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            inputs=[ycol],
            insights=[insight],
            dashboards=[],
        )
        dag = project.dag()
        create_schema_file(model, str(tmpdir))
        builder = InsightQueryBuilder(insight, dag, str(tmpdir))
        builder.resolve()
        query_info = builder.build()
        assert "${ycol.value}" in query_info.post_query
        assert "'${ycol.value}'" not in query_info.post_query

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

    def test_multiselect_list_default_reduces_to_scalar_not_list_repr(self):
        """Smoke-test bug #3: a multi-select `.first`/`.last`/`.min`/`.max`
        accessor whose input has a `default.values` LIST must produce a SCALAR
        sample, never the Python list-repr `"['Raw']"` (which injects malformed
        SQL and gets the whole filter silently dropped)."""
        options = ["Raw", "Single-ply", "Multi-ply"]
        for accessor in ("first", "last", "min", "max", "value"):
            sample = get_accessor_sample_value(accessor, options, default_value=["Raw"])
            assert sample == "Raw", f"{accessor}: expected 'Raw', got {sample!r}"
            assert (
                "[" not in sample and "]" not in sample
            ), f"{accessor}: sample is a list-repr ({sample!r}) — the bug"

    def test_multiselect_list_default_first_vs_last(self):
        """A multi-element default list picks the accessor-appropriate end."""
        options = ["Raw", "Single-ply", "Multi-ply"]
        assert get_accessor_sample_value("first", options, ["Raw", "Multi-ply"]) == "Raw"
        assert get_accessor_sample_value("last", options, ["Raw", "Multi-ply"]) == "Multi-ply"

    def test_multiselect_list_default_sample_parses_as_sql(self):
        """The produced sample, substituted into a quoted equality, must be
        parseable SQL — the pre-fix `'['Raw']'` was not, which is exactly why
        SQLGlot rejected the predicate and the builder discarded the filter."""
        sample = get_accessor_sample_value("first", ["Raw", "Single-ply"], default_value=["Raw"])
        predicate = f"\"equipment\" = '{sample}'"
        assert parse_expression(predicate, "duckdb") is not None, f"unparseable: {predicate}"

    def test_empty_list_default_falls_back_to_options(self):
        """An empty default list must fall back to the options, not crash."""
        options = ["Raw", "Single-ply"]
        assert get_accessor_sample_value("first", options, default_value=[]) == "Raw"
        assert get_accessor_sample_value("last", options, default_value=[]) == "Single-ply"

    def test_values_accessor_ignores_scalar_reducing_list_default(self):
        """The `.values` (IN-clause) accessor is unaffected by the scalar-
        reducing list-default logic — it samples options[:2], never the default.
        (Options are treated as raw SQL fragments here; escaping is deliberately
        left to the per-combination validator in input_validator.py, which owns
        the value-substitution contract — mirroring it here would break
        pre-quoted options like `["'red'"]`.)"""
        assert (
            get_accessor_sample_value("values", ["A", "B", "C"], default_value=["A"]) == "'A', 'B'"
        )

    def test_numeric_list_default_yields_unquoted_numeric_sample(self):
        """A numeric multi-select default list reduces to a bare numeric sample
        (no quoting/escaping), preserving the int-vs-str boundary."""
        assert get_accessor_sample_value("first", [1, 2, 3], default_value=[1, 2]) == "1"
        assert get_accessor_sample_value("last", [1, 2, 3], default_value=[1, 2]) == "2"


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
