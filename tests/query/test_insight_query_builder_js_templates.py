import pytest
from tests.factories.model_factories import (
    InputFactory,
    SqlModelFactory,
    ProjectFactory,
    SourceFactory,
)
from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps
from visivo.models.interaction import InsightInteraction
from visivo.models.project import Project
from visivo.query.insight.insight_query_builder import InsightQueryBuilder
from tests.support.utils import temp_folder


class TestInsightQueryBuilderJSTemplates:
    def test_query_builder_uses_js_template_literals_in_unresolved_statements(self):
        """Verify query builder converts ${ref(input).value} to ${input.value} in unresolved statements"""
        # ARRANGE
        source = SourceFactory()
        model = SqlModelFactory(
            name="data", sql="SELECT 1 as x, 2 as y", source=f"ref({source.name})"
        )
        input_obj = InputFactory(name="threshold", options=["5", "10", "15"])
        insight = Insight(
            name="filtered",
            props=InsightProps(type="scatter", x="?{${ref(data).x}}", y="?{${ref(data).y}}"),
            interactions=[InsightInteraction(filter="?{x > ${ref(threshold).value}}")],
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
        output_dir = temp_folder()

        # ACT
        builder = InsightQueryBuilder(insight, dag, output_dir)

        # Find the filter statement in unresolved_query_statements
        filter_statements = [
            (key, value) for key, value in builder.unresolved_query_statements if key == "filter"
        ]

        # ASSERT
        assert len(filter_statements) == 1
        filter_value = filter_statements[0][1]
        # Input ref should be converted to JS template literal with accessor
        assert "${threshold.value}" in filter_value
        assert "${ref(threshold).value}" not in filter_value
        # Old placeholder syntax should not be present
        assert "visivo-input-placeholder" not in filter_value

    def test_query_builder_leaves_model_refs_unchanged_in_unresolved_statements(self):
        """Verify model refs are preserved in unresolved statements"""
        # ARRANGE
        source = SourceFactory()
        model = SqlModelFactory(
            name="sales",
            sql="SELECT 1 as revenue, '2024-01-01' as date",
            source=f"ref({source.name})",
        )
        input_obj = InputFactory(name="min_revenue", options=["1000", "2000", "5000"])
        insight = Insight(
            name="filtered_sales",
            props=InsightProps(type="bar", x="?{${ref(sales).date}}", y="?{${ref(sales).revenue}}"),
            interactions=[
                InsightInteraction(
                    filter="?{${ref(sales).revenue} > ${ref(min_revenue).value} AND ${ref(sales).date} > '2024-01-01'}"
                )
            ],
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
        output_dir = temp_folder()

        # ACT
        builder = InsightQueryBuilder(insight, dag, output_dir)

        # Find the filter statement
        filter_statements = [
            (key, value) for key, value in builder.unresolved_query_statements if key == "filter"
        ]

        # ASSERT
        assert len(filter_statements) == 1
        filter_value = filter_statements[0][1]
        # Input refs should be converted with accessor
        assert "${min_revenue.value}" in filter_value
        assert "${ref(min_revenue).value}" not in filter_value
        # Model refs should remain unchanged (will be handled by field resolver)
        assert "${ref(sales).revenue}" in filter_value
        assert "${ref(sales).date}" in filter_value
