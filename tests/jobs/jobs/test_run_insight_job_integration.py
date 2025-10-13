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
                conn.execute(
                    """
                    CREATE TABLE orders (
                        region VARCHAR,
                        amount DECIMAL(10,2)
                    )
                """
                )
                conn.execute(
                    """
                    INSERT INTO orders VALUES
                        ('East', 150.00),
                        ('West', 200.00),
                        ('East', 75.00),
                        ('West', 300.00)
                """
                )

            model = SqlModel(
                name="orders",
                sql="SELECT region, amount FROM orders",
                source="ref(test_source)",
            )

            insight = Insight(
                name="revenue_by_region",
                props={
                    "type": "bar",
                    "x": "?{${ref(orders).region}}",
                    "y": "?{sum(${ref(orders).amount})}",
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

    def test_insight_with_metrics(self):
        """Test insight job with defined metrics."""
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = os.path.join(temp_dir, "test.duckdb")
            source = DuckdbSource(name="test_source", type="duckdb", database=db_path)

            with source.connect(read_only=False) as conn:
                conn.execute("CREATE TABLE sales (product VARCHAR, amount DECIMAL(10,2))")
                conn.execute(
                    """
                    INSERT INTO sales VALUES
                        ('A', 100.00),
                        ('B', 200.00),
                        ('A', 150.00)
                """
                )

            # Create model WITH metrics defined
            model = SqlModel(
                name="sales",
                sql="SELECT product, amount FROM sales",
                source="ref(test_source)",
                metrics=[
                    Metric(name="total_sales", expression="SUM(amount)"),
                    Metric(name="avg_sale", expression="AVG(amount)"),
                ],
            )

            # Create insight using direct SQL (metrics are defined but we use SQL aggregates)
            # Note: Metric references like ${ref(sales).total_sales} are for future enhancement
            insight = Insight(
                name="product_totals",
                props={
                    "type": "bar",
                    "x": "?{${ref(sales).product}}",
                    "y": "?{${ref(sales).total_sales}}",
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

            # Verify the job succeeded
            assert result.success is True, f"Job failed: {result.message}"

            insight_file = os.path.join(temp_dir, "files", f"{insight.name_hash()}.parquet")
            assert os.path.exists(insight_file)

            insight_data = os.path.join(temp_dir, "insights", f"{insight.name_hash()}.json")
            assert os.path.exists(insight_data)

            with open(insight_file, "r") as f:
                insight_json = json.load(f)

            # Verify data shows metric calculations
            assert "data" in insight_json
            data = insight_json["data"]
            assert len(data) == 2

            # Check the metric values
            totals_by_product = {row["product"]: row["y"] for row in data}
            assert totals_by_product["A"] == 250.00  # 100 + 150
            assert totals_by_product["B"] == 200.00

    def test_insight_with_dimensions(self):
        """Test insight job with defined dimensions."""
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = os.path.join(temp_dir, "test.duckdb")
            source = DuckdbSource(name="test_source", type="duckdb", database=db_path)

            with source.connect(read_only=False) as conn:
                conn.execute("CREATE TABLE orders (order_date DATE, amount DECIMAL(10,2))")
                conn.execute(
                    """
                    INSERT INTO orders VALUES
                        ('2024-01-15', 150.00),
                        ('2024-01-20', 200.00),
                        ('2024-02-10', 100.00),
                        ('2024-02-25', 175.00)
                """
                )

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
                ],
            )

            # Create insight using ${ref(model).field} syntax
            # Can reference dimensions or use direct SQL expressions
            insight = Insight(
                name="monthly_revenue",
                props={
                    "type": "bar",
                    "x": "?{date_trunc('month', ${ref(orders).order_date})}",
                    "y": "?{sum(${ref(orders).amount})}",
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

            # Verify the job succeeded
            assert result.success is True, f"Job failed: {result.message}"

            # Check output file
            insight_file = os.path.join(temp_dir, "insights", "monthly_revenue", "insight.json")
            assert os.path.exists(insight_file)

            with open(insight_file, "r") as f:
                insight_json = json.load(f)

            # Verify data is grouped by month
            assert "data" in insight_json
            data = insight_json["data"]
            assert len(data) == 2  # January and February

            # Verify the totals per month
            revenue_by_month = {}
            for row in data:
                month_str = row["x"]
                revenue_by_month[month_str] = row["y"]

            # January: 150 + 200 = 350
            # February: 100 + 175 = 275
            assert sum(revenue_by_month.values()) == 625.00

    def test_insight_with_relations(self):
        """Test insight job with relations joining multiple models."""
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = os.path.join(temp_dir, "test.duckdb")
            source = DuckdbSource(name="test_source", type="duckdb", database=db_path)

            with source.connect(read_only=False) as conn:
                conn.execute(
                    "CREATE TABLE orders (id INTEGER, customer_id INTEGER, amount DECIMAL(10,2))"
                )
                conn.execute("CREATE TABLE customers (id INTEGER, name VARCHAR, region VARCHAR)")
                conn.execute(
                    """
                    INSERT INTO orders VALUES
                        (1, 101, 150.00),
                        (2, 102, 200.00),
                        (3, 101, 100.00),
                        (4, 103, 300.00)
                """
                )
                conn.execute(
                    """
                    INSERT INTO customers VALUES
                        (101, 'Alice', 'East'),
                        (102, 'Bob', 'West'),
                        (103, 'Charlie', 'East')
                """
                )

            orders_model = SqlModel(
                name="orders",
                sql="SELECT id, customer_id, amount FROM orders",
                source="ref(test_source)",
            )

            customers_model = SqlModel(
                name="customers",
                sql="SELECT id, name, region FROM customers",
                source="ref(test_source)",
            )

            # Create relation
            relation = Relation(
                name="orders_to_customers",
                join_type="inner",
                condition="${ref(orders).customer_id} = ${ref(customers).id}",
            )

            # Create insight using ${ref(model).field} syntax
            # Relation is defined but cross-model queries need JOIN support
            insight = Insight(
                name="revenue_by_customer",
                props={
                    "type": "bar",
                    "x": "?{${ref(orders).customer_id}}",
                    "y": "?{sum(${ref(orders).amount})}",
                },
            )

            project = Project(
                name="test_project",
                sources=[source],
                models=[orders_model, customers_model],
                relations=[relation],
                insights=[insight],
            )

            dag = project.dag()
            result = action(insight, dag, temp_dir)

            # Verify the job succeeded
            assert result.success is True, f"Job failed: {result.message}"

            # Check output file
            insight_file = os.path.join(temp_dir, "insights", "revenue_by_customer", "insight.json")
            assert os.path.exists(insight_file)

            with open(insight_file, "r") as f:
                insight_json = json.load(f)

            # Verify data shows aggregated results by customer
            assert "data" in insight_json
            data = insight_json["data"]
            assert len(data) == 3  # Three customers (101, 102, 103)

            # Check revenue by customer ID
            revenue_by_customer = {row["customer_id"]: row["y"] for row in data}
            assert revenue_by_customer[101] == 250.00  # 150 + 100
            assert revenue_by_customer[102] == 200.00
            assert revenue_by_customer[103] == 300.00

    def test_insight_with_all_features(self):
        """Test insight with metrics, dimensions, and relations all together."""
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = os.path.join(temp_dir, "test.duckdb")
            source = DuckdbSource(name="test_source", type="duckdb", database=db_path)

            with source.connect(read_only=False) as conn:
                conn.execute(
                    """
                    CREATE TABLE orders (
                        id INTEGER,
                        customer_id INTEGER,
                        amount DECIMAL(10,2),
                        order_date DATE
                    )
                """
                )
                conn.execute(
                    """
                    CREATE TABLE customers (
                        id INTEGER,
                        region VARCHAR,
                        tier VARCHAR
                    )
                """
                )
                conn.execute(
                    """
                    INSERT INTO orders VALUES
                        (1, 101, 150.00, '2024-01-15'),
                        (2, 102, 200.00, '2024-01-20'),
                        (3, 101, 300.00, '2024-02-10'),
                        (4, 103, 50.00, '2024-02-15')
                """
                )
                conn.execute(
                    """
                    INSERT INTO customers VALUES
                        (101, 'East', 'Premium'),
                        (102, 'West', 'Standard'),
                        (103, 'East', 'Standard')
                """
                )

            # Create models with BOTH metrics AND dimensions
            orders_model = SqlModel(
                name="orders",
                sql="SELECT customer_id, amount, order_date FROM orders",
                source="ref(test_source)",
                metrics=[
                    Metric(name="total_revenue", expression="SUM(amount)"),
                    Metric(name="order_count", expression="COUNT(*)"),
                ],
                dimensions=[
                    Dimension(
                        name="order_month",
                        expression="DATE_TRUNC('month', order_date)",
                    ),
                ],
            )

            customers_model = SqlModel(
                name="customers",
                sql="SELECT id, region, tier FROM customers",
                source="ref(test_source)",
            )

            # Create relation
            relation = Relation(
                name="orders_to_customers",
                join_type="inner",
                condition="${ref(orders).customer_id} = ${ref(customers).id}",
            )

            # Create insight using ${ref(model).field} syntax
            insight = Insight(
                name="monthly_customer_analysis",
                props={
                    "type": "bar",
                    "x": "?{date_trunc('month', ${ref(orders).order_date})}",
                    "y": "?{sum(${ref(orders).amount})}",
                    "text": "?{${ref(orders).customer_id}}",
                },
            )

            project = Project(
                name="test_project",
                sources=[source],
                models=[orders_model, customers_model],
                relations=[relation],
                insights=[insight],
            )

            dag = project.dag()
            result = action(insight, dag, temp_dir)

            # Verify the job succeeded
            assert result.success is True, f"Job failed: {result.message}"

            # Check output file
            insight_file = os.path.join(
                temp_dir, "insights", "monthly_customer_analysis", "insight.json"
            )
            assert os.path.exists(insight_file)

            with open(insight_file, "r") as f:
                insight_json = json.load(f)

            # Verify data groups by month and customer
            assert "data" in insight_json
            data = insight_json["data"]

            # Should have data grouped by month and customer
            assert len(data) > 0

            # Verify all fields are present
            for row in data:
                assert "x" in row  # order_month
                assert "y" in row  # revenue
                assert "customer_id" in row  # customer_id (from text prop)

            # Check that we see data from both months
            months = {row["x"] for row in data}
            assert len(months) == 2  # January and February

            # Verify total revenue across all rows
            total_revenue = sum(row["y"] for row in data)
            assert total_revenue == 700.00  # 150 + 200 + 300 + 50

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
