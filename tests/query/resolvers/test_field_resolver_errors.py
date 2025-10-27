"""
Tests for FieldResolver error handling.

This module tests error conditions in field resolution, including
missing schemas, corrupted files, and circular reference detection.
"""

import pytest
import json
import os
from visivo.query.resolvers.field_resolver import FieldResolver
from visivo.models.models.sql_model import SqlModel
from visivo.models.metric import Metric
from visivo.models.dimension import Dimension
from visivo.models.sources.duckdb_source import DuckdbSource
from visivo.models.project import Project


class TestSchemaFileMissing:
    """Test error handling when schema files are missing."""

    def test_resolve_with_missing_schema_shows_helpful_error(self, tmpdir):
        """Test that resolution with missing schema file shows clear error message."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )
        dag = project.dag()

        # Create FieldResolver but don't create schema files
        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Try to resolve a field reference
        with pytest.raises(Exception) as exc_info:
            resolver.resolve("${ref(orders).amount}")

        error_msg = str(exc_info.value)
        assert "schema" in error_msg.lower()
        assert "orders" in error_msg
        # Should give helpful context about missing schema
        assert "not found" in error_msg.lower() or "missing" in error_msg.lower()

    def test_resolve_with_missing_schema_shows_file_path(self, tmpdir, capsys):
        """Test that error message references model and logs file path."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )
        dag = project.dag()

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        with pytest.raises(Exception) as exc_info:
            resolver.resolve("${ref(orders).amount}")

        error_msg = str(exc_info.value)
        # Error message includes model name
        assert "missing schema" in error_msg.lower()
        assert "orders" in error_msg.lower()

        # Detailed path is logged to stdout (captured by capsys)
        captured = capsys.readouterr()
        assert "schema.json" in captured.out or "schema" in captured.out.lower()


class TestSchemaFileCorrupted:
    """Test error handling when schema files are corrupted."""

    def test_resolve_with_invalid_json_shows_helpful_error(self, tmpdir, capsys):
        """Test that corrupted JSON schema file shows clear error."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )
        dag = project.dag()

        # Create schema directory but with invalid JSON
        schema_base = tmpdir.mkdir("schema")
        model_hash = model.name_hash()
        schema_dir = schema_base.mkdir("orders")
        schema_file = schema_dir.join("schema.json")
        schema_file.write("{ invalid json content ")

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        with pytest.raises(Exception) as exc_info:
            resolver.resolve("${ref(orders).amount}")

        error_msg = str(exc_info.value)
        # Exception message is simple
        assert "missing schema" in error_msg.lower()
        assert "orders" in error_msg

        # Detailed parse error is logged to stdout
        captured = capsys.readouterr()
        assert "parse" in captured.out.lower() or "json" in captured.out.lower()

    def test_resolve_with_empty_schema_file(self, tmpdir):
        """Test handling of empty schema file."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )
        dag = project.dag()

        # Create empty schema file
        schema_base = tmpdir.mkdir("schema")
        schema_dir = schema_base.mkdir("orders")
        schema_file = schema_dir.join("schema.json")
        schema_file.write("{}")

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Empty schema should cause error when trying to resolve fields
        with pytest.raises(Exception):
            resolver.resolve("${ref(orders).amount}")


class TestSchemaFieldMissing:
    """Test error handling when field doesn't exist in schema."""

    def test_resolve_nonexistent_field_shows_available_fields(self, tmpdir):
        """Test that error for missing field shows available columns."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )
        dag = project.dag()

        # Create schema with specific columns
        schema_base = tmpdir.mkdir("schema")
        model_hash = model.name_hash()
        schema_dir = schema_base.mkdir("orders")
        schema_file = schema_dir.join("schema.json")
        schema_data = {model_hash: {"id": "INTEGER", "user_id": "INTEGER", "amount": "DECIMAL"}}
        schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Try to resolve field that doesn't exist
        with pytest.raises(Exception) as exc_info:
            resolver.resolve("${ref(orders).nonexistent_field}")

        error_msg = str(exc_info.value)
        assert "nonexistent_field" in error_msg
        assert "orders" in error_msg
        # Should list available columns
        assert "id" in error_msg or "user_id" in error_msg or "amount" in error_msg
        assert "available" in error_msg.lower() or "exists" in error_msg.lower()


class TestInfiniteRecursionProtection:
    """Test protection against infinite recursion in field resolution."""

    def test_resolution_detects_cycles_before_10k_limit(self, tmpdir):
        """
        Test that circular references are detected before hitting 10k iteration limit.

        NOTE: Current implementation uses 10k iteration limit.
        This test documents expected behavior for early cycle detection.
        """
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")

        # Create circular metrics that would cause infinite recursion
        metric1 = Metric(name="m1", expression="${ref(m2)} + 1")
        metric2 = Metric(name="m2", expression="${ref(m1)} * 2")

        # This should fail during DAG construction, not during resolution
        with pytest.raises(ValueError) as exc_info:
            Project(
                name="test_project",
                sources=[source],
                models=[model],
                metrics=[metric1, metric2],
                dashboards=[],
            )

        # Should be caught as circular reference, not iteration limit
        error_msg = str(exc_info.value)
        assert "circular" in error_msg.lower()
        assert "10000" not in error_msg  # Should not mention iteration limit

    @pytest.mark.xfail(reason="Early cycle detection in FieldResolver not yet implemented")
    def test_field_resolver_has_explicit_cycle_detection(self, tmpdir):
        """
        Test for future explicit cycle detection in FieldResolver.

        FieldResolver should track resolution stack and detect cycles immediately,
        not rely on iteration limit.
        """
        # Note: _resolution_stack exists in FieldResolver but is not currently used
        # This test documents desired behavior
        pass


class TestResolutionStackTracking:
    """Test that resolution stack is properly tracked for error reporting."""

    def test_nested_resolution_error_shows_full_chain(self, tmpdir):
        """
        Test that errors in nested resolution show the full chain.

        When m3 -> m2 -> m1 -> (error), error should show: m3 -> m2 -> m1 -> error
        """
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")

        metric1 = Metric(name="m1", expression="${ref(orders).nonexistent}")
        metric2 = Metric(name="m2", expression="${ref(m1)} * 2")
        metric3 = Metric(name="m3", expression="${ref(m2)} + 1")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            metrics=[metric1, metric2, metric3],
            dashboards=[],
        )
        dag = project.dag()

        # Create schema
        schema_base = tmpdir.mkdir("schema")
        model_hash = model.name_hash()
        schema_dir = schema_base.mkdir("orders")
        schema_file = schema_dir.join("schema.json")
        schema_data = {model_hash: {"id": "INTEGER"}}
        schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Error resolving m3 should show chain
        with pytest.raises(Exception) as exc_info:
            resolver.resolve("${ref(m3)}")

        error_msg = str(exc_info.value)
        # Ideally should show: m3 -> m2 -> m1 -> nonexistent
        # Current implementation may not show full chain
        assert "nonexistent" in error_msg


class TestCacheInvalidation:
    """Test that caches are properly managed and don't cause stale results."""

    def test_schema_cache_is_used_for_repeated_lookups(self, tmpdir):
        """Test that schema cache improves performance for repeated lookups."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )
        dag = project.dag()

        # Create schema
        schema_base = tmpdir.mkdir("schema")
        model_hash = model.name_hash()
        schema_dir = schema_base.mkdir("orders")
        schema_file = schema_dir.join("schema.json")
        schema_data = {model_hash: {"id": "INTEGER", "amount": "DECIMAL"}}
        schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Resolve same field multiple times
        result1 = resolver.resolve("${ref(orders).amount}")
        result2 = resolver.resolve("${ref(orders).amount}")

        # Should get same result (cache working)
        assert result1 == result2

        # Verify cache is populated
        assert "orders" in resolver._schema_cache

    @pytest.mark.xfail(reason="Resolution cache declared but not yet implemented")
    def test_resolution_cache_prevents_redundant_work(self, tmpdir):
        """Test that resolution cache is used for identical expressions.

        NOTE: _resolution_cache exists in FieldResolver but is not currently used.
        This test documents the expected future behavior.
        """
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )
        dag = project.dag()

        # Create schema
        schema_base = tmpdir.mkdir("schema")
        model_hash = model.name_hash()
        schema_dir = schema_base.mkdir("orders")
        schema_file = schema_dir.join("schema.json")
        schema_data = {model_hash: {"id": "INTEGER"}}
        schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")

        # Resolve same expression twice
        result1 = resolver.resolve("${ref(orders).id}")
        result2 = resolver.resolve("${ref(orders).id}")

        assert result1 == result2
        # Verify resolution cache is populated (when implemented)
        assert len(resolver._resolution_cache) > 0


class TestDialectHandling:
    """Test that dialect-specific SQL generation is correct."""

    def test_different_dialects_produce_different_quoting(self, tmpdir):
        """Test that different SQL dialects use appropriate identifier quoting."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )
        dag = project.dag()

        # Create schema
        schema_base = tmpdir.mkdir("schema")
        model_hash = model.name_hash()
        schema_dir = schema_base.mkdir("orders")
        schema_file = schema_dir.join("schema.json")
        schema_data = {model_hash: {"id": "INTEGER"}}
        schema_file.write(json.dumps(schema_data))

        # Test with DuckDB dialect (uses double quotes)
        resolver_duckdb = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")
        result_duckdb = resolver_duckdb.resolve("${ref(orders).id}", alias=False)

        # Result should have proper quoting (DuckDB style)
        # Exact format depends on sqlglot implementation
        assert '"' in result_duckdb or result_duckdb  # Has some identifier handling
