"""Tests for Insight dynamic behavior and model dependencies."""

import pytest
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps
from visivo.models.interaction import InsightInteraction
from visivo.models.inputs.types.single_select import SingleSelectInput
from visivo.models.dimension import Dimension
from tests.factories.model_factories import SourceFactory


class TestInsightDynamicMethods:
    """Tests for Insight.get_all_dependent_models() and Insight.is_dynamic()."""

    def test_get_all_dependent_models_single_model(self):
        """Test getting dependent models when insight references one model."""
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
        dependent_models = insight.get_all_dependent_models(dag)

        assert len(dependent_models) == 1
        assert orders_model in dependent_models

    def test_get_all_dependent_models_multiple_models(self):
        """Test getting dependent models when insight references multiple models."""
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

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(users).name}}",
            ),
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, users_model],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()
        dependent_models = insight.get_all_dependent_models(dag)

        assert len(dependent_models) == 2
        assert orders_model in dependent_models
        assert users_model in dependent_models

    def test_get_all_dependent_models_via_dimension(self):
        """Test getting dependent models when insight references model via dimension."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        order_year = Dimension(name="order_year", expression="${ref(orders).order_date}")

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(order_year)}}",
                y="?{${ref(orders).amount}}",
            ),
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            dimensions=[order_year],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()
        dependent_models = insight.get_all_dependent_models(dag)

        assert len(dependent_models) == 1
        assert orders_model in dependent_models

    def test_is_dynamic_with_input_in_interaction(self):
        """Test that insight is_dynamic when it has input in interaction."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        year_input = SingleSelectInput(
            name="selected_year", label="Select Year", options=["2023", "2024"]
        )

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
            ),
            interactions=[
                InsightInteraction(filter="?{${ref(orders).date} = ${ref(selected_year)}}"),
            ],
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            inputs=[year_input],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()

        assert insight.is_dynamic(dag) is True

    def test_is_dynamic_without_input(self):
        """Test that insight is not dynamic when it has no input descendants."""
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

        assert insight.is_dynamic(dag) is False

    def test_is_dynamic_with_input_in_props(self):
        """Test that insight is_dynamic when it has input directly in props."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        year_input = SingleSelectInput(
            name="selected_year", label="Select Year", options=["2023", "2024"]
        )

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(selected_year)}}",
            ),
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            inputs=[year_input],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()

        assert insight.is_dynamic(dag) is True

    def test_get_all_dependent_models_returns_set(self):
        """Test that get_all_dependent_models returns a set."""
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
        dependent_models = insight.get_all_dependent_models(dag)

        assert isinstance(dependent_models, set)
