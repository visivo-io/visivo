"""Tests for FieldResolver behavior with input references."""

import pytest
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.inputs.types.dropdown import DropdownInput
from visivo.query.resolvers.field_resolver import FieldResolver
from tests.factories.model_factories import SourceFactory


class TestFieldResolverWithInputs:
    """Tests for FieldResolver handling of input references."""

    def test_field_resolver_crashes_on_unsanitized_input_ref(self):
        """Document that FieldResolver crashes when given unsanitized input reference.

        This test documents the expected behavior - FieldResolver should crash on
        unsanitized input refs because they have no parents in the DAG.
        """
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        threshold_input = DropdownInput(
            name="threshold", label="Threshold", options=["5", "10"]
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            inputs=[threshold_input],
            dashboards=[],
        )

        dag = project.dag()
        field_resolver = FieldResolver(
            dag=dag,
            output_dir="/tmp",
            native_dialect="duckdb",
        )

        # This will crash with IndexError because FieldResolver tries to get parent
        # of Input node, but Inputs have no parents in the DAG
        with pytest.raises(IndexError):
            field_resolver.resolve(expression="${ref(threshold)}")

    def test_field_resolver_ignores_sanitized_input_placeholder(self):
        """Test that FieldResolver passes through sanitized input placeholders unchanged."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            dashboards=[],
        )

        dag = project.dag()
        field_resolver = FieldResolver(
            dag=dag,
            output_dir="/tmp",
            native_dialect="duckdb",
        )

        # Sanitized placeholder should pass through unchanged
        placeholder = "'visivo-input-placeholder-string' -- replace('visivo-input-placeholder-string', Input(threshold))"
        result = field_resolver.resolve(expression=placeholder)

        # Placeholder should be unchanged (no resolution attempted)
        assert result == placeholder

    def test_field_resolver_resolves_model_refs_in_mixed_expression(self):
        """Test that FieldResolver correctly resolves model refs while leaving placeholders intact."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            dashboards=[],
        )

        dag = project.dag()
        field_resolver = FieldResolver(
            dag=dag,
            output_dir="/tmp",
            native_dialect="duckdb",
        )

        # Expression with BOTH model ref and sanitized input placeholder
        mixed_expression = "CASE WHEN ${ref(orders).amount} > 'visivo-input-placeholder-string' THEN 'high' END"
        result = field_resolver.resolve(expression=mixed_expression)

        # Model ref should be resolved (qualified with table hash)
        assert "${ref(orders).amount}" not in result
        assert '"' in result  # Should have quoted identifiers from qualification

        # Placeholder should remain unchanged
        assert "'visivo-input-placeholder-string'" in result
