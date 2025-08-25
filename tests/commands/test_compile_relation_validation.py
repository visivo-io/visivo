"""
Tests for compile-time validation of relations.
"""

import pytest
import tempfile
import os
from visivo.commands.compile_phase import compile_phase


class TestCompileRelationValidation:
    """Test compile-time validation of relations."""

    def test_relation_referencing_metric_fails(self, tmp_path):
        """Test that relations referencing metrics fail validation."""
        # Create a test project with a relation that references a metric
        project_yaml = """
name: test_project

sources:
  - name: test_source
    type: sqlite
    database: ":memory:"

models:
  - name: orders
    sql: SELECT * FROM orders
    source: ref(test_source)
    metrics:
      - name: total_revenue
        expression: SUM(revenue)
  
  - name: customers
    sql: SELECT * FROM customers
    source: ref(test_source)
    metrics:
      - name: lifetime_value
        expression: SUM(total_spent)

relations:
  - name: invalid_relation
    condition: "${ref(orders).total_revenue} = ${ref(customers).lifetime_value}"
    join_type: inner
"""

        # Write the project file
        project_file = tmp_path / "project.visivo.yml"
        project_file.write_text(project_yaml)

        # Create output directory
        output_dir = tmp_path / ".visivo"
        output_dir.mkdir()

        # Try to compile - should fail
        with pytest.raises(ValueError) as exc_info:
            compile_phase(
                default_source="test_source", working_dir=str(tmp_path), output_dir=str(output_dir)
            )

        error = str(exc_info.value)
        assert "cannot join on metric" in error.lower()
        assert "total_revenue" in error or "lifetime_value" in error

    def test_relation_referencing_non_model_fails(self, tmp_path):
        """Test that relations referencing non-models fail validation."""
        project_yaml = """
name: test_project

sources:
  - name: test_source
    type: sqlite
    database: ":memory:"

models:
  - name: orders
    sql: SELECT * FROM orders
    source: ref(test_source)

traces:
  - name: test_trace
    model: ref(orders)
    props:
      type: bar
      x: query(x)
      y: query(y)

relations:
  - name: invalid_relation
    condition: "${ref(orders).id} = ${ref(test_trace).id}"
    join_type: inner
"""

        # Write the project file
        project_file = tmp_path / "project.visivo.yml"
        project_file.write_text(project_yaml)

        # Create output directory
        output_dir = tmp_path / ".visivo"
        output_dir.mkdir()

        # Try to compile - should fail
        with pytest.raises(ValueError) as exc_info:
            compile_phase(
                default_source="test_source", working_dir=str(tmp_path), output_dir=str(output_dir)
            )

        error = str(exc_info.value)
        assert "not a valid model" in error
        assert "test_trace" in error

    def test_relation_referencing_source_fails(self, tmp_path):
        """Test that relations referencing sources directly fail validation."""
        project_yaml = """
name: test_project

sources:
  - name: test_source
    type: sqlite
    database: ":memory:"

models:
  - name: orders
    sql: SELECT * FROM orders
    source: ref(test_source)

relations:
  - name: invalid_relation
    condition: "${ref(orders).id} = ${ref(test_source).id}"
    join_type: inner
"""

        # Write the project file
        project_file = tmp_path / "project.visivo.yml"
        project_file.write_text(project_yaml)

        # Create output directory
        output_dir = tmp_path / ".visivo"
        output_dir.mkdir()

        # Try to compile - should fail
        with pytest.raises(ValueError) as exc_info:
            compile_phase(
                default_source="test_source", working_dir=str(tmp_path), output_dir=str(output_dir)
            )

        error = str(exc_info.value)
        assert "not a valid model" in error
        assert "test_source" in error

    def test_valid_relation_passes(self, tmp_path):
        """Test that valid relations pass validation."""
        project_yaml = """
name: test_project

sources:
  - name: test_source
    type: sqlite
    database: ":memory:"

models:
  - name: orders
    sql: SELECT * FROM orders
    source: ref(test_source)
  
  - name: customers
    sql: SELECT * FROM customers
    source: ref(test_source)

relations:
  - name: valid_relation
    condition: "${ref(orders).customer_id} = ${ref(customers).id}"
    join_type: inner
"""

        # Write the project file
        project_file = tmp_path / "project.visivo.yml"
        project_file.write_text(project_yaml)

        # Create output directory
        output_dir = tmp_path / ".visivo"
        output_dir.mkdir()

        # This should compile successfully
        project = compile_phase(
            default_source="test_source", working_dir=str(tmp_path), output_dir=str(output_dir)
        )

        assert project is not None
        assert len(project.relations) == 1
        assert project.relations[0].name == "valid_relation"

    def test_relation_with_dimensions_allowed(self, tmp_path):
        """Test that relations can reference dimensions (non-aggregate fields)."""
        project_yaml = """
name: test_project

sources:
  - name: test_source
    type: sqlite
    database: ":memory:"

models:
  - name: orders
    sql: SELECT * FROM orders
    source: ref(test_source)
    dimensions:
      - name: order_year
        expression: "YEAR(order_date)"
  
  - name: customers
    sql: SELECT * FROM customers
    source: ref(test_source)
    dimensions:
      - name: customer_year
        expression: "YEAR(created_date)"

relations:
  - name: year_relation
    condition: "${ref(orders).order_year} = ${ref(customers).customer_year}"
    join_type: inner
"""

        # Write the project file
        project_file = tmp_path / "project.visivo.yml"
        project_file.write_text(project_yaml)

        # Create output directory
        output_dir = tmp_path / ".visivo"
        output_dir.mkdir()

        # This should compile successfully - dimensions are allowed
        project = compile_phase(
            default_source="test_source", working_dir=str(tmp_path), output_dir=str(output_dir)
        )

        assert project is not None
        assert len(project.relations) == 1
