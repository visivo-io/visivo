"""Tests for run_local_merge_job schema artifact writing."""

import json
import os

import polars as pl

from tests.support.utils import temp_folder
from visivo.constants import DEFAULT_RUN_ID
from visivo.jobs.run_local_merge_job import _write_schema
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.postgresql_source import PostgresqlSource


class TestLocalMergeSchemaArtifact:
    def test_write_schema_emits_envelope_with_legacy_block(self, mocker):
        base_output_dir = temp_folder()
        run_output_dir = os.path.join(base_output_dir, DEFAULT_RUN_ID)
        os.makedirs(run_output_dir, exist_ok=True)

        dataframe = pl.DataFrame({"id": [1, 2, 3], "label": ["a", "b", "c"]})
        mocker.patch(
            "visivo.models.sources.postgresql_source.PostgresqlSource.read_sql",
            return_value=dataframe,
        )

        source = PostgresqlSource(database="test", type="postgresql")
        model = LocalMergeModel(
            name="merged_model",
            sql="SELECT * FROM model1.model",
            models=[SqlModel(name="model1", sql="SELECT * FROM table1", source=source)],
        )
        dag = model.dag()

        model.insert_duckdb_data(output_dir=run_output_dir, dag=dag)
        _write_schema(model, run_output_dir, dag)

        schema_file = os.path.join(run_output_dir, "schemas", model.name, "schema.json")
        assert os.path.exists(schema_file)

        with open(schema_file) as fp:
            data = json.load(fp)

        # Envelope fields.
        assert data["model_name"] == "merged_model"
        assert data["model_type"] == "local_merge"
        assert data["metadata"]["source_dialect"] == "duckdb"
        assert "generated_at" in data

        # Columns block carries {type, nullable}.
        assert set(data["columns"].keys()) == {"id", "label"}
        for col in data["columns"].values():
            assert "type" in col
            assert "nullable" in col

        # Legacy {name_hash: {col: type_string}} block preserved.
        legacy = data[model.name_hash()]
        assert set(legacy.keys()) == {"id", "label"}
        assert all(isinstance(v, str) for v in legacy.values())
