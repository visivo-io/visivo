"""Tests for InsightQueryBuilder."""

import pytest
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.metric import Metric
from visivo.models.dimension import Dimension
from visivo.models.insight import Insight
from visivo.models.interaction import InsightInteraction
from visivo.models.props.insight_props import InsightProps
from visivo.query.insight.insight_query_builder import InsightQueryBuilder
from tests.factories.model_factories import SourceFactory


class TestInsightQueryBuilder:
    """Tests for InsightQueryBuilder initialization and helper methods."""

    def test_collect_referenced_objects_from_interactions_with_filter(self):
        """Test collecting objects referenced in filter interactions."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )
        users_model = SqlModel(
            name="users",
            sql="SELECT * FROM users",
            source=f"ref({source.name})",
        )

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
            ),
            interactions=[
                InsightInteraction(
                    filter="?{${ref(users).status} = 'active'}"
                )
            ],
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, users_model],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()
        builder = InsightQueryBuilder(insight, dag)

        # Should find the users model referenced in the filter
        assert len(builder.referenced_objects) > 0
        referenced_names = {obj.name for obj in builder.referenced_objects if hasattr(obj, 'name')}
        assert "users" in referenced_names

    def test_collect_referenced_objects_from_interactions_with_split(self):
        """Test collecting objects referenced in split interactions."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        dimension = Dimension(
            name="region",
            expression="${ref(orders).region_id}"
        )

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
            ),
            interactions=[
                InsightInteraction(
                    split="?{${ref(region)}}"
                )
            ],
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            dimensions=[dimension],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()
        builder = InsightQueryBuilder(insight, dag)

        # Should find the region dimension referenced in the split
        referenced_names = {obj.name for obj in builder.referenced_objects if hasattr(obj, 'name')}
        assert "region" in referenced_names

    def test_collect_referenced_objects_with_no_interactions(self):
        """Test that no objects are collected when there are no interactions."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
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
        builder = InsightQueryBuilder(insight, dag)

        # Should find no referenced objects when there are no interactions
        assert len(builder.referenced_objects) == 0

    def test_find_all_models_single_model(self):
        """Test finding all models with a single model."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
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
        builder = InsightQueryBuilder(insight, dag)

        # Should find the orders model
        assert len(builder.all_models) == 1
        assert builder.all_models[0].name == "orders"

    def test_find_all_models_with_metrics(self):
        """Test finding all models when metrics reference a model."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        revenue_metric = Metric(
            name="revenue",
            expression="SUM(${ref(orders).amount})"
        )

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(revenue)}}",
            ),
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            metrics=[revenue_metric],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()
        builder = InsightQueryBuilder(insight, dag)

        # Should find the orders model (referenced by both insight props and metric)
        assert len(builder.all_models) >= 1
        model_names = [m.name for m in builder.all_models]
        assert "orders" in model_names

    def test_find_all_models_multiple_models(self):
        """Test finding all models with multiple models referenced through metrics."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        users_model = SqlModel(
            name="users",
            sql="SELECT * FROM users",
            source=f"ref({source.name})",
        )

        # Metric that references orders
        revenue_metric = Metric(
            name="revenue",
            expression="SUM(${ref(orders).amount})"
        )

        # Dimension that references users
        user_region = Dimension(
            name="user_region",
            expression="${ref(users).region}"
        )

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(user_region)}}",
                y="?{${ref(revenue)}}",
            ),
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, users_model],
            metrics=[revenue_metric],
            dimensions=[user_region],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()
        builder = InsightQueryBuilder(insight, dag)

        # Should find both models referenced through metric and dimension
        assert len(builder.all_models) >= 2
        model_names = [m.name for m in builder.all_models]
        assert "orders" in model_names
        assert "users" in model_names

    def test_collect_multiple_references_in_single_interaction(self):
        """Test collecting multiple object references from a single interaction."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )
        users_model = SqlModel(
            name="users",
            sql="SELECT * FROM users",
            source=f"ref({source.name})",
        )

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
            ),
            interactions=[
                InsightInteraction(
                    filter="?{${ref(orders).status} = 'shipped' AND ${ref(users).active} = true}"
                )
            ],
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, users_model],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()
        builder = InsightQueryBuilder(insight, dag)

        # Should find both orders and users models
        referenced_names = {obj.name for obj in builder.referenced_objects if hasattr(obj, 'name')}
        assert "orders" in referenced_names
        assert "users" in referenced_names
