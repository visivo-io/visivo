"""Tests for ModelSchemaAggregator — the model-side schema artifact helper."""

import json
import os

from visivo.constants import DEFAULT_RUN_ID
from visivo.query.model_schema_aggregator import ModelSchemaAggregator


class TestBuildEnvelope:
    def test_produces_legacy_hash_block_and_envelope(self):
        envelope = ModelSchemaAggregator.build_envelope(
            name_hash="mabc",
            model_name="orders_enriched",
            model_type="sql",
            columns={"id": "INT", "name": "VARCHAR", "total": "DOUBLE"},
            source_dialect="duckdb",
        )

        # Legacy thin block keyed by name_hash, preserved as {col: type_string}.
        assert envelope["mabc"] == {"id": "INT", "name": "VARCHAR", "total": "DOUBLE"}

        # Envelope fields mirror the source artifact metadata richness.
        assert envelope["model_name"] == "orders_enriched"
        assert envelope["model_type"] == "sql"
        assert "generated_at" in envelope
        assert envelope["columns"] == {
            "id": {"type": "INT", "nullable": True},
            "name": {"type": "VARCHAR", "nullable": True},
            "total": {"type": "DOUBLE", "nullable": True},
        }
        assert envelope["metadata"]["total_columns"] == 3
        assert envelope["metadata"]["source_dialect"] == "duckdb"

    def test_legacy_hash_block_is_first_key(self):
        envelope = ModelSchemaAggregator.build_envelope(
            name_hash="mhash",
            model_name="m",
            model_type="sql",
            columns={"a": "INT"},
        )
        assert next(iter(envelope.keys())) == "mhash"

    def test_accepts_dict_columns_with_nullable(self):
        envelope = ModelSchemaAggregator.build_envelope(
            name_hash="mh",
            model_name="csv_model",
            model_type="csv_script",
            columns={
                "id": {"type": "BIGINT", "nullable": False},
                "label": {"type": "VARCHAR", "nullable": True},
            },
            source_dialect="duckdb",
        )
        assert envelope["columns"]["id"] == {"type": "BIGINT", "nullable": False}
        assert envelope["columns"]["label"] == {"type": "VARCHAR", "nullable": True}
        # Legacy block flattens to just the type string.
        assert envelope["mh"] == {"id": "BIGINT", "label": "VARCHAR"}

    def test_none_type_normalizes_to_unknown(self):
        # schema_from_sql can yield None types when annotation fails.
        envelope = ModelSchemaAggregator.build_envelope(
            name_hash="mh",
            model_name="m",
            model_type="sql",
            columns={"mystery": None},
        )
        assert envelope["columns"]["mystery"] == {"type": "UNKNOWN", "nullable": True}
        assert envelope["mh"]["mystery"] == "UNKNOWN"

    def test_empty_columns(self):
        envelope = ModelSchemaAggregator.build_envelope(
            name_hash="mh", model_name="m", model_type="sql", columns={}
        )
        assert envelope["columns"] == {}
        assert envelope["metadata"]["total_columns"] == 0
        assert envelope["mh"] == {}


class TestLoadModelSchema:
    def test_round_trips_a_written_file(self, tmp_path):
        output_dir = str(tmp_path)
        payload = ModelSchemaAggregator.build_envelope(
            name_hash="mh",
            model_name="orders",
            model_type="sql",
            columns={"id": "INT"},
            source_dialect="duckdb",
        )
        schema_dir = os.path.join(output_dir, DEFAULT_RUN_ID, "schemas", "orders")
        os.makedirs(schema_dir, exist_ok=True)
        with open(os.path.join(schema_dir, "schema.json"), "w") as fp:
            json.dump(payload, fp)

        loaded = ModelSchemaAggregator.load_model_schema("orders", output_dir)
        assert loaded == payload

    def test_returns_none_when_absent(self, tmp_path):
        assert ModelSchemaAggregator.load_model_schema("missing", str(tmp_path)) is None

    def test_honors_explicit_run_id(self, tmp_path):
        output_dir = str(tmp_path)
        payload = ModelSchemaAggregator.build_envelope(
            name_hash="mh", model_name="orders", model_type="sql", columns={"id": "INT"}
        )
        run_id = "preview-orders"
        schema_dir = os.path.join(output_dir, run_id, "schemas", "orders")
        os.makedirs(schema_dir, exist_ok=True)
        with open(os.path.join(schema_dir, "schema.json"), "w") as fp:
            json.dump(payload, fp)

        # Default run_id (main) misses; explicit preview run_id hits.
        assert ModelSchemaAggregator.load_model_schema("orders", output_dir) is None
        loaded = ModelSchemaAggregator.load_model_schema("orders", output_dir, run_id=run_id)
        assert loaded["model_name"] == "orders"


class TestListStoredModelSchemas:
    def test_returns_only_model_entries_skipping_source_schemas(self, tmp_path):
        output_dir = str(tmp_path)
        schemas_root = os.path.join(output_dir, DEFAULT_RUN_ID, "schemas")

        # A model schema (has model_name).
        model_dir = os.path.join(schemas_root, "orders")
        os.makedirs(model_dir, exist_ok=True)
        model_payload = ModelSchemaAggregator.build_envelope(
            name_hash="mh",
            model_name="orders",
            model_type="sql",
            columns={"id": "INT", "total": "DOUBLE"},
        )
        with open(os.path.join(model_dir, "schema.json"), "w") as fp:
            json.dump(model_payload, fp)

        # A source schema (has source_name, NOT model_name) in the same dir.
        source_dir = os.path.join(schemas_root, "my_source")
        os.makedirs(source_dir, exist_ok=True)
        with open(os.path.join(source_dir, "schema.json"), "w") as fp:
            json.dump(
                {
                    "source_name": "my_source",
                    "source_type": "sqlite",
                    "tables": {},
                    "metadata": {"total_tables": 0, "total_columns": 0},
                },
                fp,
            )

        listed = ModelSchemaAggregator.list_stored_model_schemas(output_dir)
        assert len(listed) == 1
        assert listed[0]["model_name"] == "orders"
        assert listed[0]["model_type"] == "sql"
        assert listed[0]["total_columns"] == 2

    def test_returns_empty_when_no_schemas_dir(self, tmp_path):
        assert ModelSchemaAggregator.list_stored_model_schemas(str(tmp_path)) == []
