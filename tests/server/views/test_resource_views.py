"""CRUD endpoint coverage for the per-type resource views.

The views are thin: each delegates to a manager on ``flask_app`` and shapes the
JSON/status. Following the existing ``test_sources_views.py`` pattern, we mount
each ``register_*`` blueprint on a bare Flask app with a mocked ``flask_app`` and
drive the routes through the test client. The six "uniform" views share an
identical manager contract; dimensions/metrics additionally read cached models
off ``model_manager``; defaults is a singleton backed by the real model.
"""

import pytest
from unittest.mock import Mock
from flask import Flask

from visivo.server.managers.object_manager import ObjectStatus
from visivo.models.defaults import Defaults
from visivo.server.views.charts_views import register_charts_views
from visivo.server.views.relations_views import register_relations_views
from visivo.server.views.tables_views import register_tables_views
from visivo.server.views.markdowns_views import register_markdowns_views
from visivo.server.views.inputs_views import register_inputs_views
from visivo.server.views.insights_views import register_insights_views
from visivo.server.views.dimension_views import register_dimension_views
from visivo.server.views.metrics_views import register_metrics_views
from visivo.server.views.defaults_views import register_defaults_views


def _client(register):
    """Mount a register_* blueprint on a fresh app with a mocked flask_app."""
    app = Flask(__name__)
    app.config["TESTING"] = True
    flask_app = Mock()
    register(app, flask_app, "/tmp/output")
    return app.test_client(), flask_app


UNIFORM = [
    (
        "charts",
        register_charts_views,
        "chart_manager",
        "get_all_charts_with_status",
        "get_chart_with_status",
    ),
    (
        "relations",
        register_relations_views,
        "relation_manager",
        "get_all_relations_with_status",
        "get_relation_with_status",
    ),
    (
        "tables",
        register_tables_views,
        "table_manager",
        "get_all_tables_with_status",
        "get_table_with_status",
    ),
    (
        "markdowns",
        register_markdowns_views,
        "markdown_manager",
        "get_all_markdowns_with_status",
        "get_markdown_with_status",
    ),
    (
        "inputs",
        register_inputs_views,
        "input_manager",
        "get_all_inputs_with_status",
        "get_input_with_status",
    ),
    (
        "insights",
        register_insights_views,
        "insight_manager",
        "get_all_insights_with_status",
        "get_insight_with_status",
    ),
]


@pytest.mark.parametrize("key,register,mgr_attr,get_all,get_one", UNIFORM)
class TestUniformResourceViews:
    def test_list_returns_items(self, key, register, mgr_attr, get_all, get_one):
        client, fa = _client(register)
        getattr(getattr(fa, mgr_attr), get_all).return_value = [
            {"name": "a", "status": "published"}
        ]
        resp = client.get(f"/api/{key}/")
        assert resp.status_code == 200
        assert resp.get_json()[key] == [{"name": "a", "status": "published"}]

    def test_list_handles_manager_error(self, key, register, mgr_attr, get_all, get_one):
        client, fa = _client(register)
        getattr(getattr(fa, mgr_attr), get_all).side_effect = RuntimeError("boom")
        resp = client.get(f"/api/{key}/")
        assert resp.status_code == 500
        assert "error" in resp.get_json()

    def test_get_found(self, key, register, mgr_attr, get_all, get_one):
        client, fa = _client(register)
        getattr(getattr(fa, mgr_attr), get_one).return_value = {"name": "a", "status": "published"}
        resp = client.get(f"/api/{key}/a/")
        assert resp.status_code == 200
        assert resp.get_json()["name"] == "a"

    def test_get_not_found(self, key, register, mgr_attr, get_all, get_one):
        client, fa = _client(register)
        getattr(getattr(fa, mgr_attr), get_one).return_value = None
        resp = client.get(f"/api/{key}/missing/")
        assert resp.status_code == 404
        assert "error" in resp.get_json()

    def test_save(self, key, register, mgr_attr, get_all, get_one):
        client, fa = _client(register)
        mgr = getattr(fa, mgr_attr)
        mgr.save_from_config.return_value = Mock()
        mgr.get_status.return_value = ObjectStatus.NEW
        resp = client.post(f"/api/{key}/a/", json={"foo": "bar"})
        assert resp.status_code == 200
        assert resp.get_json()["status"] == "new"
        # name is forced to match the URL parameter
        assert mgr.save_from_config.call_args[0][0]["name"] == "a"

    def test_save_no_config(self, key, register, mgr_attr, get_all, get_one):
        client, fa = _client(register)
        resp = client.post(f"/api/{key}/a/", content_type="application/json")
        assert resp.status_code == 400
        assert "error" in resp.get_json()

    def test_delete(self, key, register, mgr_attr, get_all, get_one):
        client, fa = _client(register)
        getattr(fa, mgr_attr).mark_for_deletion.return_value = True
        resp = client.delete(f"/api/{key}/a/")
        assert resp.status_code == 200
        assert resp.get_json()["status"] == "deleted"

    def test_delete_not_found(self, key, register, mgr_attr, get_all, get_one):
        client, fa = _client(register)
        getattr(fa, mgr_attr).mark_for_deletion.return_value = False
        resp = client.delete(f"/api/{key}/missing/")
        assert resp.status_code == 404
        assert "error" in resp.get_json()

    def test_validate_valid(self, key, register, mgr_attr, get_all, get_one):
        client, fa = _client(register)
        getattr(fa, mgr_attr).validate_config.return_value = {"valid": True}
        resp = client.post(f"/api/{key}/a/validate/", json={"foo": "bar"})
        assert resp.status_code == 200
        assert resp.get_json()["valid"] is True

    def test_validate_invalid(self, key, register, mgr_attr, get_all, get_one):
        client, fa = _client(register)
        getattr(fa, mgr_attr).validate_config.return_value = {"valid": False, "error": "bad"}
        resp = client.post(f"/api/{key}/a/validate/", json={"foo": "bar"})
        assert resp.status_code == 400
        assert resp.get_json()["valid"] is False


# Dimensions/metrics are model-scoped: the list endpoint walks cached models off
# model_manager before delegating to the type manager.
DIMLIKE = [
    (
        "dimensions",
        register_dimension_views,
        "dimension_manager",
        "get_all_dimensions_with_status",
        "get_dimension_with_status",
    ),
    (
        "metrics",
        register_metrics_views,
        "metric_manager",
        "get_all_metrics_with_status",
        "get_metric_with_status",
    ),
]


@pytest.mark.parametrize("key,register,mgr_attr,get_all,get_one", DIMLIKE)
class TestModelScopedResourceViews:
    def test_list_returns_items(self, key, register, mgr_attr, get_all, get_one):
        client, fa = _client(register)
        fa.model_manager.cached_objects = {}
        getattr(getattr(fa, mgr_attr), get_all).return_value = [{"name": "d", "status": "new"}]
        resp = client.get(f"/api/{key}/")
        assert resp.status_code == 200
        assert resp.get_json()[key] == [{"name": "d", "status": "new"}]

    def test_get_not_found(self, key, register, mgr_attr, get_all, get_one):
        client, fa = _client(register)
        getattr(getattr(fa, mgr_attr), get_one).return_value = None
        resp = client.get(f"/api/{key}/missing/")
        assert resp.status_code == 404

    def test_save(self, key, register, mgr_attr, get_all, get_one):
        client, fa = _client(register)
        mgr = getattr(fa, mgr_attr)
        mgr.save_from_config.return_value = Mock()
        mgr.get_status.return_value = ObjectStatus.NEW
        resp = client.post(f"/api/{key}/d/", json={"expression": "sum(x)"})
        assert resp.status_code == 200
        assert resp.get_json()["status"] == "new"

    def test_delete(self, key, register, mgr_attr, get_all, get_one):
        client, fa = _client(register)
        getattr(fa, mgr_attr).mark_for_deletion.return_value = True
        resp = client.delete(f"/api/{key}/d/")
        assert resp.status_code == 200
        assert resp.get_json()["status"] == "deleted"

    def test_validate_invalid(self, key, register, mgr_attr, get_all, get_one):
        client, fa = _client(register)
        getattr(fa, mgr_attr).validate_config.return_value = {"valid": False}
        resp = client.post(f"/api/{key}/d/validate/", json={"expression": "x"})
        assert resp.status_code == 400


class TestDefaultsViews:
    def test_get_empty_when_no_defaults(self):
        client, fa = _client(register_defaults_views)
        fa._cached_defaults = None
        fa.project.defaults = None
        resp = client.get("/api/defaults/")
        assert resp.status_code == 200
        assert resp.get_json() == {}

    def test_get_returns_cached_defaults(self):
        client, fa = _client(register_defaults_views)
        fa._cached_defaults = Defaults(source_name="db", threads=4)
        resp = client.get("/api/defaults/")
        assert resp.status_code == 200
        assert resp.get_json()["source_name"] == "db"

    def test_save_valid(self):
        client, fa = _client(register_defaults_views)
        resp = client.post("/api/defaults/", json={"source_name": "db"})
        assert resp.status_code == 200
        assert "saved" in resp.get_json()["message"].lower()

    def test_save_no_config(self):
        client, fa = _client(register_defaults_views)
        resp = client.post("/api/defaults/", content_type="application/json")
        assert resp.status_code == 400
        assert "error" in resp.get_json()

    def test_save_invalid_config(self):
        client, fa = _client(register_defaults_views)
        resp = client.post("/api/defaults/", json={"unknown_field": "x"})
        assert resp.status_code == 400
        assert "error" in resp.get_json()
