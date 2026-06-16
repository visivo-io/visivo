"""Tests for the read-only model schema Flask views."""

import json
import os

import pytest
from unittest.mock import Mock
from flask import Flask

from visivo.constants import DEFAULT_RUN_ID
from visivo.query.model_schema_aggregator import ModelSchemaAggregator
from visivo.server.views.model_schema_views import register_model_schema_views


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
        register_model_schema_views(app, flask_app, output_dir)
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

        response = client.get("/api/models/orders/schema/")
        assert response.status_code == 200
        data = response.get_json()
        assert data["model_name"] == "orders"
        assert data["model_type"] == "sql"
        assert data["columns"]["id"] == {"type": "INT", "nullable": True}
        # Legacy hash block preserved on the served artifact.
        assert data["mhash"] == {"id": "INT", "name": "VARCHAR", "total": "DOUBLE"}

    def test_404_for_unwritten_model(self, client):
        response = client.get("/api/models/never_run/schema/")
        assert response.status_code == 404
        data = response.get_json()
        assert "message" in data
        assert "never_run" in data["message"]

    def test_explicit_run_id_honored(self, client, output_dir):
        _write_model_schema(output_dir, "orders", {"id": "INT"}, run_id="preview-orders")

        # Default fallback would miss (no main), but explicit run_id hits.
        miss = client.get("/api/models/orders/schema/?run_id=main")
        assert miss.status_code == 404

        hit = client.get("/api/models/orders/schema/?run_id=preview-orders")
        assert hit.status_code == 200
        assert hit.get_json()["model_name"] == "orders"

    def test_fallback_main_then_preview(self, client, output_dir):
        # No main artifact; only a preview-<name> one exists.
        _write_model_schema(output_dir, "orders", {"id": "INT"}, run_id="preview-orders")

        response = client.get("/api/models/orders/schema/")
        assert response.status_code == 200
        assert response.get_json()["model_name"] == "orders"


class TestListModelSchemaColumns(TestModelSchemaViews):
    def test_returns_sorted_column_rows(self, client, output_dir):
        _write_model_schema(
            output_dir,
            "orders",
            {"total": "DOUBLE", "id": "INT", "name": "VARCHAR"},
        )

        response = client.get("/api/models/orders/schema/columns/")
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

        response = client.get("/api/models/orders/schema/columns/?search=id")
        assert response.status_code == 200
        names = [c["name"] for c in response.get_json()]
        assert names == ["id", "user_id"]
        assert "name" not in names

    def test_404_for_unwritten_model(self, client):
        response = client.get("/api/models/never_run/schema/columns/")
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

        response = client.get("/api/models/csv_model/schema/columns/")
        assert response.status_code == 200
        rows = {c["name"]: c for c in response.get_json()}
        assert rows["id"]["nullable"] is False
        assert rows["label"]["nullable"] is True
