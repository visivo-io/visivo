"""Integration tests for Project model with metrics and relations."""

import pytest
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.metric import Metric
from visivo.models.relation import Relation
from visivo.models.dimension import Dimension


class TestProjectWithMetrics:
    """Test suite for Project model with metrics layer features."""

    def test_project_with_global_metrics(self):
        """Test creating a project with global metrics."""
        project = Project(
            name="test_project",
            metrics=[
                Metric(
                    name="revenue_per_user",
                    expression="${ref(orders).total_revenue} / ${ref(users).total_users}",
                    description="Average revenue per user",
                ),
                Metric(
                    name="conversion_rate",
                    expression="${ref(signups).count} / ${ref(visits).count}",
                    description="Signup conversion rate",
                ),
            ],
        )

        assert len(project.metrics) == 2
        assert project.metrics[0].name == "revenue_per_user"
        assert project.metrics[1].name == "conversion_rate"

    def test_project_with_relations(self):
        """Test creating a project with relations."""
        project = Project(
            name="test_project",
            relations=[
                Relation(
                    name="orders_to_users",
                    left_model="orders",
                    right_model="users",
                    join_type="inner",
                    condition="${ref(orders).user_id} = ${ref(users).id}",
                ),
                Relation(
                    name="orders_to_products",
                    left_model="orders",
                    right_model="products",
                    join_type="left",
                    condition="${ref(orders).product_id} = ${ref(products).id}",
                ),
            ],
        )

        assert len(project.relations) == 2
        assert project.relations[0].name == "orders_to_users"
        assert project.relations[0].join_type == "inner"
        assert project.relations[1].name == "orders_to_products"
        assert project.relations[1].join_type == "left"

    def test_sql_model_with_metrics_and_dimensions(self):
        """Test SqlModel with model-scoped metrics and dimensions."""
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            metrics=[
                Metric(
                    name="total_revenue",
                    expression="SUM(amount)",
                    description="Total revenue from orders",
                ),
                Metric(
                    name="order_count", expression="COUNT(*)", description="Total number of orders"
                ),
            ],
            dimensions=[
                Dimension(
                    name="order_month",
                    expression="DATE_TRUNC('month', order_date)",
                    description="Month of the order",
                ),
                Dimension(
                    name="is_high_value",
                    expression="CASE WHEN amount > 1000 THEN true ELSE false END",
                    description="High value order flag",
                ),
            ],
        )

        assert len(model.metrics) == 2
        assert model.metrics[0].name == "total_revenue"
        assert model.metrics[0].expression == "SUM(amount)"

        assert len(model.dimensions) == 2
        assert model.dimensions[0].name == "order_month"
        assert model.dimensions[1].name == "is_high_value"

    def test_model_child_items_include_metrics_and_dimensions(self):
        """Test that SqlModel.child_items() includes metrics and dimensions."""
        model = SqlModel(
            name="test_model",
            sql="SELECT * FROM test",
            metrics=[
                Metric(name="metric1", expression="COUNT(*)"),
                Metric(name="metric2", expression="SUM(value)"),
            ],
            dimensions=[Dimension(name="dim1", expression="UPPER(name)")],
        )

        child_items = model.child_items()

        # Should have default source + 2 metrics + 1 dimension = 4 items
        assert len(child_items) == 4

        # Check that metrics and dimensions are in child_items
        metric_names = [item.name for item in child_items if isinstance(item, Metric)]
        assert "metric1" in metric_names
        assert "metric2" in metric_names

        dimension_names = [item.name for item in child_items if isinstance(item, Dimension)]
        assert "dim1" in dimension_names

    def test_project_child_items_include_models(self):
        """Test that project.child_items() includes models but not configuration items."""
        from visivo.models.sources.sqlite_source import SqliteSource

        project = Project(
            name="test_project",
            metrics=[Metric(name="global_metric", expression="test")],
            relations=[
                Relation(name="test_relation", left_model="a", right_model="b", condition="test")
            ],
            models=[
                SqlModel(
                    name="model1",
                    sql="SELECT * FROM table1",
                    source=SqliteSource(name="test_source", type="sqlite", database=":memory:"),
                )
            ],
        )

        child_items = project.child_items()

        # Metrics and relations are configuration, not executable items in the DAG
        # Only models and other executable items should be in child_items
        assert not any(isinstance(item, Metric) for item in child_items)
        assert not any(isinstance(item, Relation) for item in child_items)
        assert any(isinstance(item, SqlModel) for item in child_items)

    def test_complex_project_structure(self):
        """Test a complete project with all metrics layer features."""
        from visivo.models.sources.sqlite_source import SqliteSource

        project = Project(
            name="analytics_project",
            models=[
                SqlModel(
                    name="users",
                    sql="SELECT * FROM users_table",
                    source=SqliteSource(name="users_db", type="sqlite", database=":memory:"),
                    metrics=[
                        Metric(
                            name="total_users",
                            expression="COUNT(DISTINCT id)",
                            description="Total unique users",
                        )
                    ],
                ),
                SqlModel(
                    name="orders",
                    sql="SELECT * FROM orders_table",
                    source=SqliteSource(name="orders_db", type="sqlite", database=":memory:"),
                    metrics=[
                        Metric(
                            name="total_revenue",
                            expression="SUM(amount)",
                            description="Total revenue",
                        ),
                        Metric(
                            name="avg_order_value",
                            expression="AVG(amount)",
                            description="Average order value",
                        ),
                    ],
                    dimensions=[
                        Dimension(name="order_month", expression="DATE_TRUNC('month', order_date)")
                    ],
                ),
            ],
            metrics=[
                Metric(
                    name="revenue_per_user",
                    expression="${ref(orders).total_revenue} / ${ref(users).total_users}",
                    description="Average revenue per user",
                )
            ],
            relations=[
                Relation(
                    name="orders_to_users",
                    left_model="orders",
                    right_model="users",
                    join_type="inner",
                    condition="${ref(orders).user_id} = ${ref(users).id}",
                    is_default=True,
                )
            ],
        )

        # Verify project structure
        assert project.name == "analytics_project"
        assert len(project.models) == 2
        assert len(project.metrics) == 1  # Global metrics
        assert len(project.relations) == 1

        # Verify model-scoped metrics
        users_model = project.models[0]
        assert len(users_model.metrics) == 1
        assert users_model.metrics[0].name == "total_users"

        orders_model = project.models[1]
        assert len(orders_model.metrics) == 2
        assert len(orders_model.dimensions) == 1

        # Verify global metric references model metrics
        global_metric = project.metrics[0]
        assert "${ref(orders).total_revenue}" in global_metric.expression
        assert "${ref(users).total_users}" in global_metric.expression

        # Verify relation
        relation = project.relations[0]
        assert relation.is_default is True
        assert relation.left_model == "orders"
        assert relation.right_model == "users"
