"""Tests for the table preview endpoint and helper.

Uses the shared ``integration_app`` / ``integration_client`` fixtures which
spin up a real Flask app backed by a real SQLite file containing
``test_table`` and ``second_test_table`` rows (see ``commands/utils.py:create_file_database``).
"""

import json

import pytest

from visivo.server.source_metadata import preview_table_rows

SOURCE_NAME = "source"  # default name from SourceFactory
DB_NAME = "main"  # SqliteSource.list_databases() returns ["main"]
TABLE_NAME = "test_table"
PREVIEW_ENDPOINT = (
    f"/api/project/sources/{SOURCE_NAME}/databases/{DB_NAME}/tables/{TABLE_NAME}/preview/"
)


class TestPreviewEndpoint:
    """End-to-end tests for the /preview/ HTTP endpoints."""

    def test_preview_returns_columns_and_rows(self, integration_client):
        response = integration_client.get(PREVIEW_ENDPOINT)
        assert response.status_code == 200
        body = json.loads(response.data)

        assert body["source"] == SOURCE_NAME
        assert body["table"] == TABLE_NAME
        assert body["schema"] is None
        assert body["limit"] == 100

        # Columns should be a list of {name, type} dicts and contain x and y
        column_names = {c["name"] for c in body["columns"]}
        assert {"x", "y"}.issubset(column_names)
        for col in body["columns"]:
            assert "name" in col
            assert "type" in col

        # The seeded fixture inserts six rows in test_table
        assert isinstance(body["rows"], list)
        assert len(body["rows"]) == 6
        # Each row dict should contain the queried columns
        first_row = body["rows"][0]
        assert "x" in first_row
        assert "y" in first_row

    def test_preview_respects_limit_param(self, integration_client):
        response = integration_client.get(PREVIEW_ENDPOINT + "?limit=5")
        assert response.status_code == 200
        body = json.loads(response.data)

        assert body["limit"] == 5
        assert len(body["rows"]) <= 5

    def test_preview_caps_at_1000(self, integration_client):
        # Pass an unreasonably large limit, expect it to be clamped to 1000.
        response = integration_client.get(PREVIEW_ENDPOINT + "?limit=10000")
        assert response.status_code == 200
        body = json.loads(response.data)
        assert body["limit"] == 1000

    def test_preview_handles_unknown_table_gracefully(self, integration_client):
        bogus = (
            f"/api/project/sources/{SOURCE_NAME}/databases/{DB_NAME}"
            f"/tables/__no_such_table__/preview/"
        )
        response = integration_client.get(bogus)
        assert response.status_code == 500
        body = json.loads(response.data)
        assert "error" in body
        assert body["error"]  # non-empty error message

    def test_preview_unknown_source_returns_404(self, integration_client):
        bogus = "/api/project/sources/__no_source__/databases/main/" f"tables/{TABLE_NAME}/preview/"
        response = integration_client.get(bogus)
        assert response.status_code == 404
        body = json.loads(response.data)
        assert "not found" in body["error"]

    def test_preview_with_schema_route_404s_for_sqlite(self, integration_client):
        # SQLite has no schemas, so the schema-prefixed route should fail with 500
        # because schema lookup is not supported for SQLite.
        url = (
            f"/api/project/sources/{SOURCE_NAME}/databases/{DB_NAME}"
            f"/schemas/public/tables/{TABLE_NAME}/preview/"
        )
        response = integration_client.get(url)
        # Should not crash — returns 500 with a helpful error, not an unhandled
        # exception
        assert response.status_code == 500
        body = json.loads(response.data)
        assert "error" in body

    def test_preview_invalid_limit_falls_back_to_default(self, integration_client):
        response = integration_client.get(PREVIEW_ENDPOINT + "?limit=abc")
        # Flask's int() converter would 404 on a parameter mismatch, but we use
        # ?limit=... query param parsed inside the view, which falls back
        # gracefully.
        assert response.status_code == 200
        body = json.loads(response.data)
        assert body["limit"] == 100

    def test_preview_negative_limit_clamps_to_one(self, integration_client):
        response = integration_client.get(PREVIEW_ENDPOINT + "?limit=-5")
        assert response.status_code == 200
        body = json.loads(response.data)
        assert body["limit"] == 1
        assert len(body["rows"]) <= 1


class TestPreviewTableRowsHelper:
    """Direct unit tests for the helper to cover edge cases."""

    def test_returns_404_tuple_for_unknown_source(self, integration_app):
        sources = integration_app.source_manager.get_sources_list()
        result = preview_table_rows(sources, "__missing__", DB_NAME, TABLE_NAME)
        assert isinstance(result, tuple)
        body, status = result
        assert status == 404
        assert "not found" in body["error"]

    def test_clamps_limit_above_1000(self, integration_app):
        sources = integration_app.source_manager.get_sources_list()
        result = preview_table_rows(sources, SOURCE_NAME, DB_NAME, TABLE_NAME, None, 5000,)
        assert result["limit"] == 1000

    def test_clamps_limit_below_one(self, integration_app):
        sources = integration_app.source_manager.get_sources_list()
        result = preview_table_rows(sources, SOURCE_NAME, DB_NAME, TABLE_NAME, None, 0,)
        assert result["limit"] == 1

    def test_handles_non_int_limit(self, integration_app):
        sources = integration_app.source_manager.get_sources_list()
        result = preview_table_rows(sources, SOURCE_NAME, DB_NAME, TABLE_NAME, None, "bogus",)
        # Falls back to default (100) which is then satisfied by the seed data
        assert result["limit"] == 100

    def test_truncated_flag_when_limit_below_total(self, integration_app):
        # The seeded test_table has 6 rows; limit=2 should mark truncated.
        sources = integration_app.source_manager.get_sources_list()
        result = preview_table_rows(sources, SOURCE_NAME, DB_NAME, TABLE_NAME, None, 2,)
        assert result["limit"] == 2
        assert result["row_count"] == 2
        assert result["truncated"] is True

    def test_truncated_flag_false_when_under_limit(self, integration_app):
        sources = integration_app.source_manager.get_sources_list()
        result = preview_table_rows(sources, SOURCE_NAME, DB_NAME, TABLE_NAME, None, 500,)
        # 6 < 500, so truncated should be False
        assert result["truncated"] is False
        assert result["row_count"] == 6
