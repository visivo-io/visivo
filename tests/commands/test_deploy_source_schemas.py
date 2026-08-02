"""`visivo deploy` ships the source schema envelopes a run computed.

This is what makes a deployed project browsable. Nothing runs in cloud to
produce these — and for a file-backed duckdb/sqlite source nothing could, since
the database file never leaves the author's machine. Before this, a deploy
uploaded insights, models, inputs, dashboards and thumbnails, and left the
schemas on disk; every source in the editor then read
``has_cached_schema: false``.
"""

import json
import os
from unittest.mock import Mock, patch

import pytest

from visivo.commands.deploy_phase import upload_source_schemas


def _write(schemas_dir, filename, payload):
    os.makedirs(schemas_dir, exist_ok=True)
    with open(os.path.join(schemas_dir, filename), "w") as fp:
        json.dump(payload, fp)


def _source_envelope(name, total_tables=1):
    return {
        "source_name": name,
        "source_type": "duckdb",
        "generated_at": "2026-08-02T12:00:00",
        "tables": {"orders": {"columns": {"id": {"type": "INT"}}}},
        "metadata": {"total_tables": total_tables, "total_columns": 1},
    }


@pytest.fixture
def post():
    with patch("visivo.commands.deploy_phase.requests.post") as mock_post:
        mock_post.return_value = Mock(
            status_code=201, json=lambda: {"stored": 2}, raise_for_status=lambda: None
        )
        yield mock_post


class TestUploadSourceSchemas:
    def test_posts_every_source_envelope(self, tmp_path, post):
        schemas = os.path.join(str(tmp_path), "schemas")
        _write(schemas, "wh.json", _source_envelope("wh"))
        _write(schemas, "pie-data-source.json", _source_envelope("pie-data-source"))

        stored = upload_source_schemas(str(tmp_path), "proj-1", {}, "https://app")

        assert stored == 2
        body = json.loads(post.call_args.kwargs["data"])
        assert sorted(item["name"] for item in body) == ["pie-data-source", "wh"]
        assert body[0]["content"]["source_type"] == "duckdb"

    def test_scopes_the_request_to_the_project(self, tmp_path, post):
        _write(os.path.join(str(tmp_path), "schemas"), "wh.json", _source_envelope("wh"))

        upload_source_schemas(str(tmp_path), "proj-9", {}, "https://app")

        assert "project_id=proj-9" in post.call_args.args[0]

    def test_skips_model_schemas_sharing_the_directory(self, tmp_path, post):
        """Models and sources both write here; `source_name` tells them apart —
        the same key core classifies on."""
        schemas = os.path.join(str(tmp_path), "schemas")
        _write(schemas, "wh.json", _source_envelope("wh"))
        _write(schemas, "orders.json", {"model_name": "orders", "columns": {}})

        upload_source_schemas(str(tmp_path), "proj-1", {}, "https://app")

        body = json.loads(post.call_args.kwargs["data"])
        assert [item["name"] for item in body] == ["wh"]

    def test_a_corrupt_envelope_costs_only_itself(self, tmp_path, post):
        schemas = os.path.join(str(tmp_path), "schemas")
        _write(schemas, "wh.json", _source_envelope("wh"))
        with open(os.path.join(schemas, "broken.json"), "w") as fp:
            fp.write("{ not json")

        upload_source_schemas(str(tmp_path), "proj-1", {}, "https://app")

        body = json.loads(post.call_args.kwargs["data"])
        assert [item["name"] for item in body] == ["wh"]

    def test_no_schemas_directory_is_not_an_error(self, tmp_path, post):
        """A project that has never been run still deploys."""
        assert upload_source_schemas(str(tmp_path), "proj-1", {}, "https://app") == 0
        post.assert_not_called()

    def test_an_empty_schemas_directory_posts_nothing(self, tmp_path, post):
        os.makedirs(os.path.join(str(tmp_path), "schemas"), exist_ok=True)

        assert upload_source_schemas(str(tmp_path), "proj-1", {}, "https://app") == 0
        post.assert_not_called()

    def test_non_json_files_are_ignored(self, tmp_path, post):
        schemas = os.path.join(str(tmp_path), "schemas")
        _write(schemas, "wh.json", _source_envelope("wh"))
        with open(os.path.join(schemas, "notes.txt"), "w") as fp:
            fp.write("ignore me")

        upload_source_schemas(str(tmp_path), "proj-1", {}, "https://app")

        body = json.loads(post.call_args.kwargs["data"])
        assert [item["name"] for item in body] == ["wh"]
