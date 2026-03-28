import pytest
from unittest.mock import Mock
from flask import Flask

from visivo.server.views.expression_views import register_expression_views


class TestExpressionViews:

    @pytest.fixture
    def app(self):
        app = Flask(__name__)
        app.config["TESTING"] = True

        flask_app = Mock()
        register_expression_views(app, flask_app, "/tmp/output")
        return app

    @pytest.fixture
    def client(self, app):
        return app.test_client()

    def test_translate_simple_expression(self, client):
        response = client.post(
            "/api/expressions/translate/",
            json={
                "expressions": [{"name": "total", "expression": "SUM(amount)", "type": "metric"}],
                "source_dialect": "duckdb",
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert len(data["translations"]) == 1
        assert data["translations"][0]["name"] == "total"
        assert data["translations"][0]["duckdb_expression"] is not None

    def test_detect_metric_type_for_aggregate(self, client):
        response = client.post(
            "/api/expressions/translate/",
            json={
                "expressions": [{"name": "t", "expression": "SUM(amount)", "type": ""}],
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["translations"][0]["detected_type"] == "metric"

    def test_detect_dimension_type_for_non_aggregate(self, client):
        response = client.post(
            "/api/expressions/translate/",
            json={
                "expressions": [{"name": "t", "expression": "UPPER(name)", "type": ""}],
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["translations"][0]["detected_type"] == "dimension"

    def test_detect_metric_for_count_distinct(self, client):
        response = client.post(
            "/api/expressions/translate/",
            json={
                "expressions": [{"name": "t", "expression": "COUNT(DISTINCT id)", "type": ""}],
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["translations"][0]["detected_type"] == "metric"

    def test_detect_metric_for_avg(self, client):
        response = client.post(
            "/api/expressions/translate/",
            json={
                "expressions": [{"name": "t", "expression": "AVG(price)", "type": ""}],
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["translations"][0]["detected_type"] == "metric"

    def test_empty_expressions_returns_empty(self, client):
        response = client.post(
            "/api/expressions/translate/",
            json={"expressions": []},
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["translations"] == []
        assert data["errors"] == []

    def test_invalid_expression_returns_error(self, client):
        response = client.post(
            "/api/expressions/translate/",
            json={
                "expressions": [{"name": "bad", "expression": "SUM(", "type": ""}],
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert len(data["errors"]) == 1
        assert data["errors"][0]["name"] == "bad"

    def test_no_body_returns_400(self, client):
        response = client.post(
            "/api/expressions/translate/",
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_expression_containing_select_keyword(self, client):
        response = client.post(
            "/api/expressions/translate/",
            json={
                "expressions": [
                    {
                        "name": "has_select",
                        "expression": "CASE WHEN status = 'SELECT' THEN 1 ELSE 0 END",
                        "type": "dimension",
                    }
                ],
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert len(data["errors"]) == 0
        expr = data["translations"][0]["duckdb_expression"]
        assert "CASE" in expr
        assert "'SELECT'" in expr or "SELECT" in expr

    def test_cross_dialect_transpilation(self, client):
        response = client.post(
            "/api/expressions/translate/",
            json={
                "expressions": [
                    {"name": "pg_cast", "expression": "NOW()::DATE", "type": "dimension"}
                ],
                "source_dialect": "postgres",
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert len(data["errors"]) == 0
        expr = data["translations"][0]["duckdb_expression"]
        assert expr is not None
        assert len(expr) > 0

    def test_multiple_expressions_per_request(self, client):
        response = client.post(
            "/api/expressions/translate/",
            json={
                "expressions": [
                    {"name": "a", "expression": "SUM(x)", "type": ""},
                    {"name": "b", "expression": "UPPER(name)", "type": ""},
                    {"name": "c", "expression": "COUNT(*)", "type": ""},
                ],
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert len(data["translations"]) == 3
        assert data["translations"][0]["detected_type"] == "metric"
        assert data["translations"][1]["detected_type"] == "dimension"
        assert data["translations"][2]["detected_type"] == "metric"

    def test_unknown_source_dialect_falls_back(self, client):
        response = client.post(
            "/api/expressions/translate/",
            json={
                "expressions": [
                    {"name": "t", "expression": "SUM(amount)", "type": "metric"}
                ],
                "source_dialect": "foobar_nonexistent",
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert len(data["translations"]) == 1
        assert data["translations"][0]["duckdb_expression"] is not None
