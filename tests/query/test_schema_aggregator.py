"""
Tests for SchemaAggregator serialization and deserialization.
"""

import os
import tempfile
import pytest
from sqlglot import exp
from sqlglot.schema import MappingSchema
from visivo.constants import DEFAULT_RUN_ID
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


class TestSchemaAggregatorRunId:
    """Test run_id support in SchemaAggregator."""

    @pytest.fixture
    def temp_dir(self):
        """Create a temporary directory for testing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir

    def test_aggregate_stores_in_run_id_directory(self, temp_dir):
        """Test that aggregate_source_schema stores in the correct run_id directory."""
        schema_data = {
            "tables": {"test_table": {"columns": {"id": {"type": "INT", "nullable": False}}}},
            "sqlglot_schema": {"test_table": {"id": "INT"}},
            "metadata": {"total_tables": 1, "total_columns": 1},
        }

        SchemaAggregator.aggregate_source_schema(
            source_name="test_source",
            source_type="sqlite",
            schema_data=schema_data,
            output_dir=temp_dir,
            run_id="test-run-id",
        )

        expected_path = os.path.join(
            temp_dir, "test-run-id", "schemas", "test_source", "schema.json"
        )
        assert os.path.exists(expected_path)

    def test_aggregate_default_run_id(self, temp_dir):
        """Test that aggregate_source_schema uses DEFAULT_RUN_ID when not specified."""
        schema_data = {
            "tables": {},
            "sqlglot_schema": {},
            "metadata": {},
        }

        SchemaAggregator.aggregate_source_schema(
            source_name="test_source",
            source_type="sqlite",
            schema_data=schema_data,
            output_dir=temp_dir,
        )

        expected_path = os.path.join(
            temp_dir, DEFAULT_RUN_ID, "schemas", "test_source", "schema.json"
        )
        assert os.path.exists(expected_path)

    def test_load_from_specific_run_id(self, temp_dir):
        """Test loading schema from a specific run_id."""
        schema_data = {
            "tables": {"users": {"columns": {"id": {"type": "INT", "nullable": False}}}},
            "sqlglot_schema": {"users": {"id": "INT"}},
            "metadata": {"total_tables": 1, "total_columns": 1},
        }

        SchemaAggregator.aggregate_source_schema(
            source_name="test_source",
            source_type="sqlite",
            schema_data=schema_data,
            output_dir=temp_dir,
            run_id="custom-run-id",
        )

        loaded = SchemaAggregator.load_source_schema(
            "test_source", temp_dir, run_id="custom-run-id"
        )
        assert loaded is not None
        assert loaded["source_name"] == "test_source"

        not_found = SchemaAggregator.load_source_schema(
            "test_source", temp_dir, run_id="other-run-id"
        )
        assert not_found is None

    def test_list_schemas_from_specific_run_id(self, temp_dir):
        """Test listing schemas from a specific run_id."""
        schema_data = {
            "tables": {},
            "sqlglot_schema": {},
            "metadata": {"total_tables": 0, "total_columns": 0},
        }

        SchemaAggregator.aggregate_source_schema(
            source_name="source_a",
            source_type="sqlite",
            schema_data=schema_data,
            output_dir=temp_dir,
            run_id="run-1",
        )

        SchemaAggregator.aggregate_source_schema(
            source_name="source_b",
            source_type="postgresql",
            schema_data=schema_data,
            output_dir=temp_dir,
            run_id="run-2",
        )

        schemas_run_1 = SchemaAggregator.list_stored_schemas(temp_dir, run_id="run-1")
        assert len(schemas_run_1) == 1
        assert schemas_run_1[0]["source_name"] == "source_a"

        schemas_run_2 = SchemaAggregator.list_stored_schemas(temp_dir, run_id="run-2")
        assert len(schemas_run_2) == 1
        assert schemas_run_2[0]["source_name"] == "source_b"

    def test_separate_schemas_per_run_id(self, temp_dir):
        """Test that different run_ids have separate schema storage."""
        main_schema = {
            "tables": {"users": {"columns": {"id": {"type": "INT", "nullable": False}}}},
            "sqlglot_schema": {"users": {"id": "INT"}},
            "metadata": {"total_tables": 1, "total_columns": 1},
        }
        preview_schema = {
            "tables": {
                "users": {"columns": {"id": {"type": "INT"}, "name": {"type": "VARCHAR"}}},
                "orders": {"columns": {"id": {"type": "INT"}}},
            },
            "sqlglot_schema": {"users": {"id": "INT", "name": "VARCHAR"}, "orders": {"id": "INT"}},
            "metadata": {"total_tables": 2, "total_columns": 3},
        }

        SchemaAggregator.aggregate_source_schema(
            source_name="test_source",
            source_type="sqlite",
            schema_data=main_schema,
            output_dir=temp_dir,
            run_id=DEFAULT_RUN_ID,
        )

        SchemaAggregator.aggregate_source_schema(
            source_name="test_source",
            source_type="sqlite",
            schema_data=preview_schema,
            output_dir=temp_dir,
            run_id="preview-test_source",
        )

        main_loaded = SchemaAggregator.load_source_schema(
            "test_source", temp_dir, run_id=DEFAULT_RUN_ID
        )
        preview_loaded = SchemaAggregator.load_source_schema(
            "test_source", temp_dir, run_id="preview-test_source"
        )

        assert main_loaded["metadata"]["total_tables"] == 1
        assert preview_loaded["metadata"]["total_tables"] == 2
