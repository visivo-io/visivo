"""
Performance regression tests for schema operations.

These tests verify that schema operations complete within acceptable
time bounds, preventing performance regressions.
"""

import pytest
import time
from visivo.query.cached_mapping_schema import CachedMappingSchemaProvider
from visivo.query.sql_table_extractor import extract_table_references


class TestSchemaProviderPerformance:
    """Performance tests for CachedMappingSchemaProvider."""

    @pytest.fixture
    def large_schema(self):
        """Create a large schema similar to production (1000 tables, 17 columns each)."""
        tables = {}
        for i in range(1000):
            tables[f"table_{i}"] = {f"col_{j}": "VARCHAR" for j in range(17)}
        return {"sqlglot_schema": tables, "metadata": {}}

    @pytest.fixture
    def nested_large_schema(self):
        """Create large nested schema (10 schemas, 100 tables each, 17 columns)."""
        schemas = {}
        for s in range(10):
            schema_name = f"SCHEMA_{s}"
            schemas[schema_name] = {}
            for t in range(100):
                schemas[schema_name][f"table_{t}"] = {f"col_{c}": "VARCHAR" for c in range(17)}
        return {"sqlglot_schema": schemas, "metadata": {"default_schema": "SCHEMA_0"}}

    def test_provider_build_under_2_seconds(self, large_schema):
        """Provider should build 17,000 columns in under 2 seconds."""
        start = time.time()
        provider = CachedMappingSchemaProvider(large_schema)
        elapsed = time.time() - start

        assert provider.table_count == 1000
        assert provider.column_count == 17000
        assert elapsed < 2.0, f"Build took {elapsed:.2f}s, expected < 2.0s"

    def test_nested_provider_build_under_2_seconds(self, nested_large_schema):
        """Nested provider should build 17,000 columns in under 2 seconds."""
        start = time.time()
        provider = CachedMappingSchemaProvider(nested_large_schema)
        elapsed = time.time() - start

        assert provider.table_count == 1000
        assert provider.column_count == 17000
        assert elapsed < 2.0, f"Build took {elapsed:.2f}s, expected < 2.0s"

    def test_filtered_schema_under_1ms(self, large_schema):
        """Filtering schema should complete in under 1ms per call."""
        provider = CachedMappingSchemaProvider(large_schema)

        # Warm up
        provider.get_filtered_schema({"table_0"})

        # Time 100 filter operations
        start = time.time()
        for _ in range(100):
            provider.get_filtered_schema({"table_0", "table_500"})
        avg_time = (time.time() - start) / 100

        assert avg_time < 0.001, f"Average filter time {avg_time*1000:.3f}ms, expected < 1ms"

    def test_nested_filtered_schema_under_1ms(self, nested_large_schema):
        """Filtering nested schema should complete in under 1ms per call."""
        provider = CachedMappingSchemaProvider(nested_large_schema)

        # Warm up
        provider.get_filtered_schema({"table_0"})

        # Time 100 filter operations
        start = time.time()
        for _ in range(100):
            provider.get_filtered_schema({"table_0", "table_50"}, {"SCHEMA_0", "SCHEMA_5"})
        avg_time = (time.time() - start) / 100

        assert avg_time < 0.001, f"Average filter time {avg_time*1000:.3f}ms, expected < 1ms"

    def test_repeated_filtering_uses_references(self, large_schema):
        """Repeated filtering should return same references (no new objects)."""
        provider = CachedMappingSchemaProvider(large_schema)

        filtered1 = provider.get_filtered_schema({"table_0"})
        filtered2 = provider.get_filtered_schema({"table_0"})

        # Same dict reference should be returned
        assert filtered1["table_0"] is filtered2["table_0"]


class TestTableExtractionPerformance:
    """Performance tests for SQL table extraction."""

    def test_simple_query_extraction_fast(self):
        """Simple query table extraction should be very fast."""
        sql = "SELECT * FROM orders JOIN customers ON orders.id = customers.order_id"

        start = time.time()
        for _ in range(100):
            extract_table_references(sql, "duckdb")
        avg_time = (time.time() - start) / 100

        assert avg_time < 0.01, f"Average extraction time {avg_time*1000:.3f}ms, expected < 10ms"

    def test_complex_query_extraction(self):
        """Complex query with CTEs should still be fast."""
        sql = """
        WITH
            cte1 AS (SELECT * FROM base_table1),
            cte2 AS (SELECT * FROM cte1 JOIN base_table2 ON 1=1),
            cte3 AS (
                SELECT * FROM cte1
                JOIN cte2 ON 1=1
                JOIN base_table3 ON 1=1
            )
        SELECT *
        FROM cte3
        JOIN base_table4 ON 1=1
        WHERE id IN (SELECT id FROM base_table5)
        """

        start = time.time()
        for _ in range(100):
            tables = extract_table_references(sql, "duckdb")
        avg_time = (time.time() - start) / 100

        # Should extract 5 base tables, not the CTEs
        assert tables == {"base_table1", "base_table2", "base_table3", "base_table4", "base_table5"}
        assert avg_time < 0.02, f"Average extraction time {avg_time*1000:.3f}ms, expected < 20ms"


class TestEndToEndPerformance:
    """End-to-end performance tests simulating real usage patterns."""

    def test_simulated_model_schema_build(self):
        """Simulate building schema for a model from large source schema."""
        # Create large source schema (similar to production)
        tables = {}
        for i in range(1000):
            tables[f"table_{i}"] = {f"col_{j}": "VARCHAR" for j in range(17)}
        stored_schema = {"sqlglot_schema": tables, "metadata": {}}

        # Build provider once (this is done once per source per run)
        provider = CachedMappingSchemaProvider(stored_schema)

        # Simulate 20 model jobs using the same provider
        queries = [f"SELECT * FROM table_{i} JOIN table_{i+1} ON 1=1" for i in range(0, 40, 2)]

        start = time.time()
        for query in queries:
            # Extract tables (fast AST parse)
            tables = extract_table_references(query, "duckdb")
            # Get filtered schema (O(t) reference copy)
            schema = provider.get_filtered_schema(tables)
            # Verify we got the right tables
            assert len(schema) == 2
        total_time = time.time() - start

        # 20 models should complete in well under 1 second
        # (vs 180+ seconds before optimization)
        assert total_time < 1.0, f"20 models took {total_time:.2f}s, expected < 1.0s"
