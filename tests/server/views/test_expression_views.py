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
