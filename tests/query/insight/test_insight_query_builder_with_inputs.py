"""Tests for InsightQueryBuilder with input references."""

import pytest
import json
import os
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps
from visivo.models.interaction import InsightInteraction
from visivo.models.inputs.types.dropdown import DropdownInput
from visivo.query.insight.insight_query_builder import InsightQueryBuilder
from tests.factories.model_factories import SourceFactory


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
        builder = InsightQueryBuilder(insight, dag, "/tmp")

        # Insight should be marked as dynamic
        assert builder.is_dyanmic is True

    def test_query_builder_post_query_contains_placeholders(self, tmpdir, create_schema_file):
        """Test that post_query for dynamic insights contains input placeholders."""
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
        create_schema_file(orders_model, str(tmpdir))
        builder = InsightQueryBuilder(insight, dag, str(tmpdir))
        builder.resolve()

        # Get the post_query (for client-side execution)
        post_query = builder.post_query

        assert post_query is not None
        # Should contain placeholder for client-side substitution
        assert "'visivo-input-placeholder-string'" in post_query

    def test_props_mapping_with_input_refs(self, tmpdir, create_schema_file):
        """Test that props_mapping is generated correctly even with input refs in props."""
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

        threshold_input = DropdownInput(name="threshold", label="Threshold", options=["100", "500"])

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="bar",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
                marker={
                    "color": "?{CASE WHEN ${ref(orders).amount} > ${ref(threshold)} THEN 'green' ELSE 'red' END}"
                },
            ),
            interactions=[
                InsightInteraction(filter="?{${ref(orders).amount} > ${ref(threshold)}}"),
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
        assert builder.is_dyanmic is False

        builder.resolve()
        query_info = builder.build()

        # Should have pre_query for backend execution
        assert query_info.pre_query is not None
        # post_query should be simple SELECT from insight hash
        assert query_info.post_query is not None
        assert insight.name_hash() in query_info.post_query
