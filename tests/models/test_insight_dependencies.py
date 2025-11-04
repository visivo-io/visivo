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


class TestInsightPropsInputRefs:
    """Test suite for Insight.get_all_query_statements() props input ref conversion."""

    def test_props_with_input_refs_convert_to_js_templates(self):
        """Verify props with input refs convert to ${input_name} format."""
        # ARRANGE
        source = SourceFactory()
        model = SqlModel(name="data", sql="SELECT 1 as x, 2 as y", source=f"ref({source.name})")
        input_obj = DropdownInput(name="threshold", type="dropdown", options=["5", "10", "15"])
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{ ${ref(data).x} }",
                y="?{ ${ref(data).y} }",
                marker={"size": "?{ ${ref(threshold)} }"},
            ),
            interactions=None,
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
        query_statements = insight.get_all_query_statements(dag)

        # ASSERT - Find the marker.size statement
        marker_size_statements = [
            (key, value) for key, value in query_statements if key == "props.marker.size"
        ]
        assert len(marker_size_statements) == 1
        marker_size_value = marker_size_statements[0][1]
        # Input ref should be converted to JS template literal
        assert "${threshold}" in marker_size_value
        assert "${ref(threshold)}" not in marker_size_value

    def test_props_with_model_refs_stay_unchanged(self):
        """Verify props with model refs stay as ${ref(model).field} format."""
        # ARRANGE
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT 1 as amount, '2024-01-01' as date",
            source=f"ref({source.name})",
        )
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{ ${ref(orders).date} }",
                y="?{ ${ref(orders).amount} }",
            ),
            interactions=None,
        )
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            insights=[insight],
            dashboards=[],
        )
        dag = project.dag()

        # ACT
        query_statements = insight.get_all_query_statements(dag)

        # ASSERT
        x_statements = [(key, value) for key, value in query_statements if key == "props.x"]
        y_statements = [(key, value) for key, value in query_statements if key == "props.y"]

        assert len(x_statements) == 1
        assert len(y_statements) == 1

        x_value = x_statements[0][1]
        y_value = y_statements[0][1]

        # Model refs should remain unchanged
        assert "${ref(orders).date}" in x_value
        assert "${ref(orders).amount}" in y_value

    def test_props_with_mixed_input_and_model_refs(self):
        """Verify props with both input and model refs handled correctly."""
        # ARRANGE
        source = SourceFactory()
        model = SqlModel(name="sales", sql="SELECT 1 as revenue", source=f"ref({source.name})")
        input_color = DropdownInput(name="bar_color", type="dropdown", options=["red", "blue"])
        input_opacity = DropdownInput(name="opacity_val", type="dropdown", options=["0.5", "1.0"])
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="bar",
                x="?{ ${ref(sales).date} }",
                y="?{ ${ref(sales).revenue} }",
                marker={
                    "color": "?{ ${ref(bar_color)} }",
                    "opacity": "?{ ${ref(opacity_val)} }",
                },
            ),
            interactions=None,
        )
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            inputs=[input_color, input_opacity],
            insights=[insight],
            dashboards=[],
        )
        dag = project.dag()

        # ACT
        query_statements = insight.get_all_query_statements(dag)

        # ASSERT
        x_statements = [(key, value) for key, value in query_statements if key == "props.x"]
        marker_color_statements = [
            (key, value) for key, value in query_statements if key == "props.marker.color"
        ]
        marker_opacity_statements = [
            (key, value) for key, value in query_statements if key == "props.marker.opacity"
        ]

        # Model refs unchanged
        assert "${ref(sales).date}" in x_statements[0][1]

        # Input refs converted
        assert "${bar_color}" in marker_color_statements[0][1]
        assert "${ref(bar_color)}" not in marker_color_statements[0][1]

        assert "${opacity_val}" in marker_opacity_statements[0][1]
        assert "${ref(opacity_val)}" not in marker_opacity_statements[0][1]

    def test_props_and_interactions_have_uniform_format(self):
        """Verify insights with both props and interactions use uniform JS template format."""
        # ARRANGE
        source = SourceFactory()
        model = SqlModel(name="data", sql="SELECT 1 as value", source=f"ref({source.name})")
        input_threshold = DropdownInput(name="threshold", type="dropdown", options=["10", "20"])
        input_marker_size = DropdownInput(name="point_size", type="dropdown", options=["5", "10"])
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{ ${ref(data).x} }",
                y="?{ ${ref(data).y} }",
                marker={"size": "?{ ${ref(point_size)} }"},
            ),
            interactions=[InsightInteraction(filter="?{ value > ${ref(threshold)} }")],
        )
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            inputs=[input_threshold, input_marker_size],
            insights=[insight],
            dashboards=[],
        )
        dag = project.dag()

        # ACT
        query_statements = insight.get_all_query_statements(dag)

        # ASSERT
        filter_statements = [(key, value) for key, value in query_statements if key == "filter"]
        marker_size_statements = [
            (key, value) for key, value in query_statements if key == "props.marker.size"
        ]

        assert len(filter_statements) == 1
        assert len(marker_size_statements) == 1

        # Both should use ${input_name} format
        assert "${threshold}" in filter_statements[0][1]
        assert "${ref(threshold)}" not in filter_statements[0][1]

        assert "${point_size}" in marker_size_statements[0][1]
        assert "${ref(point_size)}" not in marker_size_statements[0][1]

    def test_props_multiple_input_refs_in_single_expression(self):
        """Verify multiple input refs in a single prop expression all converted."""
        # ARRANGE
        source = SourceFactory()
        model = SqlModel(name="data", sql="SELECT 1 as x", source=f"ref({source.name})")
        input_min = DropdownInput(name="min_val", type="dropdown", options=["1", "5"])
        input_max = DropdownInput(name="max_val", type="dropdown", options=["50", "100"])
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{ ${ref(data).x} }",
                y="?{ ${ref(data).y} }",
                text="?{ 'Range: ' || ${ref(min_val)} || ' to ' || ${ref(max_val)} }",
            ),
            interactions=None,
        )
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            inputs=[input_min, input_max],
            insights=[insight],
            dashboards=[],
        )
        dag = project.dag()

        # ACT
        query_statements = insight.get_all_query_statements(dag)

        # ASSERT
        text_statements = [(key, value) for key, value in query_statements if key == "props.text"]
        assert len(text_statements) == 1
        text_value = text_statements[0][1]

        # Both input refs should be converted
        assert "${min_val}" in text_value
        assert "${max_val}" in text_value
        assert "${ref(min_val)}" not in text_value
        assert "${ref(max_val)}" not in text_value

    def test_props_input_refs_with_complex_expressions(self):
        """Verify input refs converted even in complex SQL expressions."""
        # ARRANGE
        source = SourceFactory()
        model = SqlModel(name="data", sql="SELECT 1 as value", source=f"ref({source.name})")
        input_multiplier = DropdownInput(name="multiplier", type="dropdown", options=["2", "3"])
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{ ${ref(data).x} }",
                y="?{ ${ref(data).value} * CAST(${ref(multiplier)} AS INTEGER) + 10 }",
            ),
            interactions=None,
        )
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            inputs=[input_multiplier],
            insights=[insight],
            dashboards=[],
        )
        dag = project.dag()

        # ACT
        query_statements = insight.get_all_query_statements(dag)

        # ASSERT
        y_statements = [(key, value) for key, value in query_statements if key == "props.y"]
        assert len(y_statements) == 1
        y_value = y_statements[0][1]

        # Input ref should be converted, model ref should remain
        assert "${multiplier}" in y_value
        assert "${ref(multiplier)}" not in y_value
        assert "${ref(data).value}" in y_value

    def test_props_no_input_refs_unchanged(self):
        """Verify props without input refs work as before."""
        # ARRANGE
        source = SourceFactory()
        model = SqlModel(name="data", sql="SELECT 1 as x, 2 as y", source=f"ref({source.name})")
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{ ${ref(data).x} }",
                y="?{ ${ref(data).y} }",
            ),
            interactions=None,
        )
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            insights=[insight],
            dashboards=[],
        )
        dag = project.dag()

        # ACT
        query_statements = insight.get_all_query_statements(dag)

        # ASSERT
        x_statements = [(key, value) for key, value in query_statements if key == "props.x"]
        y_statements = [(key, value) for key, value in query_statements if key == "props.y"]

        # Model refs should remain unchanged
        assert "${ref(data).x}" in x_statements[0][1]
        assert "${ref(data).y}" in y_statements[0][1]

    def test_props_nested_object_with_input_refs(self):
        """Verify input refs in deeply nested prop objects converted correctly."""
        # ARRANGE
        source = SourceFactory()
        model = SqlModel(name="data", sql="SELECT 1 as x", source=f"ref({source.name})")
        input_line_width = DropdownInput(
            name="line_width", type="dropdown", options=["1", "2", "3"]
        )
        input_line_color = DropdownInput(
            name="line_color", type="dropdown", options=["red", "blue"]
        )
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{ ${ref(data).x} }",
                y="?{ ${ref(data).y} }",
                line={
                    "width": "?{ ${ref(line_width)} }",
                    "color": "?{ ${ref(line_color)} }",
                },
            ),
            interactions=None,
        )
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            inputs=[input_line_width, input_line_color],
            insights=[insight],
            dashboards=[],
        )
        dag = project.dag()

        # ACT
        query_statements = insight.get_all_query_statements(dag)

        # ASSERT
        line_width_statements = [
            (key, value) for key, value in query_statements if key == "props.line.width"
        ]
        line_color_statements = [
            (key, value) for key, value in query_statements if key == "props.line.color"
        ]

        assert len(line_width_statements) == 1
        assert len(line_color_statements) == 1

        # Input refs should be converted
        assert "${line_width}" in line_width_statements[0][1]
        assert "${ref(line_width)}" not in line_width_statements[0][1]

        assert "${line_color}" in line_color_statements[0][1]
        assert "${ref(line_color)}" not in line_color_statements[0][1]
