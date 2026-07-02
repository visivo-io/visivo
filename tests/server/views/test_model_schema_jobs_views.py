"""Tests for the read-only model schema Flask views."""

import json
import os

import pytest
from unittest.mock import Mock
from flask import Flask

from visivo.constants import DEFAULT_RUN_ID
from visivo.query.model_schema_aggregator import ModelSchemaAggregator
from visivo.server.views.model_schema_jobs_views import register_model_schema_jobs_views


def _write_model_schema(output_dir, model_name, columns, run_id=DEFAULT_RUN_ID):
    """Write a model schema artifact via the aggregator and return the payload."""
    payload = ModelSchemaAggregator.build_envelope(
        name_hash="mhash",
        model_name=model_name,
        model_type="sql",
        columns=columns,
        source_dialect="duckdb",
    )
    schema_dir = os.path.join(output_dir, run_id, "schemas", model_name)
    os.makedirs(schema_dir, exist_ok=True)
    with open(os.path.join(schema_dir, "schema.json"), "w") as fp:
        json.dump(payload, fp)
    return payload


class TestModelSchemaViews:
    @pytest.fixture
    def output_dir(self, tmp_path):
        return str(tmp_path)

    @pytest.fixture
    def app(self, output_dir):
        app = Flask(__name__)
        app.config["TESTING"] = True
        flask_app = Mock()
        register_model_schema_jobs_views(app, flask_app, output_dir)
        return app

    @pytest.fixture
    def client(self, app):
        return app.test_client()


class TestGetModelSchema(TestModelSchemaViews):
    def test_returns_envelope_for_written_artifact(self, client, output_dir):
        _write_model_schema(
            output_dir,
            "orders",
            {"id": "INT", "name": "VARCHAR", "total": "DOUBLE"},
        )

        response = client.get("/api/model-schema-jobs/orders/")
        assert response.status_code == 200
        data = response.get_json()
        assert data["model_name"] == "orders"
        assert data["model_type"] == "sql"
        assert data["columns"]["id"] == {"type": "INT", "nullable": True}
        # Legacy hash block preserved on the served artifact.
        assert data["mhash"] == {"id": "INT", "name": "VARCHAR", "total": "DOUBLE"}

    def test_404_for_unwritten_model(self, client):
        response = client.get("/api/model-schema-jobs/never_run/")
        assert response.status_code == 404
        data = response.get_json()
        assert "message" in data
        assert "never_run" in data["message"]

    def test_explicit_run_id_honored(self, client, output_dir):
        _write_model_schema(output_dir, "orders", {"id": "INT"}, run_id="preview-orders")

        # Default fallback would miss (no main), but explicit run_id hits.
        miss = client.get("/api/model-schema-jobs/orders/?run_id=main")
        assert miss.status_code == 404

        hit = client.get("/api/model-schema-jobs/orders/?run_id=preview-orders")
        assert hit.status_code == 200
        assert hit.get_json()["model_name"] == "orders"

    def test_no_preview_name_fallback(self, client, output_dir):
        """A ``preview-<model_name>`` artifact must NOT be served by the default
        fallback (finding #3): preview model runs are keyed ``preview-<uuid>``,
        and the ``preview-<name>`` shape belongs to sources — falling back to it
        could surface a source-shaped artifact for a same-named model. Before the
        fix this returned 200 with the preview artifact."""
        _write_model_schema(output_dir, "orders", {"id": "INT"}, run_id="preview-orders")

        response = client.get("/api/model-schema-jobs/orders/")
        assert response.status_code == 404


class TestListModelSchemaColumns(TestModelSchemaViews):
    def test_returns_sorted_column_rows(self, client, output_dir):
        _write_model_schema(
            output_dir,
            "orders",
            {"total": "DOUBLE", "id": "INT", "name": "VARCHAR"},
        )

        response = client.get("/api/model-schema-jobs/orders/columns/")
        assert response.status_code == 200
        data = response.get_json()
        assert [c["name"] for c in data] == ["id", "name", "total"]
        assert data[0] == {"name": "id", "type": "INT", "nullable": True}

    def test_respects_search(self, client, output_dir):
        _write_model_schema(
            output_dir,
            "orders",
            {"id": "INT", "user_id": "INT", "name": "VARCHAR"},
        )

        response = client.get("/api/model-schema-jobs/orders/columns/?search=id")
        assert response.status_code == 200
        names = [c["name"] for c in response.get_json()]
        assert names == ["id", "user_id"]
        assert "name" not in names

    def test_404_for_unwritten_model(self, client):
        response = client.get("/api/model-schema-jobs/never_run/columns/")
        assert response.status_code == 404
        assert "never_run" in response.get_json()["message"]

    def test_column_rows_carry_nullable_from_envelope(self, client, output_dir):
        _write_model_schema(
            output_dir,
            "csv_model",
            {
                "id": {"type": "BIGINT", "nullable": False},
                "label": {"type": "VARCHAR", "nullable": True},
            },
        )

        response = client.get("/api/model-schema-jobs/csv_model/columns/")
        assert response.status_code == 200
        rows = {c["name"]: c for c in response.get_json()}
        assert rows["id"]["nullable"] is False
        assert rows["label"]["nullable"] is True

    def test_columns_falls_back_to_legacy_hash_block(self, client, output_dir):
        """A legacy pre-envelope artifact — ``{name_hash: {col: type}}`` with no
        ``columns`` key — must still surface its columns (finding #4). Before the
        fix this returned an empty 200, hiding real columns after upgrade until
        the next successful run rewrote the enveloped shape."""
        schema_dir = os.path.join(output_dir, DEFAULT_RUN_ID, "schemas", "legacy_model")
        os.makedirs(schema_dir, exist_ok=True)
        with open(os.path.join(schema_dir, "schema.json"), "w") as fp:
            json.dump({"abc123hash": {"id": "INT", "name": "VARCHAR"}}, fp)

        response = client.get("/api/model-schema-jobs/legacy_model/columns/")
        assert response.status_code == 200
        rows = response.get_json()
        assert [r["name"] for r in rows] == ["id", "name"]
        assert {r["name"]: r["type"] for r in rows} == {"id": "INT", "name": "VARCHAR"}
        # Legacy artifacts carry no nullability info — reported as unknown (null).
        assert all(r["nullable"] is None for r in rows)

    def test_legacy_columns_respect_search(self, client, output_dir):
        """The legacy fallback path honors ?search= like the enveloped path."""
        schema_dir = os.path.join(output_dir, DEFAULT_RUN_ID, "schemas", "legacy_model")
        os.makedirs(schema_dir, exist_ok=True)
        with open(os.path.join(schema_dir, "schema.json"), "w") as fp:
            json.dump({"hash": {"id": "INT", "user_id": "INT", "name": "VARCHAR"}}, fp)

        response = client.get("/api/model-schema-jobs/legacy_model/columns/?search=id")
        assert response.status_code == 200
        assert [c["name"] for c in response.get_json()] == ["id", "user_id"]


class TestModelSchemaPathTraversal(TestModelSchemaViews):
    """Path-traversal guard on the run_id query param (finding #2)."""

    @pytest.mark.parametrize("bad_run_id", ["../../etc", "..", "a/b", "foo..bar", ""])
    def test_schema_rejects_unsafe_run_id(self, client, output_dir, bad_run_id):
        _write_model_schema(output_dir, "orders", {"id": "INT"})
        response = client.get(f"/api/model-schema-jobs/orders/?run_id={bad_run_id}")
        assert response.status_code == 400

    @pytest.mark.parametrize("bad_run_id", ["../../etc", "..", "a/b", "foo..bar", ""])
    def test_columns_rejects_unsafe_run_id(self, client, output_dir, bad_run_id):
        _write_model_schema(output_dir, "orders", {"id": "INT"})
        response = client.get(f"/api/model-schema-jobs/orders/columns/?run_id={bad_run_id}")
        assert response.status_code == 400

    def test_safe_run_id_still_served(self, client, output_dir):
        """The guard must not reject legitimate run_ids (main / preview-<uuid>)."""
        _write_model_schema(output_dir, "orders", {"id": "INT"}, run_id="preview-abc-123")
        response = client.get("/api/model-schema-jobs/orders/?run_id=preview-abc-123")
        assert response.status_code == 200
