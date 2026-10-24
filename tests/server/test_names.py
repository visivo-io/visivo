"""Names are project-global. A save through any writer (an API route, the
agent's tools, a rename) goes through ``ObjectManager.save``, which refuses a
name another type holds, so the draft tier never holds a project that the
parse would reject."""

import os
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from tests.factories.model_factories import (
    MetricFactory,
    ProjectFactory,
    SourceFactory,
    SqlModelFactory,
)
from visivo.agent.tools import ToolError, call
from visivo.commands.utils import create_file_database
from visivo.server.flask_app import FlaskApp
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


SCOPE_ERROR = (
    "Metric/dimension name 'total_units' in model 'subs' collides with a project-level name"
)
SUBS_SQL = "select 1 as units"


def _subs_model(**fields):
    return {"name": "subs", "sql": SUBS_SQL, "source": "ref(source)", **fields}


@pytest.fixture
def published_inline_app(output_dir):
    """A project whose model ``subs`` defines the metric ``total_units`` inline."""
    abs_output_dir = os.path.abspath(output_dir)
    source = SourceFactory(database=f"{abs_output_dir}/test.sqlite")
    model = SqlModelFactory(
        name="subs",
        sql=SUBS_SQL,
        metrics=[MetricFactory(name="total_units", expression="sum(units)")],
    )
    project = ProjectFactory(sources=[source], models=[model])
    create_file_database(url=source.url(), output_dir=abs_output_dir)
    app = FlaskApp(abs_output_dir, project, working_dir=abs_output_dir)
    app.app.config["TESTING"] = True
    return app


class TestAProjectLevelFieldMayNotShadowAModelsInlineField:
    """``NamesValidator`` refuses a model's inline metric or dimension that shares
    a name with a project-level object. The save path refuses it too, so no writer
    can stage a draft that commits to a project that does not compile."""

    def test_the_agent_cannot_add_a_project_level_twin_of_a_published_inline_metric(
        self, published_inline_app
    ):
        config = {"name": "total_units", "expression": "sum(${ref(subs).units})"}

        with pytest.raises(ToolError, match=SCOPE_ERROR):
            call(published_inline_app, "write_metric", {"config": config})

        assert published_inline_app.metric_manager.cached_objects == {}

    def test_the_api_cannot_add_one_either(self, published_inline_app):
        client = published_inline_app.app.test_client()

        response = _post(
            client, "metrics", "total_units", {"expression": "sum(${ref(subs).units})"}
        )

        assert response.status_code == 409
        assert SCOPE_ERROR in response.get_json()["error"]
        assert published_inline_app.metric_manager.cached_objects == {}

    def test_validate_reports_it_before_a_write(self, published_inline_app):
        config = {"name": "total_units", "expression": "sum(${ref(subs).units})"}

        result = call(published_inline_app, "validate_metric", {"config": config})

        assert result["valid"] is False
        assert SCOPE_ERROR in result["error"]

    def test_the_inline_metric_itself_can_still_be_edited(self, published_inline_app):
        client = published_inline_app.app.test_client()

        response = _post(
            client, "metrics", "total_units", {"expression": "max(units)", "parentModel": "subs"}
        )

        assert response.status_code == 200
        assert published_inline_app.metric_manager.get("total_units").expression == "max(units)"

    def test_a_model_that_drops_its_inline_metric_frees_the_name(self, published_inline_app):
        call(published_inline_app, "write_model", {"config": _subs_model()})
        config = {"name": "total_units", "expression": "sum(${ref(subs).units})"}

        assert call(published_inline_app, "write_metric", {"config": config})["status"] == "draft"

    def test_the_agent_cannot_give_a_draft_model_an_inline_twin_of_a_draft_metric(
        self, integration_app
    ):
        config = {"name": "total_units", "expression": "sum(${ref(subs).units})"}
        call(integration_app, "write_metric", {"config": config})
        model = _subs_model(metrics=[{"name": "total_units", "expression": "sum(units)"}])

        with pytest.raises(ToolError, match=SCOPE_ERROR):
            call(integration_app, "write_model", {"config": model})

        assert integration_app.model_manager.get("subs") is None

    def test_nor_can_the_api(self, integration_app, integration_client):
        config = {"name": "total_units", "expression": "sum(${ref(subs).units})"}
        call(integration_app, "write_metric", {"config": config})
        model = _subs_model(metrics=[{"name": "total_units", "expression": "sum(units)"}])

        response = _post(integration_client, "models", "subs", model)

        assert response.status_code == 409
        assert SCOPE_ERROR in response.get_json()["error"]

    def test_a_metric_cannot_take_the_name_of_a_draft_models_inline_metric(self, integration_app):
        model = _subs_model(metrics=[{"name": "total_units", "expression": "sum(units)"}])
        call(integration_app, "write_model", {"config": model})
        config = {"name": "total_units", "expression": "sum(${ref(subs).units})"}

        with pytest.raises(ToolError, match=SCOPE_ERROR):
            call(integration_app, "write_metric", {"config": config})

    def test_an_insight_cannot_take_it_either(self, integration_app):
        model = _subs_model(metrics=[{"name": "total_units", "expression": "sum(units)"}])
        call(integration_app, "write_model", {"config": model})

        with pytest.raises(ToolError, match=SCOPE_ERROR):
            call(integration_app, "write_insight", {"config": {"name": "total_units", **INSIGHT}})
