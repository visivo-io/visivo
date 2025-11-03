"""Tests for Insight.child_items() to verify Input and Model reference extraction."""

import pytest
from visivo.models.props.insight_props import InsightProps
from visivo.models.models.sql_model import SqlModel
from visivo.models.insight import Insight
from visivo.models.interaction import InsightInteraction
from visivo.models.inputs.types.dropdown import DropdownInput
from visivo.models.project import Project
from tests.factories.model_factories import SourceFactory


class TestInsightChildItems:
    """Test suite for Insight.child_items() method."""

    def test_child_items_includes_input_references(self):
        """Verify Input refs from interactions are returned."""
        # ARRANGE
        source = SourceFactory()
        model = SqlModel(name="data", sql="SELECT 1 as x", source=f"ref({source.name})")
        input_obj = DropdownInput(name="threshold", type="dropdown", options=["10", "20", "30"])
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{ ${ref(data).x} }",  # Reference model in props
                y="?{ ${ref(data).y} }",  # Reference model in props
            ),
            interactions=[InsightInteraction(filter="?{ x > ${ref(threshold)} }")],
        )
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            inputs=[input_obj],
            insights=[insight],
            dashboards=[],
        )
        dag = project.dag()

        # ACT
        children = insight.child_items()

        # ASSERT
        assert (
            f"ref({input_obj.name})" in children
        ), f"Expected ref(threshold) in children, got: {children}"
        assert f"ref({model.name})" in children, f"Expected ref(data) in children, got: {children}"

    def test_child_items_includes_model_references(self):
        """Verify model refs from props still work."""
        # ARRANGE
        source = SourceFactory()
        model = SqlModel(name="orders", sql="SELECT 1 as amount", source=f"ref({source.name})")
        insight = Insight(
            name="test_insight",
            props=InsightProps(type="scatter", x="?{ ${ref(orders).date} }", y="?{ sum(amount) }"),
            interactions=None,
        )
        project = Project(
            name="test_project", sources=[source], models=[model], insights=[insight], dashboards=[]
        )
        dag = project.dag()

        # ACT
        children = insight.child_items()

        # ASSERT
        assert (
            f"ref({model.name})" in children
        ), f"Expected ref(orders) in children, got: {children}"

    def test_child_items_handles_multiple_inputs(self):
        """Verify multiple input refs all detected."""
        # ARRANGE
        source = SourceFactory()
        model = SqlModel(name="data", sql="SELECT 1 as x", source=f"ref({source.name})")
        input1 = DropdownInput(name="min_value", type="dropdown", options=["1", "5", "10"])
        input2 = DropdownInput(name="max_value", type="dropdown", options=["50", "100", "200"])
        insight = Insight(
            name="test_insight",
            props=InsightProps(type="scatter", x="?{ ${ref(data).x} }", y="?{ ${ref(data).y} }"),
            interactions=[
                InsightInteraction(filter="?{ x >= ${ref(min_value)} AND x <= ${ref(max_value)} }")
            ],
        )
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            inputs=[input1, input2],
            insights=[insight],
            dashboards=[],
        )
        dag = project.dag()

        # ACT
        children = insight.child_items()

        # ASSERT
        assert (
            f"ref({input1.name})" in children
        ), f"Expected ref(min_value) in children, got: {children}"
        assert (
            f"ref({input2.name})" in children
        ), f"Expected ref(max_value) in children, got: {children}"
        assert f"ref({model.name})" in children, f"Expected ref(data) in children, got: {children}"

    def test_child_items_mixed_inputs_and_models(self):
        """Verify mixed refs (inputs + models)."""
        # ARRANGE
        source = SourceFactory()
        model1 = SqlModel(name="orders", sql="SELECT 1 as amount", source=f"ref({source.name})")
        model2 = SqlModel(name="customers", sql="SELECT 1 as id", source=f"ref({source.name})")
        input_obj = DropdownInput(name="region", type="dropdown", options=["US", "EU", "APAC"])
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter", x="?{ ${ref(orders).date} }", y="?{ ${ref(customers).count} }"
            ),
            interactions=[InsightInteraction(filter="?{ region = ${ref(region)} }")],
        )
        project = Project(
            name="test_project",
            sources=[source],
            models=[model1, model2],
            inputs=[input_obj],
            insights=[insight],
            dashboards=[],
        )
        dag = project.dag()

        # ACT
        children = insight.child_items()

        # ASSERT
        assert f"ref({model1.name})" in children
        assert f"ref({model2.name})" in children
        assert f"ref({input_obj.name})" in children

    def test_child_items_no_inputs_unchanged(self):
        """Verify behavior without inputs unchanged."""
        # ARRANGE
        source = SourceFactory()
        model = SqlModel(name="data", sql="SELECT 1 as x", source=f"ref({source.name})")
        insight = Insight(
            name="test_insight",
            props=InsightProps(type="scatter", x="?{ ${ref(data).x} }", y="?{ ${ref(data).y} }"),
            interactions=None,
        )
        project = Project(
            name="test_project", sources=[source], models=[model], insights=[insight], dashboards=[]
        )
        dag = project.dag()

        # ACT
        children = insight.child_items()

        # ASSERT
        assert f"ref({model.name})" in children
        # Should not have any input refs - only the model ref
        assert len([c for c in children if "ref(" in c]) == 1

    def test_child_items_from_filter_split_sort(self):
        """Verify refs extracted from all interaction types."""
        # ARRANGE
        source = SourceFactory()
        model = SqlModel(name="data", sql="SELECT 1 as x", source=f"ref({source.name})")
        input_filter = DropdownInput(name="filter_val", type="dropdown", options=["A", "B"])
        input_split = DropdownInput(name="split_val", type="dropdown", options=["X", "Y"])
        input_sort = DropdownInput(name="sort_val", type="dropdown", options=["asc", "desc"])
        insight = Insight(
            name="test_insight",
            props=InsightProps(type="scatter", x="?{ ${ref(data).x} }", y="?{ ${ref(data).y} }"),
            interactions=[
                InsightInteraction(filter="?{ x > ${ref(filter_val)} }"),
                InsightInteraction(split="?{ ${ref(split_val)} }"),
                InsightInteraction(sort="?{ ${ref(sort_val)} DESC }"),
            ],
        )
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            inputs=[input_filter, input_split, input_sort],
            insights=[insight],
            dashboards=[],
        )
        dag = project.dag()

        # ACT
        children = insight.child_items()

        # ASSERT
        assert f"ref({input_filter.name})" in children
        assert f"ref({input_split.name})" in children
        assert f"ref({input_sort.name})" in children
        assert f"ref({model.name})" in children
