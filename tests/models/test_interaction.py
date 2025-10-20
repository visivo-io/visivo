"""Tests for InsightInteraction model."""

import pytest
from visivo.models.interaction import InsightInteraction
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.inputs.types.dropdown import DropdownInput
from tests.factories.model_factories import SourceFactory


class TestInsightInteractionFieldValues:
    """Tests for the field_values property."""

    # def test_multiple_field_values(self):
    #     interaction = InsightInteraction(
    #         filter="?{${ref(dim)} > 10}",
    #         filter="?{${ref(category)} = 'foobar'}",
    #     )
    #     field_values = interaction.field_values
    #     assert len(field_values) == 2

    def test_field_values_with_all_fields(self):
        """Test field_values returns all fields when all are set."""
        interaction = InsightInteraction(
            filter="?{${ref(dim)} > 10}",
            split="?{${ref(category)}}",
            sort="?{${ref(date)} DESC}",
        )

        field_values = interaction.field_values

        assert len(field_values) == 3
        assert "filter" in field_values
        assert "split" in field_values
        assert "sort" in field_values
        assert str(field_values["filter"]) == "${ref(dim)} > 10"
        assert str(field_values["split"]) == "${ref(category)}"
        assert str(field_values["sort"]) == "${ref(date)} DESC"

    def test_field_values_with_some_fields(self):
        """Test field_values only returns non-None fields."""
        interaction = InsightInteraction(
            filter="?{${ref(dim)} > 10}",
            sort="?{${ref(date)} DESC}",
        )

        field_values = interaction.field_values

        assert len(field_values) == 2
        assert "filter" in field_values
        assert "sort" in field_values
        assert "split" not in field_values

    def test_field_values_with_no_fields(self):
        """Test field_values returns empty dict when no fields are set."""
        interaction = InsightInteraction()

        field_values = interaction.field_values

        assert len(field_values) == 0
        assert field_values == {}

    def test_field_values_with_only_filter(self):
        """Test field_values with only filter set."""
        interaction = InsightInteraction(filter="?{${ref(status)} = 'active'}")

        field_values = interaction.field_values

        assert len(field_values) == 1
        assert "filter" in field_values
        assert str(field_values["filter"]) == "${ref(status)} = 'active'"


class TestInsightInteractionFieldValuesWithSanitizedInputs:
    """Tests for the field_values_with_sanitized_inputs method."""

    def test_empty_interaction(self):
        """Test with no fields set returns empty dict."""
        source = SourceFactory()
        project = Project(
            name="test_project",
            sources=[source],
            models=[],
            inputs=[],
            insights=[],
            dashboards=[],
        )
        dag = project.dag()

        interaction = InsightInteraction()
        result = interaction.field_values_with_sanitized_inputs(dag)

        assert len(result) == 0
        assert result == {}

    def test_no_input_references(self):
        """Test fields with only model references remain unchanged."""
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
            inputs=[],
            insights=[],
            dashboards=[],
        )
        dag = project.dag()

        interaction = InsightInteraction(
            filter="?{${ref(orders).date} > '2023-01-01'}",
            split="?{${ref(orders).category}}",
            sort="?{${ref(orders).date} DESC}",
        )

        result = interaction.field_values_with_sanitized_inputs(dag)

        assert len(result) == 3
        assert "${ref(orders).date} > '2023-01-01'" in result["filter"]
        assert "${ref(orders).category}" in result["split"]
        assert "${ref(orders).date} DESC" in result["sort"]
        # Should not have any comments since no inputs
        assert " -- replace" not in result["filter"]
        assert " -- replace" not in result["split"]
        assert " -- replace" not in result["sort"]

    def test_single_input_reference_in_filter(self):
        """Test filter with input reference is replaced with placeholder + comment."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )
        year_input = DropdownInput(
            name="selected_year", label="Select Year", options=["2023", "2024"]
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            inputs=[year_input],
            insights=[],
            dashboards=[],
        )
        dag = project.dag()

        interaction = InsightInteraction(
            filter="?{${ref(orders).year} = ${ref(selected_year)}}",
        )

        result = interaction.field_values_with_sanitized_inputs(dag)

        assert len(result) == 1
        assert "filter" in result
        # Should have placeholder instead of input reference
        assert "'visivo-input-placeholder-string'" in result["filter"]
        # Should have comment at the end
        assert (
            " -- replace('visivo-input-placeholder-string', Input(selected_year) )"
            in result["filter"]
        )
        # Model reference should remain
        assert "${ref(orders).year}" in result["filter"]

    def test_multiple_fields_with_inputs(self):
        """Test all three fields (filter, split, sort) with different inputs."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )
        year_input = DropdownInput(
            name="selected_year", label="Select Year", options=["2023", "2024"]
        )
        category_input = DropdownInput(
            name="selected_category", label="Select Category", options=["A", "B", "C"]
        )
        sort_input = DropdownInput(name="sort_field", label="Sort By", options=["date", "amount"])

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            inputs=[year_input, category_input, sort_input],
            insights=[],
            dashboards=[],
        )
        dag = project.dag()

        interaction = InsightInteraction(
            filter="?{${ref(orders).year} = ${ref(selected_year)}}",
            split="?{${ref(selected_category)}}",
            sort="?{${ref(sort_field)} DESC}",
        )

        result = interaction.field_values_with_sanitized_inputs(dag)

        assert len(result) == 3

        # Check filter
        assert "'visivo-input-placeholder-string'" in result["filter"]
        assert (
            " -- replace('visivo-input-placeholder-string', Input(selected_year) )"
            in result["filter"]
        )
        assert "${ref(orders).year}" in result["filter"]

        # Check split
        assert "'visivo-input-placeholder-string'" in result["split"]
        assert (
            " -- replace('visivo-input-placeholder-string', Input(selected_category) )"
            in result["split"]
        )

        # Check sort
        assert "'visivo-input-placeholder-string'" in result["sort"]
        assert (
            " -- replace('visivo-input-placeholder-string', Input(sort_field) )" in result["sort"]
        )

    def test_mixed_references(self):
        """Test field with both input and model references - only input replaced."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )
        users_model = SqlModel(
            name="users",
            sql="SELECT * FROM users_table",
            source=f"ref({source.name})",
        )
        status_input = DropdownInput(
            name="selected_status", label="Select Status", options=["active", "inactive"]
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, users_model],
            inputs=[status_input],
            insights=[],
            dashboards=[],
        )
        dag = project.dag()

        interaction = InsightInteraction(
            filter="?{${ref(orders).status} = ${ref(selected_status)} AND ${ref(users).verified} = true}",
        )

        result = interaction.field_values_with_sanitized_inputs(dag)

        assert len(result) == 1
        # Input reference replaced with placeholder
        assert "'visivo-input-placeholder-string'" in result["filter"]
        assert (
            " -- replace('visivo-input-placeholder-string', Input(selected_status) )"
            in result["filter"]
        )
        # Model references should remain unchanged
        assert "${ref(orders).status}" in result["filter"]
        assert "${ref(users).verified}" in result["filter"]

    def test_input_not_in_dag(self):
        """Test reference to non-existent node raises ValueError."""
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
            inputs=[],  # No inputs in project
            insights=[],
            dashboards=[],
        )
        dag = project.dag()

        interaction = InsightInteraction(
            filter="?{${ref(orders).year} = ${ref(nonexistent_input)}}",
        )

        # Should raise ValueError when node is not found in DAG
        with pytest.raises(ValueError, match="No node found with name 'nonexistent_input'"):
            interaction.field_values_with_sanitized_inputs(dag)

    def test_multiple_inputs_in_one_field(self):
        """Test single field with multiple input references - all replaced."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )
        year_input = DropdownInput(
            name="selected_year", label="Select Year", options=["2023", "2024"]
        )
        category_input = DropdownInput(
            name="selected_category", label="Select Category", options=["A", "B", "C"]
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            inputs=[year_input, category_input],
            insights=[],
            dashboards=[],
        )
        dag = project.dag()

        interaction = InsightInteraction(
            filter="?{${ref(orders).year} = ${ref(selected_year)} AND ${ref(orders).category} = ${ref(selected_category)}}",
        )

        result = interaction.field_values_with_sanitized_inputs(dag)

        assert len(result) == 1
        # Should have placeholders for both inputs (appears 4 times: 2 in SQL + 2 in comments)
        assert result["filter"].count("'visivo-input-placeholder-string'") == 4
        # Should have two comments appended
        assert (
            " -- replace('visivo-input-placeholder-string', Input(selected_year) )"
            in result["filter"]
        )
        assert (
            " -- replace('visivo-input-placeholder-string', Input(selected_category) )"
            in result["filter"]
        )
        # Model references should remain
        assert "${ref(orders).year}" in result["filter"]
        assert "${ref(orders).category}" in result["filter"]

    def test_only_some_fields_set(self):
        """Test with only some fields set - only returns those fields."""
        source = SourceFactory()
        year_input = DropdownInput(
            name="selected_year", label="Select Year", options=["2023", "2024"]
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[],
            inputs=[year_input],
            insights=[],
            dashboards=[],
        )
        dag = project.dag()

        interaction = InsightInteraction(
            filter="?{year = ${ref(selected_year)}}",
            # split and sort are None
        )

        result = interaction.field_values_with_sanitized_inputs(dag)

        assert len(result) == 1
        assert "filter" in result
        assert "split" not in result
        assert "sort" not in result
        assert "'visivo-input-placeholder-string'" in result["filter"]
