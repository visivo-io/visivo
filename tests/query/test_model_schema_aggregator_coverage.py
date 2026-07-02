"""Coverage-focused tests for ModelSchemaAggregator load/list edge cases.

Targets the error/skip arms the primary suite doesn't: a corrupt artifact on
load, and the listing skips for non-directory entries, dirs missing a
schema.json, and unreadable schema files.
"""

import json
import os

from visivo.constants import DEFAULT_RUN_ID
from visivo.query.model_schema_aggregator import ModelSchemaAggregator


class TestLoadModelSchemaErrors:
    def test_corrupt_json_returns_none(self, tmp_path):
        output_dir = str(tmp_path)
        schema_dir = os.path.join(output_dir, DEFAULT_RUN_ID, "schemas", "orders")
        os.makedirs(schema_dir, exist_ok=True)
        with open(os.path.join(schema_dir, "schema.json"), "w") as fp:
            fp.write("{ this is not valid json ")

        assert ModelSchemaAggregator.load_model_schema("orders", output_dir) is None


class TestListStoredModelSchemasSkips:
    def test_skips_non_directory_missing_and_corrupt_entries(self, tmp_path):
        output_dir = str(tmp_path)
        schemas_root = os.path.join(output_dir, DEFAULT_RUN_ID, "schemas")
        os.makedirs(schemas_root, exist_ok=True)

        # A valid model schema dir.
        good_dir = os.path.join(schemas_root, "orders")
        os.makedirs(good_dir, exist_ok=True)
        payload = ModelSchemaAggregator.build_envelope(
            name_hash="mh", model_name="orders", model_type="sql", columns={"id": "INT"}
        )
        with open(os.path.join(good_dir, "schema.json"), "w") as fp:
            json.dump(payload, fp)

        # A plain file (not a directory) in the schemas dir → skipped.
        with open(os.path.join(schemas_root, "loose_file.txt"), "w") as fp:
            fp.write("ignore me")

        # A directory with no schema.json → skipped.
        os.makedirs(os.path.join(schemas_root, "empty_dir"), exist_ok=True)

        # A directory with a corrupt schema.json → skipped.
        corrupt_dir = os.path.join(schemas_root, "corrupt")
        os.makedirs(corrupt_dir, exist_ok=True)
        with open(os.path.join(corrupt_dir, "schema.json"), "w") as fp:
            fp.write("{ broken ")

        listed = ModelSchemaAggregator.list_stored_model_schemas(output_dir)

        # Only the one valid model entry survives all the skips.
        assert len(listed) == 1
        assert listed[0]["model_name"] == "orders"
