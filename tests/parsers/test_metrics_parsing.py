"""Test YAML parsing of metrics and relations."""

import pytest
import tempfile
import os
from pathlib import Path
from visivo.parsers.core_parser import CoreParser
from visivo.models.metric import Metric
from visivo.models.relation import Relation
from visivo.models.dimension import Dimension


class TestMetricsParsing:
    """Test suite for parsing metrics layer features from YAML."""

    def test_parse_project_with_metrics(self):
        """Test parsing a YAML file with metrics and relations."""
        yaml_content = """
name: test_project

sources:
  - name: test_db
    type: sqlite
    database: ":memory:"

models:
  - name: users
    sql: SELECT * FROM users_table
    source: ${ref(test_db)}
    metrics:
      - name: total_users
        expression: "COUNT(DISTINCT id)"
        description: "Total unique users"
    dimensions:
      - name: user_type
        expression: "CASE WHEN premium THEN 'premium' ELSE 'free' END"
        
  - name: orders
    sql: SELECT * FROM orders_table
    source: ${ref(test_db)}
    metrics:
      - name: total_revenue
        expression: "SUM(amount)"
      - name: order_count
        expression: "COUNT(*)"

metrics:
  - name: revenue_per_user
    expression: "${ref(orders).total_revenue} / ${ref(users).total_users}"
    description: "Average revenue per user"

relations:
  - name: orders_to_users
    left_model: orders
    right_model: users
    join_type: inner
    condition: "${ref(orders).user_id} = ${ref(users).id}"
    is_default: true
"""

        # Write YAML to temporary file
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yml", delete=False) as f:
            f.write(yaml_content)
            yaml_file = f.name

        try:
            # Parse the YAML file
            parser = CoreParser(project_file=Path(yaml_file), files=[Path(yaml_file)])
            project = parser.parse()

            # Verify project structure
            assert project.name == "test_project"

            # Check that models have metrics and dimensions
            assert len(project.models) == 2

            users_model = next(m for m in project.models if m.name == "users")
            assert len(users_model.metrics) == 1
            assert users_model.metrics[0].name == "total_users"
            assert users_model.metrics[0].expression == "COUNT(DISTINCT id)"
            assert len(users_model.dimensions) == 1
            assert users_model.dimensions[0].name == "user_type"

            orders_model = next(m for m in project.models if m.name == "orders")
            assert len(orders_model.metrics) == 2
            assert any(m.name == "total_revenue" for m in orders_model.metrics)
            assert any(m.name == "order_count" for m in orders_model.metrics)

            # Check global metrics
            assert len(project.metrics) == 1
            assert project.metrics[0].name == "revenue_per_user"
            assert "${ref(orders).total_revenue}" in project.metrics[0].expression

            # Check relations
            assert len(project.relations) == 1
            assert project.relations[0].name == "orders_to_users"
            assert project.relations[0].left_model == "orders"
            assert project.relations[0].right_model == "users"
            assert project.relations[0].is_default is True

        finally:
            # Clean up temp file
            os.unlink(yaml_file)

    def test_parse_minimal_project_without_metrics(self):
        """Test that projects without metrics still parse correctly (backward compatibility)."""
        yaml_content = """
name: simple_project

sources:
  - name: test_db
    type: sqlite
    database: ":memory:"

models:
  - name: simple_model
    sql: SELECT * FROM test_table
    source: ${ref(test_db)}

traces:
  - name: simple_trace
    model: ${ref(simple_model)}
    props:
      type: scatter
      x: ?{ date }
      y: ?{ count(*) }
"""

        with tempfile.NamedTemporaryFile(mode="w", suffix=".yml", delete=False) as f:
            f.write(yaml_content)
            yaml_file = f.name

        try:
            # Parse the YAML file
            parser = CoreParser(project_file=Path(yaml_file), files=[Path(yaml_file)])
            project = parser.parse()

            # Verify project parses correctly without metrics
            assert project.name == "simple_project"
            assert len(project.models) == 1
            assert len(project.traces) == 1

            # Metrics and relations should be empty lists
            assert project.metrics == []
            assert project.relations == []

            # Model should have empty metrics and dimensions
            model = project.models[0]
            assert model.metrics == []
            assert model.dimensions == []

        finally:
            os.unlink(yaml_file)

    def test_parse_complex_metric_expressions(self):
        """Test parsing complex metric expressions."""
        yaml_content = """
name: complex_metrics

sources:
  - name: db
    type: sqlite
    database: ":memory:"

models:
  - name: sales
    sql: SELECT * FROM sales
    source: ${ref(db)}
    metrics:
      - name: total_sales
        expression: "SUM(amount)"
      - name: avg_sale
        expression: "AVG(amount)"
      - name: sales_with_tax
        expression: "SUM(amount * 1.1)"
      - name: high_value_sales
        expression: "COUNT(DISTINCT CASE WHEN amount > 1000 THEN id END)"

metrics:
  - name: complex_ratio
    expression: "${ref(sales).total_sales} / NULLIF(${ref(sales).avg_sale}, 0)"
    description: "Complex ratio with null protection"
"""

        with tempfile.NamedTemporaryFile(mode="w", suffix=".yml", delete=False) as f:
            f.write(yaml_content)
            yaml_file = f.name

        try:
            parser = CoreParser(project_file=Path(yaml_file), files=[Path(yaml_file)])
            project = parser.parse()

            # Check complex metric expressions parsed correctly
            sales_model = project.models[0]
            assert len(sales_model.metrics) == 4

            # Find specific metrics
            metrics_by_name = {m.name: m for m in sales_model.metrics}
            assert "SUM(amount * 1.1)" in metrics_by_name["sales_with_tax"].expression
            assert "CASE WHEN" in metrics_by_name["high_value_sales"].expression

            # Check global metric with NULLIF
            assert "NULLIF" in project.metrics[0].expression

        finally:
            os.unlink(yaml_file)

    def test_parse_project_level_dimensions(self):
        """Test parsing project-level dimensions from YAML."""
        yaml_content = """
name: test_project

sources:
  - name: test_db
    type: sqlite
    database: ":memory:"

models:
  - name: orders
    sql: SELECT * FROM orders
    source: ${ref(test_db)}
    dimensions:
      - name: order_month
        expression: "DATE_TRUNC('month', order_date)"
        description: "Order month"

dimensions:
  - name: fiscal_year
    expression: "YEAR(date) + CASE WHEN MONTH(date) >= 7 THEN 1 ELSE 0 END"
    description: "Fiscal year (July-June)"
  - name: is_holiday
    expression: "date IN ('2024-01-01', '2024-07-04', '2024-12-25')"
    description: "Whether the date is a holiday"

traces:
  - name: test_trace
    model: ${ref(orders)}
    props:
      type: bar
      x: ?{ fiscal_year }
      y: ?{ count(*) }
"""

        with tempfile.NamedTemporaryFile(mode="w", suffix=".yml", delete=False) as f:
            f.write(yaml_content)
            yaml_file = f.name

        try:
            parser = CoreParser(project_file=Path(yaml_file), files=[Path(yaml_file)])
            project = parser.parse()

            # Check project-level dimensions
            assert len(project.dimensions) == 2
            assert project.dimensions[0].name == "fiscal_year"
            assert "YEAR(date)" in project.dimensions[0].expression
            assert project.dimensions[1].name == "is_holiday"

            # Check model-level dimensions
            assert len(project.models[0].dimensions) == 1
            assert project.models[0].dimensions[0].name == "order_month"

        finally:
            os.unlink(yaml_file)
