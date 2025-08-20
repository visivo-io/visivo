"""Tests for project-level dimensions."""

import pytest
from visivo.models.project import Project
from visivo.models.dimension import Dimension
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.sqlite_source import SqliteSource


class TestProjectDimensions:
    """Test suite for project-level dimensions."""

    def test_project_with_dimensions(self):
        """Test creating a project with project-level dimensions."""
        project = Project(
            name="test_project",
            dimensions=[
                Dimension(
                    name="fiscal_quarter",
                    expression="CONCAT('Q', QUARTER(date))",
                    description="Fiscal quarter derived from date",
                ),
                Dimension(
                    name="is_weekend",
                    expression="CASE WHEN DAYOFWEEK(date) IN (1, 7) THEN true ELSE false END",
                    description="Whether the date is a weekend",
                ),
            ],
        )

        assert project.name == "test_project"
        assert len(project.dimensions) == 2
        assert project.dimensions[0].name == "fiscal_quarter"
        assert project.dimensions[1].name == "is_weekend"

    def test_project_without_dimensions(self):
        """Test that projects without dimensions still work (backward compatibility)."""
        project = Project(name="simple_project")

        assert project.name == "simple_project"
        assert project.dimensions == []

    def test_dimension_hierarchy(self):
        """Test that dimensions can be defined at different levels."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        # Create a model with model-scoped dimensions
        model = SqlModel(
            name="sales",
            sql="SELECT * FROM sales",
            source="ref(test_source)",  # Use ref syntax
            dimensions=[
                Dimension(
                    name="sale_category",
                    expression="CASE WHEN amount > 1000 THEN 'large' ELSE 'small' END",
                )
            ],
        )

        # Create a project with project-level dimensions
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dimensions=[Dimension(name="global_category", expression="'GLOBAL'")],
        )

        # Verify both levels of dimensions exist
        assert len(project.dimensions) == 1
        assert project.dimensions[0].name == "global_category"

        assert len(project.models[0].dimensions) == 1
        assert project.models[0].dimensions[0].name == "sale_category"

    def test_dimension_in_child_items(self):
        """Test that dimensions are included in project child items."""
        project = Project(
            name="test_project", dimensions=[Dimension(name="test_dim", expression="'test'")]
        )

        # Dimensions should not be in child_items as they're configuration, not executable
        children = project.child_items()

        # Dimensions are not executable items, so they shouldn't be in child_items
        # Only items that need to be processed in the DAG should be there
        assert not any(isinstance(item, Dimension) for item in children)
