"""Tests for metric resolution in InsightTokenizer."""

import pytest
from visivo.query.insight_tokenizer import InsightTokenizer
from visivo.models.insight import Insight
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.sqlite_source import SqliteSource
from visivo.models.metric import Metric
from visivo.models.project import Project


class TestInsightTokenizerMetrics:
    """Test suite for metric resolution in InsightTokenizer."""

    def test_resolve_simple_metric_reference(self):
        """Test resolving a simple metric reference in an insight."""
        # Create metrics
        total_revenue_metric = Metric(name="total_revenue", expression="SUM(amount)")
        order_count_metric = Metric(name="order_count", expression="COUNT(*)")

        # Create a source
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        # Create a model with metrics
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source="ref(test_source)",
            metrics=[total_revenue_metric, order_count_metric],
        )

        # Create an insight that references the model by name
        insight = Insight(
            name="revenue_insight",
            model="ref(orders)",
            props={
                "type": "scatter",
                "x": "?{date}",
                "y": "?{${ref(orders).total_revenue}}",
            },
        )

        # Create a project with all components
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            insights=[insight],
        )

        # Get the project's DAG
        dag = project.dag()

        # Tokenize the insight
        tokenizer = InsightTokenizer(insight=insight, model=model, source=source, dag=dag)

        # Check that the metric reference was resolved
        assert "props.y" in tokenizer.select_items
        assert tokenizer.select_items["props.y"] == "(SUM(amount))"

    def test_resolve_multiple_metric_references(self):
        """Test resolving multiple metric references in an insight."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        model = SqlModel(
            name="sales",
            sql="SELECT * FROM sales_table",
            source="ref(test_source)",
            metrics=[
                Metric(name="total_sales", expression="SUM(amount)"),
                Metric(name="avg_sale", expression="AVG(amount)"),
                Metric(name="sale_count", expression="COUNT(DISTINCT order_id)"),
            ],
        )

        insight = Insight(
            name="sales_analysis",
            model="ref(sales)",
            props={
                "type": "bar",
                "x": "?{region}",
                "y": "?{${ref(sales).total_sales}}",
                "text": "?{${ref(sales).avg_sale}}",
            },
        )

        # Create a project with all components
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            insights=[insight],
        )

        # Get the project's DAG
        dag = project.dag()

        tokenizer = InsightTokenizer(insight=insight, model=model, source=source, dag=dag)

        # Check all metric references were resolved
        assert tokenizer.select_items["props.y"] == "(SUM(amount))"
        assert tokenizer.select_items["props.text"] == "(AVG(amount))"

    def test_metric_in_interaction_filter(self):
        """Test resolving metric references in interaction filters."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        model = SqlModel(
            name="products",
            sql="SELECT * FROM products_table",
            source="ref(test_source)",
            metrics=[
                Metric(name="total_quantity", expression="SUM(quantity)"),
            ],
        )

        insight = Insight(
            name="product_insight",
            model="ref(products)",
            props={
                "type": "scatter",
                "x": "?{product_name}",
                "y": "?{price}",
            },
            interactions=[{"filter": "?{${ref(products).total_quantity} > 100}"}],
        )

        # Create a project with all components
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            insights=[insight],
        )

        # Get the project's DAG
        dag = project.dag()

        tokenizer = InsightTokenizer(insight=insight, model=model, source=source, dag=dag)

        # Check that the metric in the filter was resolved
        tokenized = tokenizer.tokenize()
        assert len(tokenized.interactions) > 0
        assert "(SUM(quantity)) > 100" in tokenized.interactions[0]["filter"]

    def test_metric_in_interaction_sort(self):
        """Test resolving metric references in interaction sort."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        model = SqlModel(
            name="customers",
            sql="SELECT * FROM customers_table",
            source="ref(test_source)",
            metrics=[
                Metric(name="lifetime_value", expression="SUM(total_spent)"),
            ],
        )

        insight = Insight(
            name="customer_insight",
            model="ref(customers)",
            props={
                "type": "bar",
                "x": "?{customer_name}",
                "y": "?{${ref(customers).lifetime_value}}",
            },
            interactions=[{"sort": "?{${ref(customers).lifetime_value} DESC}"}],
        )

        # Create a project with all components
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            insights=[insight],
        )

        # Get the project's DAG
        dag = project.dag()

        tokenizer = InsightTokenizer(insight=insight, model=model, source=source, dag=dag)

        # Check that the metric in sort was resolved
        tokenized = tokenizer.tokenize()
        assert tokenized.sort_expressions is not None
        assert len(tokenized.sort_expressions) == 1
        assert "(SUM(total_spent)) DESC" in tokenized.sort_expressions[0]

    def test_nonexistent_metric_reference(self):
        """Test that non-existent metric references are left unchanged."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source="ref(test_source)",
            metrics=[
                Metric(name="total_revenue", expression="SUM(amount)"),
            ],
        )

        insight = Insight(
            name="bad_insight",
            model="ref(orders)",
            props={
                "type": "scatter",
                "x": "?{date}",
                "y": "?{${ref(orders).nonexistent_metric}}",
            },
        )

        # Create a project with all components
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            insights=[insight],
        )

        # Get the project's DAG
        dag = project.dag()

        tokenizer = InsightTokenizer(insight=insight, model=model, source=source, dag=dag)

        # Non-existent metric reference should fall back to field reference
        assert tokenizer.select_items["props.y"] == "orders.nonexistent_metric"

    def test_complex_metric_expression(self):
        """Test resolving complex metric expressions."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        model = SqlModel(
            name="analytics",
            sql="SELECT * FROM analytics_table",
            source="ref(test_source)",
            metrics=[
                Metric(
                    name="conversion_rate",
                    expression="COUNT(DISTINCT CASE WHEN converted THEN user_id END) * 100.0 / COUNT(DISTINCT user_id)",
                ),
            ],
        )

        insight = Insight(
            name="conversion_insight",
            model="ref(analytics)",
            props={
                "type": "indicator",
                "value": "?{${ref(analytics).conversion_rate}}",
            },
        )

        # Create a project with all components
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            insights=[insight],
        )

        # Get the project's DAG
        dag = project.dag()

        tokenizer = InsightTokenizer(insight=insight, model=model, source=source, dag=dag)

        # Complex metric should be wrapped in parentheses
        expected = "(COUNT(DISTINCT CASE WHEN converted THEN user_id END) * 100.0 / COUNT(DISTINCT user_id))"
        assert tokenizer.select_items["props.value"] == expected

    def test_metric_in_interaction_split(self):
        """Test resolving metric references in interaction split."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        model = SqlModel(
            name="regions",
            sql="SELECT * FROM regions_table",
            source="ref(test_source)",
            metrics=[
                Metric(name="total_sales", expression="SUM(sales)"),
            ],
        )

        insight = Insight(
            name="region_insight",
            model="ref(regions)",
            props={
                "type": "bar",
                "x": "?{region}",
                "y": "?{${ref(regions).total_sales}}",
            },
            interactions=[{"split": "?{region}"}],
        )

        # Create a project with all components
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            insights=[insight],
        )

        # Get the project's DAG
        dag = project.dag()

        tokenizer = InsightTokenizer(insight=insight, model=model, source=source, dag=dag)

        # Check that split column is identified (no metric resolution needed for simple column reference)
        tokenized = tokenizer.tokenize()
        assert tokenized.split_column == "region"
