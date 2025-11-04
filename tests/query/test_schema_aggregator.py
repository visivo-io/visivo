"""
Tests for SchemaAggregator serialization and deserialization.
"""

import pytest
from sqlglot import exp
from sqlglot.schema import MappingSchema
from visivo.query.schema_aggregator import SchemaAggregator


class TestSchemaAggregator:
    """Test schema serialization and deserialization."""

    def test_serialize_mapping_schema_simple_format(self):
        """Test that MappingSchema is serialized to simple dict format without wrapper."""
        # Create a simple MappingSchema
        schema = MappingSchema()
        schema.add_table(
            "test_table", {"x": exp.DataType.build("INT"), "y": exp.DataType.build("VARCHAR")}
        )

        # Serialize it
        serialized = SchemaAggregator._serialize_mapping_schema(schema)

        # Verify format: {table: {col: type_str}}
        assert "test_table" in serialized
        assert serialized["test_table"]["x"] == "INT"
        assert serialized["test_table"]["y"] == "VARCHAR"

        # Ensure no extra wrapper
        assert "sqlglot_schema" not in serialized

    def test_serialize_various_data_types(self):
        """Test serialization of various SQL data types."""
        schema = MappingSchema()
        schema.add_table(
            "types_table",
            {
                "id": exp.DataType.build("BIGINT"),
                "name": exp.DataType.build("VARCHAR(100)"),
                "price": exp.DataType.build("DECIMAL(10, 2)"),
                "created_at": exp.DataType.build("TIMESTAMP"),
                "is_active": exp.DataType.build("BOOLEAN"),
                "data": exp.DataType.build("JSON"),
            },
        )

        serialized = SchemaAggregator._serialize_mapping_schema(schema)

        assert serialized["types_table"]["id"] == "BIGINT"
        assert serialized["types_table"]["name"] == "VARCHAR(100)"
        assert serialized["types_table"]["price"] == "DECIMAL(10, 2)"
        assert serialized["types_table"]["created_at"] == "TIMESTAMP"
        assert serialized["types_table"]["is_active"] == "BOOLEAN"
        assert serialized["types_table"]["data"] == "JSON"

    def test_deserialize_mapping_schema(self):
        """Test that stored schema is properly deserialized to MappingSchema."""
        stored_schema = {
            "source_name": "test_source",
            "sqlglot_schema": {"test_table": {"x": "INT", "y": "VARCHAR"}},
        }

        # Deserialize
        mapping_schema = SchemaAggregator.build_mapping_schema_from_stored(stored_schema)

        # Access the internal mapping
        if hasattr(mapping_schema, "_mapping"):
            mapping = mapping_schema._mapping
        elif hasattr(mapping_schema, "mapping"):
            mapping = mapping_schema.mapping
        else:
            pytest.fail("MappingSchema has no accessible mapping attribute")

        # Verify structure
        assert "test_table" in mapping or ("test_table",) in mapping

        # Get table columns (handle both string and tuple keys)
        table_key = "test_table" if "test_table" in mapping else ("test_table",)
        columns = mapping[table_key]

        assert "x" in columns
        assert "y" in columns

        # Verify types are DataType objects
        assert isinstance(columns["x"], exp.DataType)
        assert isinstance(columns["y"], exp.DataType)

        # Verify type values
        assert columns["x"].sql() == "INT"
        assert columns["y"].sql() == "VARCHAR"

    def test_round_trip_serialization(self):
        """Test that serialize -> deserialize -> serialize produces same result."""
        # Create original schema
        original_schema = MappingSchema()
        original_schema.add_table(
            "users",
            {
                "id": exp.DataType.build("BIGINT"),
                "email": exp.DataType.build("VARCHAR(255)"),
                "created_at": exp.DataType.build("TIMESTAMP"),
            },
        )

        # Serialize
        serialized = SchemaAggregator._serialize_mapping_schema(original_schema)

        # Create stored format
        stored_schema = {"sqlglot_schema": serialized}

        # Deserialize
        reconstructed_schema = SchemaAggregator.build_mapping_schema_from_stored(stored_schema)

        # Serialize again
        reserialized = SchemaAggregator._serialize_mapping_schema(reconstructed_schema)

        # Should be identical
        assert serialized == reserialized

    def test_multiple_tables(self):
        """Test serialization with multiple tables."""
        schema = MappingSchema()
        schema.add_table(
            "users", {"id": exp.DataType.build("INT"), "name": exp.DataType.build("VARCHAR")}
        )
        schema.add_table(
            "orders", {"id": exp.DataType.build("INT"), "user_id": exp.DataType.build("INT")}
        )

        serialized = SchemaAggregator._serialize_mapping_schema(schema)

        assert "users" in serialized
        assert "orders" in serialized
        assert serialized["users"]["id"] == "INT"
        assert serialized["orders"]["user_id"] == "INT"

    def test_empty_schema(self):
        """Test serialization of empty schema."""
        schema = MappingSchema()
        serialized = SchemaAggregator._serialize_mapping_schema(schema)

        assert serialized == {}

    def test_deserialize_empty_schema(self):
        """Test deserialization of empty schema."""
        stored_schema = {"sqlglot_schema": {}}

        mapping_schema = SchemaAggregator.build_mapping_schema_from_stored(stored_schema)

        # Access internal mapping
        if hasattr(mapping_schema, "_mapping"):
            mapping = mapping_schema._mapping
        elif hasattr(mapping_schema, "mapping"):
            mapping = mapping_schema.mapping
        else:
            mapping = {}

        assert len(mapping) == 0

    def test_deserialize_missing_sqlglot_schema_key(self):
        """Test deserialization when sqlglot_schema key is missing."""
        stored_schema = {"source_name": "test"}

        mapping_schema = SchemaAggregator.build_mapping_schema_from_stored(stored_schema)

        # Should return empty schema without error
        if hasattr(mapping_schema, "_mapping"):
            mapping = mapping_schema._mapping
        elif hasattr(mapping_schema, "mapping"):
            mapping = mapping_schema.mapping
        else:
            mapping = {}

        assert len(mapping) == 0
