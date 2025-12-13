"""Tests for dimension references validator."""

import pytest
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.dimension import Dimension
from tests.factories.model_factories import SourceFactory


class TestDimensionReferencesValidator:
    """Tests for dimension reference validation."""

    def test_valid_dimension_referencing_model(self):
        """Test that a dimension can reference a model."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
            dimensions=[
                Dimension(name="order_month", expression="DATE_TRUNC('month', order_date)"),
            ],
        )

        # Should not raise
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )
        assert project is not None

    def test_valid_dimension_referencing_dimension(self):
        """Test that a dimension can reference another dimension."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        dim1 = Dimension(name="order_date", expression="${ref(orders).created_at}")
        dim2 = Dimension(name="order_year", expression="YEAR(${ref(order_date)})")

        # Should not raise
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dimensions=[dim1, dim2],
            dashboards=[],
        )
        assert project is not None

    def test_nested_dimension_in_model(self):
        """Test that nested dimensions automatically tie to their parent model."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
            dimensions=[
                Dimension(name="order_month", expression="DATE_TRUNC('month', order_date)"),
                Dimension(name="order_year", expression="DATE_TRUNC('year', order_date)"),
            ],
        )

        # Should not raise - nested dimensions tie to parent
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )
        assert project is not None

    def test_dimension_chain_references(self):
        """Test that a chain of dimensions all referencing each other is valid."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        dim1 = Dimension(name="order_timestamp", expression="${ref(orders).created_at}")
        dim2 = Dimension(name="order_date", expression="DATE(${ref(order_timestamp)})")
        dim3 = Dimension(name="order_year", expression="YEAR(${ref(order_date)})")

        # Should not raise - all valid dimension references
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dimensions=[dim1, dim2, dim3],
            dashboards=[],
        )
        assert project is not None
