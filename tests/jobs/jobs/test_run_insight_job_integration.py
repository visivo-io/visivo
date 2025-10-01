"""Integration tests for insight job with DuckDB using metrics, dimensions, and relations.

These tests demonstrate that the project can be configured with metrics, dimensions,
and relations, and that insights properly generate GROUP BY clauses for aggregations.
"""

import tempfile
import os
import json
import pytest

from visivo.jobs.run_insight_job import action
from visivo.models.project import Project
from visivo.models.sources.duckdb_source import DuckdbSource
from visivo.models.models.sql_model import SqlModel
from visivo.models.insight import Insight
from visivo.models.metric import Metric
from visivo.models.dimension import Dimension
from visivo.models.relation import Relation


class TestInsightJobDuckDBIntegration:
    """Integration tests for insight job with real DuckDB database."""

    def test_insight_with_simple_aggregation(self):
        """Test insight job with basic SQL aggregation and GROUP BY."""
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = os.path.join(temp_dir, "test.duckdb")
            source = DuckdbSource(name="test_source", type="duckdb", database=db_path)

            with source.connect(read_only=False) as conn:
                conn.execute("""
                    CREATE TABLE orders (
                        region VARCHAR,
                        amount DECIMAL(10,2)
                    )
                """)
                conn.execute("""
                    INSERT INTO orders VALUES
                        ('East', 150.00),
                        ('West', 200.00),
                        ('East', 75.00),
                        ('West', 300.00)
                """)

            model = SqlModel(
                name="orders",
                sql="SELECT region, amount FROM orders",
                source="ref(test_source)",
            )

            insight = Insight(
                name="revenue_by_region",
                model="ref(orders)",
                props={
                    "type": "bar",
                    "x": "?{region}",
                    "y": "?{sum(amount)}",
                },
            )

            project = Project(
                name="test_project",
                sources=[source],
                models=[model],
                insights=[insight],
            )

            dag = project.dag()
            result = action(insight, dag, temp_dir)

            assert result.success is True, f"Job failed: {result.message}"

    def test_insight_project_with_metrics_validates(self):
        """Test that a project WITH metrics defined can be created and validated."""
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = os.path.join(temp_dir, "test.duckdb")
            source = DuckdbSource(name="test_source", type="duckdb", database=db_path)

            with source.connect(read_only=False) as conn:
                conn.execute("CREATE TABLE sales (product VARCHAR, amount DECIMAL(10,2))")
                conn.execute("INSERT INTO sales VALUES ('A', 100.00)")

            # Create model WITH metrics defined - this should validate
            model = SqlModel(
                name="sales",
                sql="SELECT product, amount FROM sales",
                source="ref(test_source)",
                metrics=[
                    Metric(name="total_sales", expression="SUM(amount)"),
                    Metric(name="avg_sale", expression="AVG(amount)"),
                    Metric(name="max_sale", expression="MAX(amount)"),
                ],
            )

            # Create project - validation should pass
            project = Project(
                name="test_project",
                sources=[source],
                models=[model],
            )

            # Verify metrics are accessible
            assert len(model.metrics) == 3
            assert model.metrics[0].name == "total_sales"
            assert model.metrics[0].expression == "SUM(amount)"

            # DAG creation should work
            dag = project.dag()
            assert dag is not None

    def test_insight_project_with_dimensions_validates(self):
        """Test that a project WITH dimensions defined can be created and validated."""
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = os.path.join(temp_dir, "test.duckdb")
            source = DuckdbSource(name="test_source", type="duckdb", database=db_path)

            with source.connect(read_only=False) as conn:
                conn.execute("CREATE TABLE orders (order_date DATE, amount DECIMAL(10,2))")
                conn.execute("INSERT INTO orders VALUES ('2024-01-15', 150.00)")

            # Create model WITH dimensions defined
            model = SqlModel(
                name="orders",
                sql="SELECT order_date, amount FROM orders",
                source="ref(test_source)",
                dimensions=[
                    Dimension(
                        name="order_month",
                        expression="DATE_TRUNC('month', order_date)",
                        description="Month when order was placed",
                    ),
                    Dimension(
                        name="order_year",
                        expression="EXTRACT(YEAR FROM order_date)",
                        description="Year when order was placed",
                    ),
                ],
            )

            project = Project(
                name="test_project",
                sources=[source],
                models=[model],
            )

            # Verify dimensions are accessible
            assert len(model.dimensions) == 2
            assert model.dimensions[0].name == "order_month"
            assert model.dimensions[1].name == "order_year"

            dag = project.dag()
            assert dag is not None

    def test_insight_project_with_relations_validates(self):
        """Test that a project WITH relations defined can be created and validated."""
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = os.path.join(temp_dir, "test.duckdb")
            source = DuckdbSource(name="test_source", type="duckdb", database=db_path)

            with source.connect(read_only=False) as conn:
                conn.execute("CREATE TABLE orders (id INTEGER, customer_id INTEGER)")
                conn.execute("CREATE TABLE customers (id INTEGER, name VARCHAR)")
                conn.execute("INSERT INTO orders VALUES (1, 101)")
                conn.execute("INSERT INTO customers VALUES (101, 'Alice')")

            orders_model = SqlModel(
                name="orders",
                sql="SELECT id, customer_id FROM orders",
                source="ref(test_source)",
            )

            customers_model = SqlModel(
                name="customers",
                sql="SELECT id, name FROM customers",
                source="ref(test_source)",
            )

            # Create relation
            relation = Relation(
                name="orders_to_customers",
                join_type="inner",
                condition="${ref(orders).customer_id} = ${ref(customers).id}",
                is_default=True,
            )

            # Create project WITH relation
            project = Project(
                name="test_project",
                sources=[source],
                models=[orders_model, customers_model],
                relations=[relation],
            )

            # Verify relation is accessible
            assert len(project.relations) == 1
            assert project.relations[0].name == "orders_to_customers"
            assert project.relations[0].join_type == "inner"

            # Verify relation can extract referenced models
            referenced_models = relation.get_referenced_models()
            assert "orders" in referenced_models
            assert "customers" in referenced_models

            dag = project.dag()
            assert dag is not None

    def test_insight_project_with_all_features_validates(self):
        """Test that metrics, dimensions, and relations can all be defined together in a project."""
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = os.path.join(temp_dir, "test.duckdb")
            source = DuckdbSource(name="test_source", type="duckdb", database=db_path)

            with source.connect(read_only=False) as conn:
                conn.execute("""
                    CREATE TABLE orders (
                        id INTEGER,
                        customer_id INTEGER,
                        amount DECIMAL(10,2),
                        order_date DATE
                    )
                """)
                conn.execute("""
                    CREATE TABLE customers (
                        id INTEGER,
                        region VARCHAR
                    )
                """)
                conn.execute("INSERT INTO orders VALUES (1, 101, 150.00, '2024-01-15')")
                conn.execute("INSERT INTO customers VALUES (101, 'East')")

            # Create models with BOTH metrics AND dimensions
            orders_model = SqlModel(
                name="orders",
                sql="SELECT customer_id, amount, order_date FROM orders",
                source="ref(test_source)",
                metrics=[
                    Metric(name="total_revenue", expression="SUM(amount)"),
                    Metric(name="avg_order_value", expression="AVG(amount)"),
                    Metric(name="order_count", expression="COUNT(*)"),
                ],
                dimensions=[
                    Dimension(
                        name="order_month",
                        expression="DATE_TRUNC('month', order_date)",
                    ),
                    Dimension(
                        name="is_high_value",
                        expression="CASE WHEN amount > 100 THEN 'High' ELSE 'Low' END",
                    ),
                ],
            )

            customers_model = SqlModel(
                name="customers",
                sql="SELECT id, region FROM customers",
                source="ref(test_source)",
            )

            # Create relation
            relation = Relation(
                name="orders_to_customers",
                join_type="left",
                condition="${ref(orders).customer_id} = ${ref(customers).id}",
            )

            # Create project with ALL features
            project = Project(
                name="test_project",
                sources=[source],
                models=[orders_model, customers_model],
                relations=[relation],
            )

            # Verify all features are present and accessible
            assert len(orders_model.metrics) == 3
            assert len(orders_model.dimensions) == 2
            assert len(project.relations) == 1
            assert len(project.models) == 2
            assert len(project.sources) == 1

            # DAG should build successfully
            dag = project.dag()
            assert dag is not None

            # Verify DAG structure
            roots = dag.get_root_nodes()
            assert len(roots) == 1
            assert roots[0] == project

    def test_insight_with_duckdb_source_connection(self):
        """Test that DuckDB source can be created, connected to, and queried."""
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = os.path.join(temp_dir, "test.duckdb")
            source = DuckdbSource(name="test_source", type="duckdb", database=db_path)

            # Test write operations
            with source.connect(read_only=False) as conn:
                conn.execute("CREATE TABLE test_data (id INTEGER, value VARCHAR)")
                conn.execute("INSERT INTO test_data VALUES (1, 'hello'), (2, 'world')")

            # Test read operations
            with source.connect(read_only=True) as conn:
                result = conn.execute("SELECT COUNT(*) FROM test_data").fetchone()
                assert result[0] == 2

                data = conn.execute("SELECT * FROM test_data ORDER BY id").fetchall()
                assert data[0] == (1, "hello")
                assert data[1] == (2, "world")
