"""Tests for run_csv_script_job schema artifact writing."""

import json
import os

from tests.support.utils import temp_folder
from tests.factories.model_factories import CsvScriptModelFactory
from visivo.constants import DEFAULT_RUN_ID
from visivo.jobs.run_csv_script_job import _write_schema


class TestCsvScriptSchemaArtifact:
    def test_write_schema_emits_envelope_with_legacy_block(self):
        # The factory's default command echoes a row_number,value CSV.
        model = CsvScriptModelFactory()
        output_dir = temp_folder()
        run_output_dir = os.path.join(output_dir, DEFAULT_RUN_ID)
        os.makedirs(run_output_dir, exist_ok=True)

        model.insert_csv_to_duckdb(output_dir=run_output_dir)
        _write_schema(model, run_output_dir)

        schema_file = os.path.join(run_output_dir, "schemas", model.name, "schema.json")
        assert os.path.exists(schema_file)

        with open(schema_file) as fp:
            data = json.load(fp)

        # Envelope fields.
        assert data["model_name"] == model.name
        assert data["model_type"] == "csv_script"
        assert data["metadata"]["source_dialect"] == "duckdb"
        assert "generated_at" in data

        # Columns block carries {type, nullable} for each CSV column.
        assert set(data["columns"].keys()) == {"row_number", "value"}
        for col in data["columns"].values():
            assert "type" in col
            assert "nullable" in col
        assert data["metadata"]["total_columns"] == 2

        # Legacy {name_hash: {col: type_string}} block preserved (field resolver).
        legacy = data[model.name_hash()]
        assert set(legacy.keys()) == {"row_number", "value"}
        assert all(isinstance(v, str) for v in legacy.values())
