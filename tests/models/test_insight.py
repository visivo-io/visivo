"""Tests for Insight model."""

import pytest
from visivo.models.insight import Insight
from visivo.models.interaction import InsightInteraction
from visivo.models.props.insight_props import InsightProps


class TestInsightInteractionReferences:
    """Tests for Insight.get_interaction_references() method."""

    def test_get_interaction_references_with_filter(self):
        """Test extracting references from filter interactions."""
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{date}",
                y="?{amount}",
            ),
            interactions=[
                InsightInteraction(
                    filter="?{${ref(users).status} = 'active'}"
                )
            ],
        )

        references = insight.get_interaction_references()
        assert "users" in references

    def test_get_interaction_references_with_split(self):
        """Test extracting references from split interactions."""
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{date}",
                y="?{amount}",
            ),
            interactions=[
                InsightInteraction(
                    split="?{${ref(region)}}"
                )
            ],
        )

        references = insight.get_interaction_references()
        assert "region" in references

    def test_get_interaction_references_with_sort(self):
        """Test extracting references from sort interactions."""
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{date}",
                y="?{amount}",
            ),
            interactions=[
                InsightInteraction(
                    sort="?{${ref(created_date)} DESC}"
                )
            ],
        )

        references = insight.get_interaction_references()
        assert "created_date" in references

    def test_get_interaction_references_with_multiple_fields(self):
        """Test extracting references from multiple interaction fields."""
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{date}",
                y="?{amount}",
            ),
            interactions=[
                InsightInteraction(
                    filter="?{${ref(orders).status} = 'shipped'}",
                    split="?{${ref(region)}}",
                    sort="?{${ref(date)} DESC}"
                )
            ],
        )

        references = insight.get_interaction_references()
        assert "orders" in references
        assert "region" in references
        assert "date" in references

    def test_get_interaction_references_with_multiple_interactions(self):
        """Test extracting references from multiple interactions."""
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{date}",
                y="?{amount}",
            ),
            interactions=[
                InsightInteraction(
                    filter="?{${ref(users).active} = true}"
                ),
                InsightInteraction(
                    split="?{${ref(products).category}}"
                )
            ],
        )

        references = insight.get_interaction_references()
        assert "users" in references
        assert "products" in references

    def test_get_interaction_references_with_complex_expression(self):
        """Test extracting multiple references from a single complex expression."""
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{date}",
                y="?{amount}",
            ),
            interactions=[
                InsightInteraction(
                    filter="?{${ref(orders).status} = 'shipped' AND ${ref(users).active} = true}"
                )
            ],
        )

        references = insight.get_interaction_references()
        assert "orders" in references
        assert "users" in references

    def test_get_interaction_references_with_no_interactions(self):
        """Test that empty set is returned when there are no interactions."""
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{date}",
                y="?{amount}",
            ),
        )

        references = insight.get_interaction_references()
        assert len(references) == 0

    def test_get_interaction_references_with_empty_interaction(self):
        """Test that empty set is returned when interaction has no fields set."""
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{date}",
                y="?{amount}",
            ),
            interactions=[
                InsightInteraction()
            ],
        )

        references = insight.get_interaction_references()
        assert len(references) == 0
