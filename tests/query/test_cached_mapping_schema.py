"""
Tests for visivo.query.cached_mapping_schema module.

Tests the CachedMappingSchemaProvider for efficient schema operations.
"""

import pytest
from sqlglot import exp
from visivo.query.cached_mapping_schema import CachedMappingSchemaProvider


class TestCachedMappingSchemaProviderInit:
    """Tests for CachedMappingSchemaProvider initialization."""

    def test_empty_schema(self):
        """Test initialization with empty schema."""
        provider = CachedMappingSchemaProvider({"sqlglot_schema": {}, "metadata": {}})
        assert provider.table_count == 0
        assert provider.column_count == 0

    def test_flat_schema_structure(self):
        """Test initialization with flat schema structure."""
        stored_schema = {
            "sqlglot_schema": {
                "users": {"id": "INT", "name": "VARCHAR"},
                "orders": {"id": "INT", "total": "DECIMAL"},
            },
            "metadata": {},
        }
        provider = CachedMappingSchemaProvider(stored_schema)

        assert provider.is_nested is False
        assert provider.table_count == 2
        assert provider.column_count == 4

    def test_nested_schema_structure(self):
        """Test initialization with nested schema structure."""
        stored_schema = {
            "sqlglot_schema": {
                "EDW": {
                    "fact_orders": {"id": "INT", "amount": "DECIMAL"},
                },
                "REPORTING": {
                    "dim_customers": {"id": "INT", "name": "VARCHAR"},
                },
            },
            "metadata": {"default_schema": "EDW"},
        }
        provider = CachedMappingSchemaProvider(stored_schema)

        assert provider.is_nested is True
        assert provider.table_count == 2
        assert provider.column_count == 4
        assert provider.default_schema == "EDW"

    def test_datatype_objects_built(self):
        """Test that DataType objects are built from type strings."""
        stored_schema = {
            "sqlglot_schema": {
                "users": {"id": "INT", "name": "VARCHAR"},
            },
            "metadata": {},
        }
        provider = CachedMappingSchemaProvider(stored_schema)
        schema = provider.get_full_schema()

        assert isinstance(schema["users"]["id"], exp.DataType)
        assert isinstance(schema["users"]["name"], exp.DataType)

    def test_invalid_type_falls_back_to_varchar(self):
        """Test invalid type strings fall back to VARCHAR."""
        stored_schema = {
            "sqlglot_schema": {
                "users": {"id": "INVALID_TYPE_XYZ"},
            },
            "metadata": {},
        }
        provider = CachedMappingSchemaProvider(stored_schema)
        schema = provider.get_full_schema()

        # Should fall back to VARCHAR
        assert isinstance(schema["users"]["id"], exp.DataType)


class TestCachedMappingSchemaProviderFiltering:
    """Tests for schema filtering functionality."""

    def test_filter_flat_schema_single_table(self):
        """Test filtering flat schema to single table."""
        stored_schema = {
            "sqlglot_schema": {
                "users": {"id": "INT", "name": "VARCHAR"},
                "orders": {"id": "INT", "total": "DECIMAL"},
                "products": {"id": "INT", "sku": "VARCHAR"},
            },
            "metadata": {},
        }
        provider = CachedMappingSchemaProvider(stored_schema)
        filtered = provider.get_filtered_schema({"users"})

        assert len(filtered) == 1
        assert "users" in filtered
        assert "orders" not in filtered
        assert "products" not in filtered

    def test_filter_flat_schema_multiple_tables(self):
        """Test filtering flat schema to multiple tables."""
        stored_schema = {
            "sqlglot_schema": {
                "users": {"id": "INT"},
                "orders": {"id": "INT"},
                "products": {"id": "INT"},
            },
            "metadata": {},
        }
        provider = CachedMappingSchemaProvider(stored_schema)
        filtered = provider.get_filtered_schema({"users", "orders"})

        assert len(filtered) == 2
        assert "users" in filtered
        assert "orders" in filtered
        assert "products" not in filtered

    def test_filter_nonexistent_table(self):
        """Test filtering for nonexistent table returns empty."""
        stored_schema = {
            "sqlglot_schema": {
                "users": {"id": "INT"},
            },
            "metadata": {},
        }
        provider = CachedMappingSchemaProvider(stored_schema)
        filtered = provider.get_filtered_schema({"nonexistent"})

        assert len(filtered) == 0

    def test_filter_nested_schema(self):
        """Test filtering nested schema structure."""
        stored_schema = {
            "sqlglot_schema": {
                "EDW": {
                    "fact_orders": {"id": "INT"},
                    "fact_items": {"id": "INT"},
                },
                "REPORTING": {
                    "dim_customers": {"id": "INT"},
                },
            },
            "metadata": {"default_schema": "EDW"},
        }
        provider = CachedMappingSchemaProvider(stored_schema)
        filtered = provider.get_filtered_schema({"fact_orders", "dim_customers"})

        # Should include both schemas since tables exist in both
        assert "EDW" in filtered
        assert "REPORTING" in filtered
        assert "fact_orders" in filtered["EDW"]
        assert "fact_items" not in filtered.get("EDW", {})
        assert "dim_customers" in filtered["REPORTING"]

    def test_filter_nested_with_schema_filter(self):
        """Test filtering nested schema with schema name filter."""
        stored_schema = {
            "sqlglot_schema": {
                "EDW": {
                    "users": {"id": "INT"},
                },
                "REPORTING": {
                    "users": {"id": "INT"},  # Same table name in different schema
                },
            },
            "metadata": {},
        }
        provider = CachedMappingSchemaProvider(stored_schema)
        filtered = provider.get_filtered_schema({"users"}, schema_names={"EDW"})

        # Should only search in EDW schema
        assert "EDW" in filtered
        assert "REPORTING" not in filtered


class TestCachedMappingSchemaProviderPerformance:
    """Tests to verify performance characteristics."""

    def test_filtered_returns_references(self):
        """Test that filtered schema returns references, not copies."""
        stored_schema = {
            "sqlglot_schema": {
                "users": {"id": "INT", "name": "VARCHAR"},
            },
            "metadata": {},
        }
        provider = CachedMappingSchemaProvider(stored_schema)

        filtered1 = provider.get_filtered_schema({"users"})
        filtered2 = provider.get_filtered_schema({"users"})

        # Should be the same dict reference (no copy)
        assert filtered1["users"] is filtered2["users"]

    def test_large_schema_initialization(self):
        """Test that large schema can be initialized."""
        # Create schema with 100 tables, 17 columns each = 1700 columns
        tables = {}
        for i in range(100):
            tables[f"table_{i}"] = {f"col_{j}": "VARCHAR" for j in range(17)}

        stored_schema = {
            "sqlglot_schema": tables,
            "metadata": {},
        }

        provider = CachedMappingSchemaProvider(stored_schema)

        assert provider.table_count == 100
        assert provider.column_count == 1700

    def test_filter_from_large_schema(self):
        """Test filtering from large schema returns quickly."""
        # Create schema with 100 tables
        tables = {}
        for i in range(100):
            tables[f"table_{i}"] = {f"col_{j}": "VARCHAR" for j in range(17)}

        stored_schema = {
            "sqlglot_schema": tables,
            "metadata": {},
        }

        provider = CachedMappingSchemaProvider(stored_schema)

        # Filter to just 2 tables - should be O(2), not O(100)
        filtered = provider.get_filtered_schema({"table_0", "table_50"})

        assert len(filtered) == 2
        assert "table_0" in filtered
        assert "table_50" in filtered


class TestCachedMappingSchemaProviderDialect:
    """Tests for dialect-specific type parsing."""

    def test_snowflake_timestamp_tz(self):
        """Test Snowflake-specific TIMESTAMP_TZ type."""
        stored_schema = {
            "sqlglot_schema": {
                "events": {"created_at": "TIMESTAMP_TZ"},
            },
            "metadata": {},
        }
        # With dialect specified, TIMESTAMP_TZ should parse correctly
        provider = CachedMappingSchemaProvider(stored_schema, dialect="snowflake")
        schema = provider.get_full_schema()

        assert isinstance(schema["events"]["created_at"], exp.DataType)

    def test_without_dialect(self):
        """Test type parsing without dialect specified."""
        stored_schema = {
            "sqlglot_schema": {
                "users": {"id": "INT", "name": "VARCHAR"},
            },
            "metadata": {},
        }
        provider = CachedMappingSchemaProvider(stored_schema, dialect=None)
        schema = provider.get_full_schema()

        # Standard types should parse without dialect
        assert isinstance(schema["users"]["id"], exp.DataType)
        assert isinstance(schema["users"]["name"], exp.DataType)
