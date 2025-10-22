"""
Tests for visivo.query.resolvers.field_resolver module.

This module tests the FieldResolver class which is responsible for:
- Recursively resolving ${ref(...)} patterns in SQL expressions
- Handling implicit dimensions (raw columns)
- Resolving model-scoped and global metrics/dimensions
- Qualifying column references with table aliases
"""

import pytest
import json
import os
from visivo.query.resolvers.field_resolver import FieldResolver
from visivo.models.base.project_dag import ProjectDag
from visivo.models.models.sql_model import SqlModel
from visivo.models.metric import Metric
from visivo.models.dimension import Dimension
from visivo.models.sources.duckdb_source import DuckdbSource
from visivo.models.project import Project


class TestFieldResolverSchemaLoading:
    """Test schema loading and caching functionality."""

    def test_load_model_schema_success(self, tmpdir):
        """Test successfully loading a schema file."""
        # Create a mock schema file
        schema_dir = tmpdir.mkdir("schema").mkdir("test_model")
        schema_file = schema_dir.join("schema.json")
        schema_data = {"model_hash_123": {"id": "INTEGER", "name": "VARCHAR", "amount": "DECIMAL"}}
        schema_file.write(json.dumps(schema_data))

        # Create a simple DAG
        dag = ProjectDag()
        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Load the schema
        loaded_schema = resolver._load_model_schema("test_model")

        assert loaded_schema == schema_data
        assert "model_hash_123" in loaded_schema
        assert loaded_schema["model_hash_123"]["id"] == "INTEGER"

    def test_load_model_schema_caching(self, tmpdir):
        """Test that schemas are cached after first load."""
        # Create a mock schema file
        schema_dir = tmpdir.mkdir("schema").mkdir("test_model")
        schema_file = schema_dir.join("schema.json")
        schema_data = {"model_hash_123": {"id": "INTEGER"}}
        schema_file.write(json.dumps(schema_data))

        dag = ProjectDag()
        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Load schema twice
        schema1 = resolver._load_model_schema("test_model")
        schema2 = resolver._load_model_schema("test_model")

        # Should be the same object (cached)
        assert schema1 is schema2
        assert "test_model" in resolver._schema_cache

    def test_load_model_schema_file_not_found(self, tmpdir):
        """Test handling of missing schema files."""
        dag = ProjectDag()
        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Try to load non-existent schema
        result = resolver._load_model_schema("nonexistent_model")

        assert result is None

    def test_load_model_schema_invalid_json(self, tmpdir):
        """Test handling of malformed JSON in schema files."""
        # Create a schema file with invalid JSON
        schema_dir = tmpdir.mkdir("schema").mkdir("bad_model")
        schema_file = schema_dir.join("schema.json")
        schema_file.write("{invalid json content")

        dag = ProjectDag()
        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Try to load invalid schema
        result = resolver._load_model_schema("bad_model")

        assert result is None


class TestFieldResolverImplicitDimensions:
    """Test implicit dimension detection."""

    def test_is_implicit_dimension_valid_field(self, tmpdir):
        """Test detecting a valid implicit dimension."""
        # Setup DAG with a model
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(name="orders", sql="SELECT * FROM orders_table", source="ref(test_source)")
        project = Project(name="test_project", sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        # Create schema
        model_hash = model.name_hash()
        schema_dir = tmpdir.mkdir("schema").mkdir("orders")
        schema_file = schema_dir.join("schema.json")
        schema_data = {model_hash: {"id": "INTEGER", "amount": "DECIMAL"}}
        schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Test detection
        assert resolver._is_implicit_dimension("orders", "id") is True
        assert resolver._is_implicit_dimension("orders", "amount") is True

    def test_is_implicit_dimension_invalid_field(self, tmpdir):
        """Test rejecting an invalid field name."""
        # Setup DAG with a model
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(name="orders", sql="SELECT * FROM orders_table", source="ref(test_source)")
        project = Project(name="test_project", sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        # Create schema
        model_hash = model.name_hash()
        schema_dir = tmpdir.mkdir("schema").mkdir("orders")
        schema_file = schema_dir.join("schema.json")
        schema_data = {model_hash: {"id": "INTEGER", "amount": "DECIMAL"}}
        schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Test rejection
        assert resolver._is_implicit_dimension("orders", "nonexistent") is False

    def test_is_implicit_dimension_missing_schema(self, tmpdir):
        """Test handling missing schema gracefully."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(name="orders", sql="SELECT * FROM orders_table", source="ref(test_source)")
        project = Project(name="test_project", sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Should return False when schema doesn't exist
        assert resolver._is_implicit_dimension("orders", "id") is False


class TestFieldResolverResolveImplicitDimensions:
    """Test resolution of implicit dimensions with leading dots."""

    def test_resolve_implicit_dimension_with_leading_dot(self, tmpdir):
        """Test resolving ${ref(model).field} where field has a leading dot.

        This test verifies that when a field reference like ${ref(model).field} comes through,
        the leading dot is properly stripped when checking if the field exists in the schema.
        """
        # Setup DAG
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(name="orders", sql="SELECT * FROM orders_table", source="ref(test_source)")
        project = Project(name="test_project", sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        # Create schema in correct format: {model_hash: {column: type}}
        model_hash = model.name_hash()
        schema_dir = tmpdir.mkdir("schema").mkdir("orders")
        schema_file = schema_dir.join("schema.json")
        schema_data = {model_hash: {"x": "INTEGER", "y": "DECIMAL"}}
        schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Resolve expression - the property_path will have a leading dot (.x)
        # The bug fix strips this dot when checking the schema
        result = resolver.resolve("${ref(orders).x}")

        # Should successfully resolve and contain the field name
        assert "x" in result or "X" in result.upper()

    def test_resolve_implicit_dimension_error_message_shows_column_names(self, tmpdir):
        """Test that error messages show column names, not types."""
        # Setup DAG
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(name="orders", sql="SELECT * FROM orders_table", source="ref(test_source)")
        project = Project(name="test_project", sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        # Create schema
        model_hash = model.name_hash()
        schema_dir = tmpdir.mkdir("schema").mkdir("orders")
        schema_file = schema_dir.join("schema.json")
        schema_data = {model_hash: {"id": "INTEGER", "amount": "DECIMAL"}}
        schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Try to resolve a non-existent column
        with pytest.raises(Exception) as exc_info:
            resolver.resolve("${ref(orders).nonexistent_column}")

        error_message = str(exc_info.value)
        # Should show column NAMES (id, amount) not TYPES (INTEGER, DECIMAL)
        assert "id" in error_message or "amount" in error_message
        assert "INTEGER" not in error_message
        assert "DECIMAL" not in error_message


class TestFieldResolverResolveMetrics:
    """Test resolution of model-scoped and global metrics."""

    def test_resolve_model_scoped_metric(self, tmpdir):
        """Test resolving a metric defined on a model."""
        # Setup DAG
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source="ref(test_source)",
            metrics=[Metric(name="total_amount", expression="SUM(amount)")],
        )
        project = Project(name="test_project", sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        # Create schema
        model_hash = model.name_hash()
        schema_dir = tmpdir.mkdir("schema").mkdir("orders")
        schema_file = schema_dir.join("schema.json")
        schema_data = {model_hash: {"id": "INTEGER", "amount": "DECIMAL"}}
        schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Resolve metric reference
        result = resolver.resolve("${ref(orders).total_amount}")

        # Should contain the SUM expression
        assert "SUM" in result.upper() or "sum" in result
        assert "amount" in result


class TestFieldResolverComplexExpressions:
    """Test resolution of complex expressions with multiple refs."""

    def test_resolve_multiple_refs(self, tmpdir):
        """Test resolving expressions with multiple ${ref(...)} patterns."""
        # Setup DAG with multiple models
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model1 = SqlModel(
            name="orders", sql="SELECT * FROM orders_table", source="ref(test_source)"
        )
        model2 = SqlModel(name="users", sql="SELECT * FROM users_table", source="ref(test_source)")
        project = Project(
            name="test_project", sources=[source], models=[model1, model2], dashboards=[]
        )
        dag = project.dag()

        # Create schemas for both models
        schema_base_dir = tmpdir.mkdir("schema")
        for model_name, fields in [
            ("orders", {"id": "INTEGER", "user_id": "INTEGER"}),
            ("users", {"id": "INTEGER", "name": "VARCHAR"}),
        ]:
            model_obj = model1 if model_name == "orders" else model2
            model_hash = model_obj.name_hash()
            schema_dir = schema_base_dir.mkdir(model_name)
            schema_file = schema_dir.join("schema.json")
            schema_data = {model_hash: fields}
            schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Resolve expression with multiple refs
        result = resolver.resolve("${ref(orders).user_id} = ${ref(users).id}")

        # Should contain references to both models
        assert "user_id" in result
        assert "id" in result

    def test_resolve_nested_expression(self, tmpdir):
        """Test resolving nested metric expressions."""
        # Setup DAG
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source="ref(test_source)",
            metrics=[Metric(name="avg_amount", expression="AVG(amount)")],
        )
        project = Project(name="test_project", sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        # Create schema
        model_hash = model.name_hash()
        schema_dir = tmpdir.mkdir("schema").mkdir("orders")
        schema_file = schema_dir.join("schema.json")
        schema_data = {model_hash: {"id": "INTEGER", "amount": "DECIMAL"}}
        schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Resolve nested metric
        result = resolver.resolve("${ref(orders).avg_amount}")

        assert "AVG" in result.upper() or "avg" in result


class TestFieldResolverEdgeCases:
    """Test edge cases and error handling."""

    def test_resolve_with_missing_model(self, tmpdir):
        """Test error handling when model doesn't exist in DAG."""
        dag = ProjectDag()
        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Try to resolve reference to non-existent model
        with pytest.raises(ValueError):
            resolver.resolve("${ref(nonexistent_model).field}")

    def test_resolve_with_missing_schema(self, tmpdir):
        """Test error handling when schema file is missing."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(name="orders", sql="SELECT * FROM orders_table", source="ref(test_source)")
        project = Project(name="test_project", sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Try to resolve field when schema doesn't exist
        with pytest.raises(Exception) as exc_info:
            resolver.resolve("${ref(orders).field}")

        assert "Missing schema" in str(exc_info.value) or "Schema not found" in str(exc_info.value)

    def test_resolve_empty_expression(self, tmpdir):
        """Test resolving an empty expression."""
        dag = ProjectDag()
        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Empty expression should return just an alias
        result = resolver.resolve("")

        assert " AS " in result

    def test_resolve_expression_without_refs(self, tmpdir):
        """Test resolving an expression without any ${ref(...)} patterns."""
        dag = ProjectDag()
        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Expression without refs should pass through with alias
        result = resolver.resolve("SELECT 1 + 1")

        assert "SELECT 1 + 1" in result
        assert " AS " in result


class TestFieldResolverQualification:
    """Test expression qualification with table aliases."""

    def test_qualify_simple_column(self, tmpdir):
        """Test qualifying a simple column reference."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(name="orders", sql="SELECT * FROM orders_table", source="ref(test_source)")
        project = Project(name="test_project", sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        # Create schema
        model_hash = model.name_hash()
        schema_dir = tmpdir.mkdir("schema").mkdir("orders")
        schema_file = schema_dir.join("schema.json")
        schema_data = {model_hash: {"id": "INTEGER", "amount": "DECIMAL"}}
        schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Qualify simple column
        qualified = resolver._qualify_expression("id", model)

        # Should contain the model hash and column name
        assert "id" in qualified

    def test_qualify_expression_with_function(self, tmpdir):
        """Test qualifying an expression containing SQL functions."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(name="orders", sql="SELECT * FROM orders_table", source="ref(test_source)")
        project = Project(name="test_project", sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        # Create schema
        model_hash = model.name_hash()
        schema_dir = tmpdir.mkdir("schema").mkdir("orders")
        schema_file = schema_dir.join("schema.json")
        schema_data = {model_hash: {"id": "INTEGER", "amount": "DECIMAL"}}
        schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Qualify expression with function
        qualified = resolver._qualify_expression("SUM(amount)", model)

        # Should contain SUM and amount
        assert "SUM" in qualified.upper() or "sum" in qualified
        assert "amount" in qualified


class TestFieldResolverGlobalMetricsAndDimensions:
    """Test resolution of globally scoped metrics and dimensions."""

    def test_resolve_global_metric(self, tmpdir):
        """Test resolving a global metric reference ${ref(metric_name)}."""
        # Setup DAG with a model and a global metric
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source="ref(test_source)",
        )
        # Global metric defined at project level - must reference through model
        global_metric = Metric(name="composite_metric", expression="SUM(${ref(orders).amount}) * 2")
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            metrics=[global_metric],
            dashboards=[],
        )
        dag = project.dag()

        # Create schema for the base model
        model_hash = model.name_hash()
        schema_dir = tmpdir.mkdir("schema").mkdir("orders")
        schema_file = schema_dir.join("schema.json")
        schema_data = {model_hash: {"id": "INTEGER", "amount": "DECIMAL"}}
        schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Resolve global metric reference
        result = resolver.resolve("${ref(composite_metric)}")

        # Should contain the metric expression
        assert "SUM" in result.upper() or "sum" in result
        assert "amount" in result
        assert "*" in result
        assert "2" in result

    def test_resolve_global_dimension(self, tmpdir):
        """Test resolving a global dimension reference ${ref(dimension_name)}."""
        # Setup DAG with a model and a global dimension
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source="ref(test_source)",
        )
        # Global dimension defined at project level - must reference through model
        global_dimension = Dimension(name="order_status", expression="UPPER(${ref(orders).status})")
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dimensions=[global_dimension],
            dashboards=[],
        )
        dag = project.dag()

        # Create schema for the base model
        model_hash = model.name_hash()
        schema_dir = tmpdir.mkdir("schema").mkdir("orders")
        schema_file = schema_dir.join("schema.json")
        schema_data = {model_hash: {"id": "INTEGER", "status": "VARCHAR"}}
        schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Resolve global dimension reference
        result = resolver.resolve("${ref(order_status)}")

        # Should contain the dimension expression
        assert "UPPER" in result.upper() or "upper" in result
        assert "status" in result

    def test_resolve_expression_with_global_metric(self, tmpdir):
        """Test resolving a complex expression containing a global metric reference."""
        # Setup DAG
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source="ref(test_source)",
        )
        global_metric = Metric(
            name="total_revenue",
            expression="SUM(${ref(orders).price} * ${ref(orders).quantity})",
        )
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            metrics=[global_metric],
            dashboards=[],
        )
        dag = project.dag()

        # Create schema
        model_hash = model.name_hash()
        schema_dir = tmpdir.mkdir("schema").mkdir("orders")
        schema_file = schema_dir.join("schema.json")
        schema_data = {model_hash: {"id": "INTEGER", "price": "DECIMAL", "quantity": "INTEGER"}}
        schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Resolve expression with global metric
        result = resolver.resolve("${ref(total_revenue)} / 100")

        # Should contain the metric expression and the division
        assert "SUM" in result.upper() or "sum" in result
        assert "price" in result
        assert "quantity" in result
        assert "/" in result
        assert "100" in result

    def test_resolve_nested_global_metric(self, tmpdir):
        """Test resolving a global metric that references another global metric."""
        # Setup DAG with nested global metrics
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(
            name="sales",
            sql="SELECT * FROM sales_table",
            source="ref(test_source)",
        )
        # First metric references a model field
        base_metric = Metric(name="gross_revenue", expression="SUM(${ref(sales).amount})")
        # Second metric references the first metric
        derived_metric = Metric(name="net_revenue", expression="${ref(gross_revenue)} * 0.9")
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            metrics=[base_metric, derived_metric],
            dashboards=[],
        )
        dag = project.dag()

        # Create schema
        model_hash = model.name_hash()
        schema_dir = tmpdir.mkdir("schema").mkdir("sales")
        schema_file = schema_dir.join("schema.json")
        schema_data = {model_hash: {"id": "INTEGER", "amount": "DECIMAL"}}
        schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Resolve nested metric reference
        result = resolver.resolve("${ref(net_revenue)}")

        # Should contain the fully resolved expression
        assert "SUM" in result.upper() or "sum" in result
        assert "amount" in result
        assert "*" in result
        assert "0.9" in result


class TestFieldResolverCaseStatements:
    """Test resolution of CASE statements with ${ref(...)} patterns."""

    def test_resolve_simple_case_with_ref(self, tmpdir):
        """Test resolving a CASE statement with a single ${ref(...)} in WHEN clause."""
        # Setup DAG
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(
            name="another_local_test_table",
            sql="SELECT * FROM test_table",
            source="ref(test_source)",
        )
        project = Project(name="test_project", sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        # Create schema
        model_hash = model.name_hash()
        schema_dir = tmpdir.mkdir("schema").mkdir("another_local_test_table")
        schema_file = schema_dir.join("schema.json")
        schema_data = {model_hash: {"new_x": "INTEGER", "name": "VARCHAR"}}
        schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Resolve CASE statement from the example
        case_expr = "case when ${ref(another_local_test_table).new_x} >= 5 then '#713B57' else '#4F494C' end"
        result = resolver.resolve(case_expr)

        # Should preserve CASE structure
        assert "CASE" in result.upper() or "case" in result
        assert "WHEN" in result.upper() or "when" in result
        assert "THEN" in result.upper() or "then" in result
        assert "ELSE" in result.upper() or "else" in result
        assert "END" in result.upper() or "end" in result

        # Should contain the qualified column reference
        assert "new_x" in result

        # Should contain the literal values
        assert "#713B57" in result or "713B57" in result
        assert "#4F494C" in result or "4F494C" in result

        # Should have an alias
        assert " AS " in result

    def test_resolve_case_with_multiple_refs(self, tmpdir):
        """Test resolving a CASE statement with multiple ${ref(...)} patterns."""
        # Setup DAG
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source="ref(test_source)",
        )
        project = Project(name="test_project", sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        # Create schema
        model_hash = model.name_hash()
        schema_dir = tmpdir.mkdir("schema").mkdir("orders")
        schema_file = schema_dir.join("schema.json")
        schema_data = {
            model_hash: {"status": "VARCHAR", "amount": "DECIMAL", "priority": "INTEGER"}
        }
        schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # CASE with multiple refs
        case_expr = """
            case
                when ${ref(orders).status} = 'urgent' and ${ref(orders).amount} > 1000 then ${ref(orders).priority} + 10
                when ${ref(orders).status} = 'normal' then ${ref(orders).priority}
                else 0
            end
        """
        result = resolver.resolve(case_expr)

        # Should preserve CASE structure
        assert "CASE" in result.upper() or "case" in result
        assert "WHEN" in result.upper() or "when" in result
        assert "END" in result.upper() or "end" in result

        # Should contain all column references
        assert "status" in result
        assert "amount" in result
        assert "priority" in result

        # Should have an alias
        assert " AS " in result

    def test_resolve_nested_case_statements(self, tmpdir):
        """Test resolving nested CASE statements with ${ref(...)} patterns."""
        # Setup DAG
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(
            name="products",
            sql="SELECT * FROM products_table",
            source="ref(test_source)",
        )
        project = Project(name="test_project", sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        # Create schema
        model_hash = model.name_hash()
        schema_dir = tmpdir.mkdir("schema").mkdir("products")
        schema_file = schema_dir.join("schema.json")
        schema_data = {model_hash: {"category": "VARCHAR", "price": "DECIMAL", "stock": "INTEGER"}}
        schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Nested CASE statements
        case_expr = """
            case
                when ${ref(products).category} = 'electronics' then
                    case
                        when ${ref(products).price} > 1000 then 'premium'
                        else 'standard'
                    end
                when ${ref(products).stock} = 0 then 'out_of_stock'
                else 'available'
            end
        """
        result = resolver.resolve(case_expr)

        # Should preserve CASE structure (will have multiple CASE/END pairs)
        case_count = result.upper().count("CASE")
        assert case_count >= 1  # At least one CASE (nested ones might be formatted differently)

        # Should contain all column references
        assert "category" in result
        assert "price" in result
        assert "stock" in result

        # Should have an alias
        assert " AS " in result

    def test_resolve_case_with_comparison_operators(self, tmpdir):
        """Test CASE statements with various comparison operators."""
        # Setup DAG
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(
            name="metrics",
            sql="SELECT * FROM metrics_table",
            source="ref(test_source)",
        )
        project = Project(name="test_project", sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        # Create schema
        model_hash = model.name_hash()
        schema_dir = tmpdir.mkdir("schema").mkdir("metrics")
        schema_file = schema_dir.join("schema.json")
        schema_data = {model_hash: {"value": "DECIMAL", "threshold": "DECIMAL"}}
        schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # CASE with different comparison operators
        case_expr = """
            case
                when ${ref(metrics).value} >= ${ref(metrics).threshold} then 'high'
                when ${ref(metrics).value} < ${ref(metrics).threshold} * 0.5 then 'low'
                when ${ref(metrics).value} <> 0 then 'medium'
                else 'none'
            end
        """
        result = resolver.resolve(case_expr)

        # Should preserve CASE structure
        assert "CASE" in result.upper() or "case" in result
        assert "END" in result.upper() or "end" in result

        # Should contain column references
        assert "value" in result
        assert "threshold" in result

        # Should preserve comparison operators
        assert ">=" in result or ">" in result
        assert "<" in result

        # Should have an alias
        assert " AS " in result
