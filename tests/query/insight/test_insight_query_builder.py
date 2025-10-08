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
        assert len(builder._objects_referenced_by_interactions) == 0

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
        assert len(builder._referenced_models) == 1
        assert builder._referenced_models[0].name == "orders"

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
        assert len(builder._referenced_models) >= 1
        model_names = [m.name for m in builder._referenced_models]
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
        assert len(builder._referenced_models) >= 2
        model_names = [m.name for m in builder._referenced_models]
        assert "orders" in model_names
        assert "users" in model_names

    def test_get_sqlglot_dialect(self):
        """Test getting the SQLGlot dialect from the source."""
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

        # Should get the dialect from the source
        dialect = builder._get_sqlglot_dialect()
        assert dialect is not None
        assert isinstance(dialect, str)

    def test_build_models_ctes_no_dimensions(self):
        """Test building CTEs for models without dimensions."""
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
        builder = InsightQueryBuilder(insight, dag)

        # Build CTEs
        ctes = builder.build_models_ctes()

        # Should have CTE for orders
        assert "orders" in ctes
        # Without dimensions, should be the base SQL
        assert ctes["orders"] == "SELECT * FROM orders_table"

    def test_build_models_ctes_with_dimensions(self):
        """Test building CTEs for models with nested dimensions."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
            dimensions=[
                Dimension(name="order_year", expression="YEAR(order_date)"),
                Dimension(name="total_price", expression="quantity * price"),
            ],
        )

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).order_year}}",
                y="?{${ref(orders).total_price}}",
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

        # Build CTEs
        ctes = builder.build_models_ctes()

        # Should have CTE for orders
        assert "orders" in ctes
        cte_sql = ctes["orders"]

        # Should include SELECT *
        assert "SELECT" in cte_sql.upper()
        assert "*" in cte_sql

        # Should include dimension aliases
        assert "order_year" in cte_sql
        assert "total_price" in cte_sql

        # Should include dimension expressions
        assert "YEAR(order_date)" in cte_sql or "YEAR" in cte_sql
        assert "quantity * price" in cte_sql or "quantity" in cte_sql

    def test_build_models_ctes_with_specific_columns_and_dimensions(self):
        """Test building CTEs for models with specific columns (not *) and dimensions."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT order_id, order_date, quantity, price FROM orders_table",
            source=f"ref({source.name})",
            dimensions=[
                Dimension(name="order_year", expression="YEAR(order_date)"),
                Dimension(name="total_price", expression="quantity * price"),
            ],
        )

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).order_year}}",
                y="?{${ref(orders).total_price}}",
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

        # Build CTEs
        ctes = builder.build_models_ctes()

        # Should have CTE for orders
        assert "orders" in ctes
        cte_sql = ctes["orders"]

        # Should preserve original columns
        assert "order_id" in cte_sql
        assert "order_date" in cte_sql
        assert "quantity" in cte_sql
        assert "price" in cte_sql

        # Should include dimension aliases
        assert "order_year" in cte_sql
        assert "total_price" in cte_sql

        # Should NOT have SELECT * since base SQL has specific columns
        # The base SQL columns should be preserved
        assert "FROM orders_table" in cte_sql

    def test_build_models_ctes_multiple_models(self):
        """Test building CTEs for multiple models."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
            dimensions=[
                Dimension(name="order_year", expression="YEAR(order_date)"),
            ],
        )
        users_model = SqlModel(
            name="users",
            sql="SELECT * FROM users_table",
            source=f"ref({source.name})",
            dimensions=[
                Dimension(name="user_region", expression="UPPER(region)"),
            ],
        )

        revenue_metric = Metric(
            name="revenue",
            expression="SUM(${ref(orders).amount})"
        )
        user_dim = Dimension(
            name="user_name",
            expression="${ref(users).name}"
        )

        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(user_name)}}",
                y="?{${ref(revenue)}}",
            ),
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, users_model],
            metrics=[revenue_metric],
            dimensions=[user_dim],
            insights=[insight],
            dashboards=[],
        )

        dag = project.dag()
        builder = InsightQueryBuilder(insight, dag)

        # Build CTEs
        ctes = builder.build_models_ctes()

        # Should have CTEs for both models
        assert "orders" in ctes
        assert "users" in ctes

        # Orders CTE should include its dimension
        assert "order_year" in ctes["orders"]

        # Users CTE should include its dimension
        assert "user_region" in ctes["users"]
