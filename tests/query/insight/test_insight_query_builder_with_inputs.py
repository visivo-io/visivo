"""Tests for InsightQueryBuilder with input references."""

import pytest
import json
import os
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps
from visivo.models.interaction import InsightInteraction
from visivo.models.inputs.types.single_select import SingleSelectInput
from visivo.query.insight.insight_query_builder import (
    InsightQueryBuilder,
    get_sample_value_for_input,
    replace_input_placeholders_for_parsing,
    restore_input_placeholders,
)
from tests.factories.model_factories import SourceFactory


class TestGetSampleValueForInput:
    """Tests for get_sample_value_for_input() helper function."""

    def test_static_options_returns_first_option(self):
        """Test that static options list returns the first option."""
        input_obj = SingleSelectInput(name="color", label="Color", options=["red", "blue", "green"])
        result = get_sample_value_for_input(input_obj)
        assert result == "red"

    def test_string_options_with_quotes(self):
        """Test that string options with SQL quotes are returned correctly."""
        input_obj = SingleSelectInput(name="name", label="Name", options=["'Alice'", "'Bob'"])
        result = get_sample_value_for_input(input_obj)
        assert result == "'Alice'"

    def test_numeric_options_returns_first(self):
        """Test that numeric options return the first value as string."""
        input_obj = SingleSelectInput(name="threshold", label="Threshold", options=["100", "500"])
        result = get_sample_value_for_input(input_obj)
        assert result == "100"

    def test_raises_error_when_no_options_or_default(self):
        """Test that ValueError is raised when no sample value is available."""
        input_obj = SingleSelectInput(
            name="dynamic",
            label="Dynamic",
            options="?{ SELECT DISTINCT value FROM ${ref(data)} }",
        )
        with pytest.raises(ValueError) as exc_info:
            get_sample_value_for_input(input_obj)
        assert "Cannot get sample value for input 'dynamic'" in str(exc_info.value)


class TestReplaceInputPlaceholdersForParsing:
    """Tests for replace_input_placeholders_for_parsing() function."""

    def test_no_placeholders_returns_unchanged(self):
        """Test that SQL without placeholders is returned unchanged."""
        sql = "SELECT * FROM orders WHERE amount > 100"
        result_sql, replacements = replace_input_placeholders_for_parsing(sql)
        assert result_sql == sql
        assert replacements == {}

    def test_single_placeholder_replacement(self):
        """Test replacement of a single input accessor placeholder."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )
        threshold_input = SingleSelectInput(
            name="threshold", label="Threshold", options=["100", "500"]
        )
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                # Reference the input in props to create DAG relationship
                marker={
                    "color": "?{CASE WHEN ${ref(orders).amount} > ${ref(threshold).value} THEN 'high' ELSE 'low' END}"
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

        sql = "amount > ${ref(threshold).value}"
        result_sql, replacements = replace_input_placeholders_for_parsing(
            sql, dag=dag, insight=insight
        )

        # Should contain sample value and marker
        assert "100" in result_sql
        assert "/* __VISIVO_INPUT:threshold.value__ */" in result_sql
        assert replacements == {"threshold.value": "100"}

    def test_string_placeholder_replacement(self):
        """Test replacement of string input accessor placeholder."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )
        color_input = SingleSelectInput(name="color", label="Color", options=["'red'", "'blue'"])
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                # Reference the input in props to create DAG relationship
                marker={"color": "?{${ref(color).value}}"},
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

        sql = "color = ${ref(color).value}"
        result_sql, replacements = replace_input_placeholders_for_parsing(
            sql, dag=dag, insight=insight
        )

        # Should contain string sample value and marker
        assert "'red'" in result_sql
        assert "/* __VISIVO_INPUT:color.value__ */" in result_sql
        assert replacements == {"color.value": "'red'"}

    def test_multiple_placeholders_replacement(self):
        """Test replacement of multiple input accessor placeholders."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )
        threshold_input = SingleSelectInput(name="threshold", label="Threshold", options=["100"])
        color_input = SingleSelectInput(name="color", label="Color", options=["'red'"])
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                # Reference both inputs in props to create DAG relationships
                marker={
                    "color": "?{CASE WHEN ${ref(orders).amount} > ${ref(threshold).value} THEN ${ref(color).value} ELSE 'gray' END}"
                },
            ),
        )
        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            inputs=[threshold_input, color_input],
            insights=[insight],
            dashboards=[],
        )
        dag = project.dag()

        sql = "amount > ${ref(threshold).value} AND color = ${ref(color).value}"
        result_sql, replacements = replace_input_placeholders_for_parsing(
            sql, dag=dag, insight=insight
        )

        # Should contain both markers
        assert "/* __VISIVO_INPUT:threshold.value__ */" in result_sql
        assert "/* __VISIVO_INPUT:color.value__ */" in result_sql
        assert replacements == {"threshold.value": "100", "color.value": "'red'"}

    def test_raises_error_for_undefined_input(self):
        """Test that ValueError is raised for undefined input placeholder."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
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
            insights=[insight],
            dashboards=[],
        )
        dag = project.dag()

        sql = "amount > ${ref(undefined_input).value}"
        with pytest.raises(ValueError) as exc_info:
            replace_input_placeholders_for_parsing(sql, dag=dag, insight=insight)
        assert "undefined_input" in str(exc_info.value)
        assert "undefined input" in str(exc_info.value)


class TestRestoreInputPlaceholders:
    """Tests for restore_input_placeholders() function."""

    def test_no_markers_returns_unchanged(self):
        """Test that SQL without markers is returned unchanged."""
        sql = "SELECT * FROM orders WHERE amount > 100"
        result = restore_input_placeholders(sql)
        assert result == sql

    def test_single_marker_restoration(self):
        """Test restoration of a single marker."""
        sql = "amount > 100 /* __VISIVO_INPUT:threshold.value__ */"
        result = restore_input_placeholders(sql)
        assert result == "amount > ${threshold.value}"

    def test_string_marker_restoration(self):
        """Test restoration of a string marker."""
        sql = "color = 'red' /* __VISIVO_INPUT:color.value__ */"
        result = restore_input_placeholders(sql)
        assert result == "color = ${color.value}"

    def test_multiple_markers_restoration(self):
        """Test restoration of multiple markers."""
        sql = "amount > 100 /* __VISIVO_INPUT:threshold.value__ */ AND color = 'red' /* __VISIVO_INPUT:color.value__ */"
        result = restore_input_placeholders(sql)
        assert "${threshold.value}" in result
        assert "${color.value}" in result
        assert "/* __VISIVO_INPUT" not in result

    def test_preserves_other_comments(self):
        """Test that regular SQL comments are preserved."""
        sql = "amount > 100 /* __VISIVO_INPUT:threshold.value__ */ /* regular comment */"
        result = restore_input_placeholders(sql)
        assert "${threshold.value}" in result
        assert "/* regular comment */" in result


class TestRoundTripPlaceholderProcessing:
    """Tests for round-trip placeholder replacement and restoration."""

    def test_round_trip_numeric_placeholder(self):
        """Test replace → SQLGlot parse → restore for numeric placeholder."""
        from sqlglot import parse_one

        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )
        threshold_input = SingleSelectInput(name="threshold", label="Threshold", options=["100"])
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                # Reference the input in props to create DAG relationship
                marker={
                    "color": "?{CASE WHEN ${ref(orders).amount} > ${ref(threshold).value} THEN 'high' ELSE 'low' END}"
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

        original_sql = "amount > ${ref(threshold).value}"

        # Step 1: Replace placeholders
        safe_sql, _ = replace_input_placeholders_for_parsing(
            sql=original_sql, dag=dag, insight=insight
        )
        assert "${ref(threshold).value}" not in safe_sql
        assert "100" in safe_sql

        # Step 2: Parse with SQLGlot (should not raise)
        parsed = parse_one(safe_sql, dialect="duckdb")
        parsed_sql = parsed.sql(dialect="duckdb")

        # Step 3: Restore placeholders
        restored_sql = restore_input_placeholders(parsed_sql)
        assert "${threshold.value}" in restored_sql

    def test_round_trip_string_placeholder(self):
        """Test replace → SQLGlot parse → restore for string placeholder."""
        from sqlglot import parse_one

        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )
        color_input = SingleSelectInput(name="color", label="Color", options=["'red'"])
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                # Reference the input in props to create DAG relationship
                marker={"color": "?{${ref(color).value}}"},
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

        original_sql = "color = ${ref(color).value}"

        # Step 1: Replace placeholders
        safe_sql, _ = replace_input_placeholders_for_parsing(
            sql=original_sql, dag=dag, insight=insight
        )
        assert "${ref(color).value}" not in safe_sql
        assert "'red'" in safe_sql

        # Step 2: Parse with SQLGlot (should not raise)
        parsed = parse_one(safe_sql, dialect="duckdb")
        parsed_sql = parsed.sql(dialect="duckdb")

        # Step 3: Restore placeholders
        restored_sql = restore_input_placeholders(parsed_sql)
        assert "${color.value}" in restored_sql

    def test_round_trip_case_expression(self):
        """Test round-trip for CASE expression with input placeholder."""
        from sqlglot import parse_one

        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )
        threshold_input = SingleSelectInput(name="threshold", label="Threshold", options=["100"])
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                # Reference the input in props to create DAG relationship
                marker={
                    "color": "?{CASE WHEN ${ref(orders).amount} > ${ref(threshold).value} THEN 'high' ELSE 'low' END}"
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

        original_sql = "CASE WHEN amount > ${ref(threshold).value} THEN 'high' ELSE 'low' END"

        # Step 1: Replace placeholders
        safe_sql, _ = replace_input_placeholders_for_parsing(
            sql=original_sql, dag=dag, insight=insight
        )

        # Step 2: Parse with SQLGlot (should not raise)
        parsed = parse_one(safe_sql, dialect="duckdb")
        parsed_sql = parsed.sql(dialect="duckdb")

        # Step 3: Restore placeholders
        restored_sql = restore_input_placeholders(parsed_sql)
        assert "${threshold.value}" in restored_sql


class TestInsightQueryBuilderWithInputs:
    """Tests for InsightQueryBuilder handling of insights with inputs."""

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

            # Create a basic schema with common columns
            model_hash = model.name_hash()
            schema_data = {
                model_hash: {
                    "id": "INTEGER",
                    "date": "DATE",
                    "amount": "DECIMAL",
                    "user_id": "INTEGER",
                }
            }
            with open(schema_file, "w") as f:
                json.dump(schema_data, f)

        return _create_schema

    def test_dynamic_insight_detection_with_inputs(self, create_schema_file):
        """Test that insights with input refs are correctly marked as dynamic."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        color_input = SingleSelectInput(name="color", label="Color", options=["red", "blue"])

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                marker={"color": "?{${ref(color).value}}"},
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
        builder = InsightQueryBuilder(insight, dag, "/tmp")

        # Insight should be marked as dynamic
        assert builder.is_dynamic is True

    def test_query_builder_post_query_contains_placeholders(self, tmpdir, create_schema_file):
        """Test that post_query for dynamic insights contains input placeholders."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        color_input = SingleSelectInput(name="color", label="Color", options=["red", "blue"])

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                marker={"color": "?{${ref(color).value}}"},
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
        create_schema_file(orders_model, str(tmpdir))
        builder = InsightQueryBuilder(insight, dag, str(tmpdir))
        builder.resolve()

        # Get the post_query (for client-side execution)
        post_query = builder.post_query

        assert post_query is not None
        # Should contain ${inputName.accessor} placeholder for client-side substitution
        assert "${color.value}" in post_query

    def test_props_mapping_with_input_refs(self, tmpdir, create_schema_file):
        """Test that props_mapping is generated correctly even with input refs in props."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        color_input = SingleSelectInput(name="color", label="Color", options=["red", "blue"])

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                marker={"color": "?{${ref(color).value}}"},
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
        create_schema_file(orders_model, str(tmpdir))
        builder = InsightQueryBuilder(insight, dag, str(tmpdir))
        builder.resolve()

        # Get props_mapping
        props_mapping = builder.props_mapping

        # Should have entries for x, y, and marker.color
        assert "props.x" in props_mapping
        assert "props.y" in props_mapping
        assert "props.marker.color" in props_mapping

        # Values should be column aliases (hashed)
        for key, value in props_mapping.items():
            assert isinstance(value, str)
            assert len(value) > 0

    def test_query_builder_build_with_inputs_does_not_crash(self, tmpdir, create_schema_file):
        """Test that InsightQueryBuilder.build() completes successfully with inputs."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        threshold_input = SingleSelectInput(
            name="threshold", label="Threshold", options=["100", "500"]
        )

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="bar",
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

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            inputs=[threshold_input],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()
        create_schema_file(orders_model, str(tmpdir))
        builder = InsightQueryBuilder(insight, dag, str(tmpdir))
        builder.resolve()

        # This should not crash
        query_info = builder.build()

        # Verify basic structure
        assert query_info is not None
        assert query_info.post_query is not None
        assert query_info.props_mapping is not None
        assert isinstance(query_info.props_mapping, dict)

    def test_non_dynamic_insight_with_no_inputs(self, tmpdir, create_schema_file):
        """Test that non-dynamic insights (no inputs) still work as before."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
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
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()
        create_schema_file(orders_model, str(tmpdir))
        builder = InsightQueryBuilder(insight, dag, str(tmpdir))

        # Should not be dynamic
        assert builder.is_dynamic is False

        builder.resolve()
        query_info = builder.build()

        # Should have pre_query for backend execution
        assert query_info.pre_query is not None
        # post_query should be simple SELECT from insight hash
        assert query_info.post_query is not None
        assert insight.name_hash() in query_info.post_query

    def test_static_props_converts_input_refs_to_js_templates(self, tmpdir, create_schema_file):
        """Test that input refs in static_props are converted from ${ref(input).accessor} to ${input.accessor}."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        mode_input = SingleSelectInput(
            name="show_markers", label="Show Markers", options=["markers", "lines"]
        )

        # Input ref in static prop (not query string)
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                mode="${ref(show_markers).value}",  # Input ref in static prop
            ),
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            inputs=[mode_input],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()
        create_schema_file(orders_model, str(tmpdir))
        builder = InsightQueryBuilder(insight, dag, str(tmpdir))
        builder.resolve()

        # Check that static_props converts the input ref pattern
        static_props = builder.static_props

        # Should have mode with converted input ref
        assert "mode" in static_props
        # Original pattern ${ref(show_markers).value} should be converted to ${show_markers.value}
        assert static_props["mode"] == "${show_markers.value}"
        assert "${ref(" not in static_props["mode"]

    def test_static_props_converts_nested_input_refs(self, tmpdir, create_schema_file):
        """Test that nested input refs in static_props are converted correctly."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        size_input = SingleSelectInput(
            name="marker_size", label="Marker Size", options=["10", "20"]
        )

        # Input ref in nested static prop
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                marker={
                    "size": "${ref(marker_size).value}",  # Input ref in nested prop
                    "color": "blue",  # Static value
                },
            ),
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            inputs=[size_input],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()
        create_schema_file(orders_model, str(tmpdir))
        builder = InsightQueryBuilder(insight, dag, str(tmpdir))
        builder.resolve()

        # Check that static_props converts nested input refs
        static_props = builder.static_props

        # Should have marker with converted input ref for size
        assert "marker" in static_props
        assert "size" in static_props["marker"]
        assert static_props["marker"]["size"] == "${marker_size.value}"
        assert static_props["marker"]["color"] == "blue"

    def test_static_props_in_query_info(self, tmpdir, create_schema_file):
        """Test that static_props with converted input refs flows into InsightQueryInfo."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        mode_input = SingleSelectInput(
            name="display_mode", label="Display Mode", options=["markers", "lines"]
        )

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                mode="${ref(display_mode).value}",  # Input ref in static prop
            ),
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            inputs=[mode_input],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()
        create_schema_file(orders_model, str(tmpdir))
        builder = InsightQueryBuilder(insight, dag, str(tmpdir))
        builder.resolve()

        # Build InsightQueryInfo
        query_info = builder.build()

        # static_props in query_info should have converted input refs
        assert query_info.static_props is not None
        assert "mode" in query_info.static_props
        assert query_info.static_props["mode"] == "${display_mode.value}"
