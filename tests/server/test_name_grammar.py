"""One name rule per type, enforced where a name is created, so every writer
refuses the names the viewer refuses. Names a parsed project already holds stay
editable: older YAML may carry spaces."""

import os
from unittest.mock import patch
from urllib.parse import quote

import pytest

from tests.factories.model_factories import ChartFactory, ProjectFactory, SourceFactory
from visivo.agent.tools import ToolError, call
from visivo.commands.utils import create_file_database
from visivo.models.base.named_model import (
    NEW_NAME_MESSAGE,
    SQL_IDENTIFIER_NAME_MESSAGE,
    new_name_error,
)
from visivo.models.chart import Chart
from visivo.models.dimension import Dimension
from visivo.models.metric import Metric
from visivo.server.managers.chart_manager import ChartManager
from visivo.server.managers.object_manager import SaveRefusedError

BAD = "Monthly revenue by region"
INSIGHT = {"props": {"type": "bar", "x": "?{ 1 }", "y": "?{ 2 }"}}


@pytest.fixture
def legacy_app(output_dir):
    """A parsed project with a chart whose name has spaces."""
    from visivo.server.flask_app import FlaskApp

    abs_output_dir = os.path.abspath(output_dir)
    source = SourceFactory(database=f"{abs_output_dir}/test.sqlite")
    project = ProjectFactory(
        sources=[source], dashboards=[], charts=[ChartFactory(name="Old chart")]
    )
    create_file_database(url=source.url(), output_dir=abs_output_dir)
    app = FlaskApp(abs_output_dir, project, working_dir=abs_output_dir)
    app.app.config["TESTING"] = True
    return app


class TestTheRule:
    @pytest.mark.parametrize("name", ["revenue", "Revenue-2024", "2024_revenue", "a"])
    def test_a_general_name(self, name):
        assert new_name_error(Chart, name) is None

    @pytest.mark.parametrize("name", [BAD, "_revenue", "-revenue", "rev.enue", "", "rev\n"])
    def test_a_bad_general_name(self, name):
        assert new_name_error(Chart, name) == NEW_NAME_MESSAGE

    @pytest.mark.parametrize("model_class", [Metric, Dimension])
    def test_a_metric_or_dimension_uses_the_pattern_its_field_publishes(self, model_class):
        assert new_name_error(model_class, "_total") is None
        assert new_name_error(model_class, "total-mrr") == SQL_IDENTIFIER_NAME_MESSAGE
        assert new_name_error(model_class, "2024_total") == SQL_IDENTIFIER_NAME_MESSAGE

    def test_the_viewer_states_the_same_rule(self):
        """The viewer's ``namedModel.js`` holds the copy a person sees."""
        viewer = os.path.join(
            os.path.dirname(__file__), "../../viewer/src/components/views/common/namedModel.js"
        )
        with open(viewer) as handle:
            source = handle.read()
        assert "/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/" in source
        assert NEW_NAME_MESSAGE in source
        assert SQL_IDENTIFIER_NAME_MESSAGE in source


class TestEveryWriterRefusesABadNewName:
    def test_the_agent_write(self, integration_app):
        with pytest.raises(ToolError, match=f"Invalid chart: {NEW_NAME_MESSAGE}"):
            call(integration_app, "write_chart", {"config": {"name": BAD, "insights": []}})
        assert integration_app.chart_manager.get(BAD) is None

    def test_the_agent_validate(self, integration_app):
        result = call(integration_app, "validate_chart", {"config": {"name": BAD, "insights": []}})
        assert result == {"valid": False, "error": f"Invalid chart: {NEW_NAME_MESSAGE}"}

    @pytest.mark.parametrize(
        "segment,body",
        [
            ("charts", {"insights": []}),
            ("insights", INSIGHT),
            ("tables", {"columns": []}),
            ("markdowns", {"content": "hi"}),
            ("dashboards", {"rows": []}),
            ("models", {"sql": "select 1 as x", "source": "ref(source)"}),
        ],
    )
    def test_the_api(self, integration_app, integration_client, segment, body):
        response = integration_client.post(f"/api/{segment}/{quote(BAD)}/", json=body)

        assert response.status_code == 400
        assert response.get_json() == {"error": NEW_NAME_MESSAGE}

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
    def test_every_save_route_answers_400(
        self, integration_app, integration_client, segment, manager
    ):
        with patch.object(
            getattr(integration_app, manager),
            "save_from_config",
            side_effect=SaveRefusedError(NEW_NAME_MESSAGE),
        ):
            response = integration_client.post(
                f"/api/{segment}/x/", json={"expression": "${ref(m).a}", "sql": "select 1 as a"}
            )

        assert response.status_code == 400
        assert response.get_json() == {"error": NEW_NAME_MESSAGE}

    def test_a_rename(self, integration_client):
        integration_client.post("/api/charts/good/", json={"insights": []})

        response = integration_client.post(
            "/api/rename/", json={"type": "charts", "old_name": "good", "new_name": BAD}
        )

        assert response.status_code == 400
        assert response.get_json() == {"error": NEW_NAME_MESSAGE}

    def test_a_good_name_saves(self, integration_app):
        call(
            integration_app, "write_chart", {"config": {"name": "monthly-revenue", "insights": []}}
        )
        assert integration_app.chart_manager.get("monthly-revenue") is not None


class TestANameTheProjectAlreadyHoldsStaysEditable:
    def test_an_edit_through_the_api(self, legacy_app):
        client = legacy_app.app.test_client()

        response = client.post(f"/api/charts/{quote('Old chart')}/", json={"insights": []})

        assert response.status_code == 200

    def test_an_edit_through_the_agent(self, legacy_app):
        call(legacy_app, "write_chart", {"config": {"name": "Old chart", "insights": []}})
        assert legacy_app.chart_manager.get_status("Old chart").value == "modified"

    def test_a_cached_draft_under_an_old_name(self):
        manager = ChartManager()
        manager.cached_objects[BAD] = manager.validate_object({"name": BAD, "insights": []})

        manager.save(BAD, manager.validate_object({"name": BAD, "insights": []}))

    def test_a_bare_manager_refuses_a_new_one(self):
        manager = ChartManager()
        with pytest.raises(SaveRefusedError, match=NEW_NAME_MESSAGE):
            manager.save(BAD, manager.validate_object({"name": BAD, "insights": []}))

    def test_a_deletion_is_not_checked(self):
        manager = ChartManager()
        manager.save(BAD, None)
