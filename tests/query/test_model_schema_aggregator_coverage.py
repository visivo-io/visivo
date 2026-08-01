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
        schema_dir = os.path.join(output_dir, DEFAULT_RUN_ID, "schemas")
        os.makedirs(schema_dir, exist_ok=True)
        with open(os.path.join(schema_dir, "orders.json"), "w") as fp:
            fp.write("{ this is not valid json ")

        assert ModelSchemaAggregator.load_model_schema("orders", output_dir) is None


class TestListStoredModelSchemasSkips:
    def test_skips_non_json_and_corrupt_entries(self, tmp_path):
        output_dir = str(tmp_path)
        schemas_root = os.path.join(output_dir, DEFAULT_RUN_ID, "schemas")
        os.makedirs(schemas_root, exist_ok=True)

        # A valid model schema.
        payload = ModelSchemaAggregator.build_envelope(
            name_hash="mh", model_name="orders", model_type="sql", columns={"id": "INT"}
        )
        with open(os.path.join(schemas_root, "orders.json"), "w") as fp:
            json.dump(payload, fp)

        # A non-JSON file → skipped. Under the old per-name-directory layout
        # `os.path.isdir` was the de-facto "is this a schema" filter; flat files
        # make the extension carry that, so this is the case that pins it.
        with open(os.path.join(schemas_root, "loose_file.txt"), "w") as fp:
            fp.write("ignore me")

        # A corrupt JSON file → skipped, not fatal to the whole listing.
        with open(os.path.join(schemas_root, "corrupt.json"), "w") as fp:
            fp.write("{ broken ")

        listed = ModelSchemaAggregator.list_stored_model_schemas(output_dir)

        # Only the one valid model entry survives all the skips.
        assert len(listed) == 1
        assert listed[0]["model_name"] == "orders"
