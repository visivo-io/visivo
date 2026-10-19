"""Names are project-global. A save through any writer (an API route, the
agent's tools, a rename) goes through ``ObjectManager.save``, which refuses a
name another type holds, so the draft tier never holds a project that the
parse would reject."""

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from visivo.server.managers.chart_manager import ChartManager
from visivo.server.names import NameTakenError, name_clash

INSIGHT = {"props": {"type": "bar", "x": "?{ 1 }", "y": "?{ 2 }"}}
EXPRESSION = {"expression": "sum(1)"}


def _post(client, segment, name, body):
    return client.post(f"/api/{segment}/{name}/", json=body)


class TestApiRefusesATakenName:
    def test_a_chart_named_after_an_insight_is_a_409(self, integration_app, integration_client):
        assert _post(integration_client, "insights", "trips", INSIGHT).status_code == 201

        response = _post(integration_client, "charts", "trips", {"insights": []})

        assert response.status_code == 409
        assert "already the name of an insight" in response.get_json()["error"]
        assert integration_app.chart_manager.get("trips") is None

    def test_resaving_the_same_object_passes(self, integration_client):
        assert _post(integration_client, "insights", "trips", INSIGHT).status_code == 201
        assert _post(integration_client, "insights", "trips", INSIGHT).status_code == 201

    def test_a_name_freed_by_a_draft_delete_can_be_taken(self, integration_client):
        _post(integration_client, "insights", "trips", INSIGHT)
        integration_client.delete("/api/insights/trips/")

        assert _post(integration_client, "charts", "trips", {"insights": []}).status_code == 201

    @pytest.mark.parametrize(
        "segment,manager",
        [
            ("sources", "source_manager"),
            ("models", "model_manager"),
            ("dimensions", "dimension_manager"),
            ("metrics", "metric_manager"),
            ("relations", "relation_manager"),
            ("insights", "insight_manager"),
            ("inputs", "input_manager"),
            ("markdowns", "markdown_manager"),
            ("charts", "chart_manager"),
            ("tables", "table_manager"),
            ("dashboards", "dashboard_manager"),
        ],
    )
    def test_every_save_route_answers_409(
        self, integration_app, integration_client, segment, manager
    ):
        with patch.object(
            getattr(integration_app, manager),
            "save_from_config",
            side_effect=NameTakenError("'x' is already the name of a chart."),
        ):
            response = _post(integration_client, segment, "x", {"expression": "${ref(m).a}"})

        assert response.status_code == 409
        assert response.get_json() == {"error": "'x' is already the name of a chart."}


class TestModelScopedFields:
    """The parse lets fields under different models share a name, and nothing
    else. The check follows it, so the parent is set before the save."""

    def test_fields_under_different_models_may_share_a_name(self, integration_client):
        _post(integration_client, "dimensions", "total", {**EXPRESSION, "parentModel": "a"})

        response = _post(integration_client, "metrics", "total", {**EXPRESSION, "parentModel": "b"})

        assert response.status_code == 201

    def test_fields_under_the_same_model_may_not(self, integration_client):
        _post(integration_client, "dimensions", "total", {**EXPRESSION, "parentModel": "a"})

        response = _post(integration_client, "metrics", "total", {**EXPRESSION, "parentModel": "a"})

        assert response.status_code == 409

    def test_a_scoped_field_may_not_shadow_a_global_name(self, integration_client):
        _post(integration_client, "insights", "total", INSIGHT)

        response = _post(integration_client, "metrics", "total", {**EXPRESSION, "parentModel": "a"})

        assert response.status_code == 409

    def test_the_parent_reaches_the_saved_field(self, integration_app, integration_client):
        _post(integration_client, "metrics", "total", {**EXPRESSION, "parentModel": "a"})

        assert integration_app.metric_manager.get("total")._parent_name == "a"


class TestTheCheckItself:
    def test_a_bare_manager_checks_nothing(self):
        manager = ChartManager()
        manager.save("x", manager.validate_object({"name": "x", "insights": []}))
        assert manager.get("x") is not None

    def test_a_missing_manager_is_skipped(self):
        own = ChartManager()
        app = SimpleNamespace(chart_manager=own)
        assert name_clash(app, own, "x", object()) is None
