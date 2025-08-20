"""Tests for compile-time metric and relation validation."""

import pytest
import tempfile
import os
from pathlib import Path
from visivo.commands.compile_phase import compile_phase
from visivo.parsers.core_parser import CoreParser


class TestCompileValidation:
    """Test suite for compile-time validation of metrics and relations."""

    def test_valid_metrics_compile_successfully(self):
        """Test that valid metrics compile without errors."""
        yaml_content = """
name: test_project

sources:
  - name: test_db
    type: sqlite
    database: ":memory:"

models:
  - name: orders
    sql: SELECT * FROM orders_table
    source: ${ref(test_db)}
    metrics:
      - name: total_revenue
        expression: "SUM(amount)"
      - name: order_count
        expression: "COUNT(*)"
    dimensions:
      - name: order_month
        expression: "DATE_TRUNC('month', order_date)"

metrics:
  - name: avg_order_value
    expression: "SUM(amount) / COUNT(*)"
    description: "Average order value"
"""

        with tempfile.TemporaryDirectory() as temp_dir:
            # Write YAML file
            yaml_file = Path(temp_dir) / "project.visivo.yml"
            yaml_file.write_text(yaml_content)

            # Create output directory
            output_dir = Path(temp_dir) / ".visivo"
            output_dir.mkdir()

            # Compile should succeed
            project = compile_phase(
                default_source=None,
                working_dir=str(temp_dir),
                output_dir=str(output_dir),
            )

            assert project is not None
            assert project.name == "test_project"

            # Check that project.json was created
            assert (output_dir / "project.json").exists()
            assert (output_dir / "explorer.json").exists()
            assert (output_dir / "error.json").exists()

    def test_invalid_metric_expression_fails_compilation(self):
        """Test that invalid metric expressions fail compilation."""
        yaml_content = """
name: test_project

sources:
  - name: test_db
    type: sqlite
    database: ":memory:"

models:
  - name: orders
    sql: SELECT * FROM orders_table
    source: ${ref(test_db)}
    metrics:
      - name: invalid_metric
        expression: "amount * 2"  # Not an aggregate!
      - name: naked_column
        expression: "SUM(amount) + price"  # price is a naked column
"""

        with tempfile.TemporaryDirectory() as temp_dir:
            # Write YAML file
            yaml_file = Path(temp_dir) / "project.visivo.yml"
            yaml_file.write_text(yaml_content)

            # Create output directory
            output_dir = Path(temp_dir) / ".visivo"
            output_dir.mkdir()

            # Compile should fail with validation error
            with pytest.raises(ValueError) as exc_info:
                compile_phase(
                    default_source=None,
                    working_dir=str(temp_dir),
                    output_dir=str(output_dir),
                )

            assert "validation errors" in str(exc_info.value).lower()
            assert "invalid_metric" in str(exc_info.value)

            # Check that error.json contains the validation errors
            error_file = output_dir / "error.json"
            assert error_file.exists()

    def test_invalid_dimension_expression_fails_compilation(self):
        """Test that dimensions with aggregates fail compilation."""
        yaml_content = """
name: test_project

sources:
  - name: test_db
    type: sqlite
    database: ":memory:"

models:
  - name: orders
    sql: SELECT * FROM orders_table
    source: ${ref(test_db)}
    dimensions:
      - name: bad_dimension
        expression: "SUM(amount)"  # Dimensions can't have aggregates!
"""

        with tempfile.TemporaryDirectory() as temp_dir:
            # Write YAML file
            yaml_file = Path(temp_dir) / "project.visivo.yml"
            yaml_file.write_text(yaml_content)

            # Create output directory
            output_dir = Path(temp_dir) / ".visivo"
            output_dir.mkdir()

            # Compile should fail with validation error
            with pytest.raises(ValueError) as exc_info:
                compile_phase(
                    default_source=None,
                    working_dir=str(temp_dir),
                    output_dir=str(output_dir),
                )

            assert "validation errors" in str(exc_info.value).lower()
            assert "bad_dimension" in str(exc_info.value)
            assert "aggregate" in str(exc_info.value).lower()

    def test_invalid_relation_condition_fails_compilation(self):
        """Test that invalid relation conditions fail compilation."""
        yaml_content = """
name: test_project

sources:
  - name: test_db
    type: sqlite
    database: ":memory:"

models:
  - name: orders
    sql: SELECT * FROM orders_table
    source: ${ref(test_db)}
  - name: users
    sql: SELECT * FROM users_table
    source: ${ref(test_db)}

relations:
  - name: bad_relation
    left_model: orders
    right_model: users
    condition: "${ref(orders).user_id} = ${ref(orders).id}"  # Doesn't reference users!
"""

        with tempfile.TemporaryDirectory() as temp_dir:
            # Write YAML file
            yaml_file = Path(temp_dir) / "project.visivo.yml"
            yaml_file.write_text(yaml_content)

            # Create output directory
            output_dir = Path(temp_dir) / ".visivo"
            output_dir.mkdir()

            # Compile should fail with validation error
            with pytest.raises(ValueError) as exc_info:
                compile_phase(
                    default_source=None,
                    working_dir=str(temp_dir),
                    output_dir=str(output_dir),
                )

            assert "validation errors" in str(exc_info.value).lower()
            assert "bad_relation" in str(exc_info.value)
            assert "users" in str(exc_info.value)

    def test_complex_valid_project_compiles(self):
        """Test that a complex project with all features compiles successfully."""
        yaml_content = """
name: analytics_project

sources:
  - name: db
    type: sqlite
    database: ":memory:"

models:
  - name: users
    sql: SELECT * FROM users_table
    source: ${ref(db)}
    metrics:
      - name: total_users
        expression: "COUNT(DISTINCT id)"
  
  - name: orders
    sql: SELECT * FROM orders_table
    source: ${ref(db)}
    metrics:
      - name: total_revenue
        expression: "SUM(amount)"
      - name: order_count
        expression: "COUNT(*)"
    dimensions:
      - name: order_month
        expression: "DATE_TRUNC('month', order_date)"
      - name: is_high_value
        expression: "CASE WHEN amount > 1000 THEN true ELSE false END"

metrics:
  - name: revenue_per_user
    expression: "SUM(amount) / COUNT(DISTINCT user_id)"
    description: "Average revenue per user"

dimensions:
  - name: fiscal_quarter
    expression: "CONCAT('Q', QUARTER(date))"

relations:
  - name: orders_to_users
    left_model: orders
    right_model: users
    join_type: inner
    condition: "${ref(orders).user_id} = ${ref(users).id}"
"""

        with tempfile.TemporaryDirectory() as temp_dir:
            # Write YAML file
            yaml_file = Path(temp_dir) / "project.visivo.yml"
            yaml_file.write_text(yaml_content)

            # Create output directory
            output_dir = Path(temp_dir) / ".visivo"
            output_dir.mkdir()

            # Compile should succeed
            project = compile_phase(
                default_source=None,
                working_dir=str(temp_dir),
                output_dir=str(output_dir),
            )

            assert project is not None
            assert project.name == "analytics_project"
            assert len(project.models) == 2
            assert len(project.metrics) == 1
            assert len(project.dimensions) == 1
            assert len(project.relations) == 1
