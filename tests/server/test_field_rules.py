"""A metric aggregates, and a project-level metric or dimension reads one source.
Both rules live in the managers' ``save_error``, so the API routes and the agent
tools refuse the same draft with the same text."""

import os

import pytest

from tests.factories.model_factories import (
    DimensionFactory,
    MetricFactory,
    ProjectFactory,
    SourceFactory,
    SqlModelFactory,
)
from tests.agent.test_remote import _envelope, _project
from visivo.agent.tools import ToolError, call
from visivo.models.project import Project
from visivo.server.field_rules import METRIC, ROW, metric_aggregate_error
from visivo.server.flask_app import FlaskApp
from visivo.server.managers.dimension_manager import DimensionManager
from visivo.server.managers.metric_manager import MetricManager
from visivo.server.managers.model_manager import ModelManager

NO_AGGREGATE = "must aggregate, and its expression has no aggregate function"
TWO_SOURCES = "ties back to multiple sources: lake, warehouse"


@pytest.fixture
def app(output_dir):
    """Two sources: ``orders`` and ``refunds`` read ``warehouse`` (``refunds`` by
    the project default) and ``visits`` reads ``lake``."""
    directory = os.path.abspath(output_dir)
    project = ProjectFactory(
        sources=[
            SourceFactory(name="warehouse", database=f"{directory}/warehouse.sqlite"),
            SourceFactory(name="lake", database=f"{directory}/lake.sqlite"),
        ],
        defaults={"source_name": "warehouse"},
        models=[
            SqlModelFactory(
                name="orders",
                source="ref(warehouse)",
                metrics=[MetricFactory(name="order_count", expression="count(*)")],
            ),
            SqlModelFactory(name="refunds", source=None),
            SqlModelFactory(name="visits", source="ref(lake)"),
        ],
        metrics=[MetricFactory(name="revenue", expression="sum(${ref(orders).amount})")],
        dimensions=[DimensionFactory(name="order_day", expression="${ref(orders).day}")],
        dashboards=[],
    )
    flask_app = FlaskApp(directory, project, working_dir=directory)
    flask_app.app.config["TESTING"] = True
    return flask_app


@pytest.fixture
def client(app):
    return app.app.test_client()


def _post(client, segment, name, body):
    return client.post(f"/api/{segment}/{name}/", json=body)


def _row(ref_name, field_name):
    return ROW


class TestMetricAggregateError:
    @pytest.mark.parametrize(
        "expression",
        [
            "${ref(orders).amount}",
            "${ref(orders).amount} * 2",
            "case when ${ref(orders).amount} > 0 then 1 else 0 end",
            "upper(${ref(orders).region})",
            "amount",
        ],
    )
    def test_an_expression_that_is_known_not_to_aggregate_is_refused(self, expression):
        error = metric_aggregate_error(expression, "m", _row)

        assert NO_AGGREGATE in error
        assert error.startswith("Metric 'm' ")
        assert expression in error

    @pytest.mark.parametrize(
        "expression",
        [
            "sum(${ref(orders).amount})",
            "count(*)",
            "COUNT(DISTINCT ${ref(orders).id})",
            "sum(${ref(orders).amount}) / nullif(count(*), 0)",
            "sum(${ref(orders).amount}) filter (where ${ref(orders).paid})",
            "mode(${ref(orders).region})",
            "my_udf(${ref(orders).amount})",
            "sum(${ref(orders).amount",
            "",
        ],
    )
    def test_an_aggregate_or_an_expression_it_cannot_judge_passes(self, expression):
        assert metric_aggregate_error(expression, "m", _row) is None

    def test_a_ref_to_a_metric_aggregates(self):
        kinds = {"revenue": METRIC, "orders": ROW}

        def kind(ref_name, field_name):
            return kinds[ref_name]

        assert metric_aggregate_error("${ref(revenue)} / 100", "m", kind) is None
        assert NO_AGGREGATE in metric_aggregate_error("${ref(orders).amount} / 100", "m", kind)

    def test_a_ref_that_does_not_resolve_is_left_to_the_build(self):
        assert metric_aggregate_error("${ref(missing).amount}", "m", lambda *_: None) is None
        assert metric_aggregate_error("${ref(missing).amount}", "m") is None

    def test_a_bare_manager_judges_a_nested_metric(self):
        manager = MetricManager()
        metric = MetricFactory(name="m", expression="amount * 2")
        metric.set_parent_name("orders")

        assert NO_AGGREGATE in manager.save_error(metric)

    def test_a_bare_model_manager_judges_its_nested_metrics(self):
        model = SqlModelFactory(metrics=[MetricFactory(name="m", expression="amount * 2")])

        assert NO_AGGREGATE in ModelManager().save_error(model)


class TestAMetricMustAggregate:
    CONFIG = {"name": "order_amount", "expression": "${ref(orders).amount}"}

    def test_the_api_route_refuses_it(self, app, client):
        response = _post(client, "metrics", "order_amount", {"expression": "${ref(orders).amount}"})

        assert response.status_code == 400
        assert NO_AGGREGATE in response.get_json()["error"]
        assert app.metric_manager.get("order_amount") is None

    def test_the_agent_tool_refuses_it(self, app):
        with pytest.raises(ToolError, match=NO_AGGREGATE):
            call(app, "write_metric", {"config": self.CONFIG})

        assert app.metric_manager.get("order_amount") is None

    def test_both_writers_give_the_same_text(self, app, client):
        api = _post(client, "metrics", "order_amount", {"expression": "${ref(orders).amount}"})
        tool = call(app, "validate_metric", {"config": self.CONFIG})

        assert tool["valid"] is False
        assert api.get_json()["error"] in tool["error"]

    def test_a_ref_to_a_dimension_does_not_aggregate(self, app, client):
        response = _post(client, "metrics", "day", {"expression": "${ref(order_day)}"})

        assert response.status_code == 400
        assert NO_AGGREGATE in response.get_json()["error"]

    @pytest.mark.parametrize(
        "expression",
        [
            "sum(${ref(orders).amount})",
            "${ref(revenue)} / 100",
            "${ref(orders).order_count} * 2",
            "${ref(revenue)} / ${ref(orders).order_count}",
        ],
    )
    def test_an_aggregate_or_a_ref_to_a_metric_is_saved(self, app, client, expression):
        assert _post(client, "metrics", "derived", {"expression": expression}).status_code == 201
        config = {"name": "derived_again", "expression": expression}
        assert call(app, "write_metric", {"config": config})["status"] == "draft"

    def test_a_ref_to_a_model_the_project_does_not_have_is_left_to_the_build(self, client):
        response = _post(client, "metrics", "later", {"expression": "${ref(missing).amount}"})

        assert response.status_code == 201

    def test_a_metric_scoped_to_a_model_is_judged_by_both_writers(self, app, client):
        api = _post(
            client, "metrics", "doubled", {"expression": "amount * 2", "parentModel": "orders"}
        )
        config = {"name": "doubled", "expression": "amount * 2", "model": "orders"}

        assert api.status_code == 400
        assert NO_AGGREGATE in api.get_json()["error"]
        with pytest.raises(ToolError, match=NO_AGGREGATE):
            call(app, "write_metric", {"config": config})
        assert app.metric_manager.get("doubled") is None

    def test_a_metric_nested_in_a_model_is_judged_by_both_writers(self, app, client):
        model = {
            "sql": "select * from test_table",
            "source": "${ref(warehouse)}",
            "metrics": [{"name": "doubled", "expression": "amount * 2"}],
        }

        api = _post(client, "models", "payments", model)

        assert api.status_code == 400
        assert NO_AGGREGATE in api.get_json()["error"]
        with pytest.raises(ToolError, match=NO_AGGREGATE):
            call(app, "write_model", {"config": {"name": "payments", **model}})
        assert app.model_manager.get("payments") is None

    def test_a_model_with_an_aggregate_metric_is_saved(self, client):
        model = {
            "sql": "select * from test_table",
            "source": "${ref(warehouse)}",
            "metrics": [{"name": "paid", "expression": "sum(amount)"}],
        }

        assert _post(client, "models", "payments", model).status_code == 201

    def test_the_cloud_agent_turn_refuses_it(self):
        project, core = _project({"models": [_envelope("orders", {"sql": "select 1 as amount"})]})

        with pytest.raises(ToolError, match=NO_AGGREGATE):
            call(project, "write_metric", {"config": self.CONFIG})

        assert core.saved == []


class TestAFieldReadsOneSource:
    METRIC = "sum(${ref(orders).amount}) + sum(${ref(visits).pages})"
    DIMENSION = "${ref(orders).day} || ${ref(visits).day}"

    @pytest.mark.parametrize("kind,expression", [("metric", METRIC), ("dimension", DIMENSION)])
    def test_the_api_route_refuses_two_sources(self, app, client, kind, expression):
        response = _post(client, f"{kind}s", "mixed", {"expression": expression})

        assert response.status_code == 400
        assert response.get_json()["error"] == (
            f"{kind.capitalize()} 'mixed' {TWO_SOURCES}. "
            f"All {kind}s must tie back to a single source."
        )
        assert getattr(app, f"{kind}_manager").get("mixed") is None

    @pytest.mark.parametrize("kind,expression", [("metric", METRIC), ("dimension", DIMENSION)])
    def test_the_agent_tool_refuses_two_sources(self, app, kind, expression):
        config = {"name": "mixed", "expression": expression}

        with pytest.raises(ToolError, match=TWO_SOURCES):
            call(app, f"write_{kind}", {"config": config})

        assert call(app, f"validate_{kind}", {"config": config})["valid"] is False
        assert getattr(app, f"{kind}_manager").get("mixed") is None

    def test_the_text_is_the_text_the_parse_gives(self, app, client):
        saved = _post(client, "metrics", "mixed", {"expression": self.METRIC}).get_json()["error"]
        project = app.project.model_dump(by_alias=True, exclude_none=True)
        project["metrics"] = project["metrics"] + [{"name": "mixed", "expression": self.METRIC}]

        with pytest.raises(ValueError) as parsed:
            Project(**project)

        assert saved in str(parsed.value)

    def test_sources_are_followed_through_other_fields(self, app, client):
        assert (
            _post(
                client, "metrics", "page_views", {"expression": "sum(${ref(visits).pages})"}
            ).status_code
            == 201
        )

        response = _post(
            client, "metrics", "ratio", {"expression": "${ref(revenue)} / ${ref(page_views)}"}
        )

        assert response.status_code == 400
        assert f"Metric 'ratio' {TWO_SOURCES}" in response.get_json()["error"]

    def test_a_field_scoped_to_a_model_reads_that_models_source(self, app, client):
        response = _post(
            client,
            "metrics",
            "ratio",
            {"expression": "${ref(orders).order_count} / sum(${ref(visits).pages})"},
        )

        assert response.status_code == 400
        assert TWO_SOURCES in response.get_json()["error"]

    def test_a_bare_ref_to_a_scoped_field_reads_its_models_source(self, client):
        response = _post(
            client,
            "metrics",
            "ratio",
            {"expression": "${ref(order_count)} / sum(${ref(visits).pages})"},
        )

        assert response.status_code == 400
        assert TWO_SOURCES in response.get_json()["error"]

    def test_a_bare_manager_does_not_judge_sources(self):
        dimension = DimensionFactory(name="mixed", expression=self.DIMENSION)

        assert DimensionManager().save_error(dimension) is None

    def test_a_model_with_no_source_reads_the_default_source(self, app, client):
        same = "sum(${ref(orders).amount}) - sum(${ref(refunds).amount})"
        mixed = "sum(${ref(refunds).amount}) + sum(${ref(visits).pages})"

        assert _post(client, "metrics", "net", {"expression": same}).status_code == 201
        assert _post(client, "metrics", "mixed", {"expression": mixed}).status_code == 400

    def test_a_draft_model_counts(self, app, client):
        draft = {"sql": "select * from test_table", "source": "${ref(lake)}"}
        assert _post(client, "models", "sessions", draft).status_code == 201

        response = _post(
            client,
            "dimensions",
            "mixed",
            {"expression": "${ref(orders).day} || ${ref(sessions).day}"},
        )

        assert response.status_code == 400
        assert TWO_SOURCES in response.get_json()["error"]

    def test_a_cycle_of_refs_ends(self, app):
        first = MetricFactory(name="first", expression="${ref(second)} + sum(${ref(orders).a})")
        second = MetricFactory(name="second", expression="${ref(first)} + sum(${ref(visits).b})")
        app.metric_manager._cached_objects.update(first=first, second=second)

        assert TWO_SOURCES in app.metric_manager.save_error(second)

    def test_a_ref_that_does_not_resolve_is_not_counted(self, client):
        response = _post(
            client,
            "dimensions",
            "partial",
            {"expression": "${ref(orders).day} || ${ref(missing).day}"},
        )

        assert response.status_code == 201

    def test_the_cloud_agent_turn_refuses_two_sources(self):
        project, core = _project(
            {
                "models": [
                    _envelope(
                        "orders", {"sql": "select 1 as amount", "source": "${ref(warehouse)}"}
                    ),
                    _envelope("visits", {"sql": "select 1 as pages", "source": "${ref(lake)}"}),
                ]
            }
        )

        with pytest.raises(ToolError, match=TWO_SOURCES):
            call(project, "write_metric", {"config": {"name": "mixed", "expression": self.METRIC}})

        assert core.saved == []
