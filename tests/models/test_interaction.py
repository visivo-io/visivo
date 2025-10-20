"""Tests for InsightInteraction model."""

import pytest
from visivo.models.interaction import InsightInteraction


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
