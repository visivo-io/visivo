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
from visivo.server.field_rules import METRIC, ROW, dependents_error, metric_aggregate_error
from visivo.server.flask_app import FlaskApp
from visivo.server.managers.dimension_manager import DimensionManager
from visivo.server.managers.metric_manager import MetricManager
from visivo.server.managers.model_manager import ModelManager

NO_AGGREGATE = "must aggregate, and its expression has no aggregate function"
TWO_SOURCES = "ties back to multiple sources: lake, warehouse"
LEGACY = "${ref(orders).amount} * 2"


@pytest.fixture
def app(output_dir):
    """Two sources: ``orders`` and ``refunds`` read ``warehouse`` (``refunds`` by
    the project default) and ``visits`` reads ``lake``. The metrics ``legacy``
    and ``orders.old_amount`` do not aggregate: the parse has no such rule, so a
    project on disk can hold them."""
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
                metrics=[
                    MetricFactory(name="order_count", expression="count(*)"),
                    MetricFactory(name="old_amount", expression="amount * 2"),
                ],
            ),
            SqlModelFactory(name="refunds", source=None),
            SqlModelFactory(name="visits", source="ref(lake)"),
        ],
        metrics=[
            MetricFactory(name="revenue", expression="sum(${ref(orders).amount})"),
            MetricFactory(name="legacy", expression=LEGACY),
        ],
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
            "${ref(orders).amount} = any(select 1)",
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
            "list(${ref(orders).amount})",
            "any(${ref(orders).amount})",
            "any(${ref(orders).amount}) * 2",
            "my_udf(${ref(orders).amount})",
            "sum(${ref(orders).amount",
            "",
        ],
    )
    def test_an_aggregate_or_an_expression_it_cannot_judge_passes(self, expression):
        assert metric_aggregate_error(expression, "m", _row) is None

    def test_the_dialect_of_the_source_parses_the_expression(self):
        scalar_in_duckdb = "epoch_ms(${ref(orders).created})"

        assert metric_aggregate_error(scalar_in_duckdb, "m", _row) is None
        assert NO_AGGREGATE in metric_aggregate_error(scalar_in_duckdb, "m", _row, "duckdb")
        assert metric_aggregate_error("any(${ref(orders).amount})", "m", _row, "clickhouse") is None

    def test_a_dialect_that_does_not_parse_falls_back_to_the_generic_one(self):
        assert metric_aggregate_error("epoch_ms(${ref(orders).a})", "m", _row, "nonsense") is None
        assert NO_AGGREGATE in metric_aggregate_error("${ref(orders).a}", "m", _row, "nonsense")

    def test_a_manager_parses_in_the_dialect_it_looks_up(self):
        manager = MetricManager()
        metric = MetricFactory(name="m", expression="epoch_ms(created)")
        metric.set_parent_name("orders")

        assert manager.save_error(metric) is None
        manager.dialect_lookup = lambda obj: "duckdb"
        assert NO_AGGREGATE in manager.save_error(metric)

    def test_the_dialect_is_the_dialect_of_the_first_model_a_metric_reads(self, app):
        through_a_metric = MetricFactory(name="m", expression="${ref(revenue)} / 2")
        nested = MetricFactory(name="n", expression="sum(amount)")
        nested.set_parent_name("orders")
        unresolved = MetricFactory(name="u", expression="sum(${ref(missing).amount})")

        assert app.metric_manager.dialect_lookup(through_a_metric) == "sqlite"
        assert app.metric_manager.dialect_lookup(nested) == "sqlite"
        assert app.metric_manager.dialect_lookup(unresolved) is None

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


class TestAMetricTheProjectAlreadyHasStaysEditable:
    def test_both_writers_save_it_with_its_expression_unchanged(self, app, client):
        api = _post(client, "metrics", "legacy", {"expression": LEGACY, "description": "old"})
        config = {"name": "legacy", "expression": LEGACY, "description": "older"}

        assert api.status_code == 200
        assert call(app, "write_metric", {"config": config})["status"] == "draft"
        assert app.metric_manager.get("legacy").description == "older"

    def test_both_writers_refuse_a_new_expression_that_does_not_aggregate(self, app, client):
        api = _post(client, "metrics", "legacy", {"expression": "${ref(orders).amount} * 3"})
        config = {"name": "legacy", "expression": "${ref(orders).amount} * 3"}

        assert api.status_code == 400
        assert NO_AGGREGATE in api.get_json()["error"]
        with pytest.raises(ToolError, match=NO_AGGREGATE):
            call(app, "write_metric", {"config": config})
        assert app.metric_manager.get("legacy").expression == LEGACY

    def test_the_same_expression_under_a_new_name_is_refused(self, client):
        assert _post(client, "metrics", "copy", {"expression": LEGACY}).status_code == 400

    def _orders(self, app, *metrics):
        model = app.model_manager.get("orders").model_dump(mode="json", exclude_none=True)
        return {**model, "metrics": list(metrics)}

    def test_a_model_keeps_a_nested_metric_it_already_has(self, app, client):
        model = self._orders(app, {"name": "old_amount", "expression": "amount * 2"})

        assert _post(client, "models", "orders", model).status_code == 200
        assert call(app, "write_model", {"config": model})["status"] == "draft"

    def test_a_model_does_not_get_a_new_nested_metric_that_does_not_aggregate(self, app, client):
        model = self._orders(app, {"name": "old_amount", "expression": "amount * 3"})

        api = _post(client, "models", "orders", model)

        assert api.status_code == 400
        assert NO_AGGREGATE in api.get_json()["error"]
        with pytest.raises(ToolError, match=NO_AGGREGATE):
            call(app, "write_model", {"config": model})


class TestARefToAFieldNestedInADraftModel:
    @pytest.fixture(autouse=True)
    def payments(self, client):
        model = {
            "sql": "select * from test_table",
            "source": "${ref(warehouse)}",
            "dimensions": [{"name": "pay_day", "expression": "day"}],
            "metrics": [{"name": "pay_total", "expression": "sum(amount)"}],
        }
        assert _post(client, "models", "payments", model).status_code == 201

    def test_a_nested_dimension_does_not_aggregate(self, app, client):
        api = _post(client, "metrics", "m", {"expression": "${ref(pay_day)}"})

        assert api.status_code == 400
        assert NO_AGGREGATE in api.get_json()["error"]
        with pytest.raises(ToolError, match=NO_AGGREGATE):
            call(app, "write_metric", {"config": {"name": "m", "expression": "${ref(pay_day)}"}})

    def test_a_nested_metric_aggregates(self, client):
        assert (
            _post(client, "metrics", "m", {"expression": "${ref(pay_total)} * 2"}).status_code
            == 201
        )
        assert (
            _post(
                client, "metrics", "n", {"expression": "${ref(visits).pay_total} * 2"}
            ).status_code
            == 201
        )

    def test_a_nested_field_reads_the_source_of_its_model(self, app, client):
        expression = "${ref(pay_total)} + sum(${ref(visits).pages})"

        api = _post(client, "metrics", "m", {"expression": expression})

        assert api.status_code == 400
        assert f"Metric 'm' {TWO_SOURCES}" in api.get_json()["error"]
        with pytest.raises(ToolError, match=TWO_SOURCES):
            call(app, "write_metric", {"config": {"name": "m", "expression": expression}})

    def test_a_model_marked_for_deletion_nests_nothing(self, app, client):
        app.model_manager._cached_objects["payments"] = None

        assert _post(client, "metrics", "m", {"expression": "${ref(pay_day)}"}).status_code == 201


class TestASaveDoesNotGiveAnotherFieldTwoSources:
    NET = "sum(${ref(orders).amount}) - sum(${ref(refunds).amount})"
    NET_ERROR = f"Metric 'net' {TWO_SOURCES}. All metrics must tie back to a single source."

    def _orders_on_lake(self, app):
        model = app.model_manager.get("orders").model_dump(mode="json", exclude_none=True)
        return {**model, "source": "${ref(lake)}"}

    def test_the_api_route_refuses_a_model_source_that_splits_a_metric(self, app, client):
        assert _post(client, "metrics", "net", {"expression": self.NET}).status_code == 201

        response = _post(client, "models", "orders", self._orders_on_lake(app))

        assert response.status_code == 400
        assert response.get_json()["error"] == self.NET_ERROR
        assert app.model_manager.get_status("orders").value == "published"

    def test_the_agent_tool_refuses_a_model_source_that_splits_a_metric(self, app, client):
        assert _post(client, "metrics", "net", {"expression": self.NET}).status_code == 201
        config = self._orders_on_lake(app)

        with pytest.raises(ToolError, match=TWO_SOURCES):
            call(app, "write_model", {"config": config})

        assert call(app, "validate_model", {"config": config})["valid"] is False
        assert app.model_manager.get_status("orders").value == "published"

    def test_a_model_source_that_splits_nothing_is_saved(self, app, client):
        assert _post(client, "models", "orders", self._orders_on_lake(app)).status_code == 200

    def _ratio(self, client):
        ratio = {"expression": "${ref(revenue)} / sum(${ref(orders).n})"}
        assert _post(client, "metrics", "ratio", ratio).status_code == 201

    def test_the_api_route_refuses_a_metric_that_splits_a_metric_that_reads_it(self, app, client):
        self._ratio(client)

        response = _post(client, "metrics", "revenue", {"expression": "sum(${ref(visits).pages})"})

        assert response.status_code == 400
        assert response.get_json()["error"] == (
            f"Metric 'ratio' {TWO_SOURCES}. All metrics must tie back to a single source."
        )
        assert app.metric_manager.get("revenue").expression == "sum(${ref(orders).amount})"

    def test_the_agent_tool_refuses_a_metric_that_splits_a_metric_that_reads_it(self, app, client):
        self._ratio(client)
        config = {"name": "revenue", "expression": "sum(${ref(visits).pages})"}

        with pytest.raises(ToolError, match=f"Metric 'ratio' {TWO_SOURCES}"):
            call(app, "write_metric", {"config": config})

        assert app.metric_manager.get("revenue").expression == "sum(${ref(orders).amount})"

    def test_both_writers_refuse_a_dimension_that_splits_a_dimension_that_reads_it(
        self, app, client
    ):
        label = {"expression": "${ref(order_day)} || ${ref(orders).region}"}
        assert _post(client, "dimensions", "label", label).status_code == 201
        config = {"name": "order_day", "expression": "${ref(visits).day}"}

        api = _post(client, "dimensions", "order_day", {"expression": config["expression"]})

        assert api.status_code == 400
        assert f"Dimension 'label' {TWO_SOURCES}" in api.get_json()["error"]
        with pytest.raises(ToolError, match=f"Dimension 'label' {TWO_SOURCES}"):
            call(app, "write_dimension", {"config": config})

    def test_a_new_model_that_a_draft_field_waits_for_is_judged(self, app, client):
        waiting = {"expression": "${ref(orders).day} || ${ref(sessions).day}"}
        assert _post(client, "dimensions", "waiting", waiting).status_code == 201
        sessions = {"sql": "select * from test_table", "source": "${ref(lake)}"}

        response = _post(client, "models", "sessions", sessions)

        assert response.status_code == 400
        assert f"Dimension 'waiting' {TWO_SOURCES}" in response.get_json()["error"]
        assert app.model_manager.get("sessions") is None

    def test_a_new_model_that_nests_a_field_a_draft_metric_waits_for_is_judged(self, app, client):
        waiting = {"expression": "${ref(pay_total)} + sum(${ref(visits).pages})"}
        assert _post(client, "metrics", "waiting", waiting).status_code == 201
        payments = {
            "sql": "select * from test_table",
            "source": "${ref(warehouse)}",
            "metrics": [{"name": "pay_total", "expression": "sum(amount)"}],
        }

        response = _post(client, "models", "payments", payments)

        assert response.status_code == 400
        assert f"Metric 'waiting' {TWO_SOURCES}" in response.get_json()["error"]

    def test_the_defaults_route_refuses_a_default_source_that_splits_a_metric(self, app, client):
        assert _post(client, "metrics", "net", {"expression": self.NET}).status_code == 201

        response = client.post("/api/defaults/", json={"source_name": "lake"})

        assert response.status_code == 400
        assert response.get_json()["error"] == self.NET_ERROR
        assert app._cached_defaults is None

    def test_the_defaults_route_saves_a_default_that_splits_nothing(self, app, client):
        response = client.post("/api/defaults/", json={"source_name": "warehouse", "threads": 2})

        assert response.status_code == 200
        assert app._cached_defaults.threads == 2

    def test_a_field_that_reads_two_sources_before_the_save_is_not_counted(self, app):
        mixed = MetricFactory(name="mixed", expression=TestAFieldReadsOneSource.METRIC)
        app.metric_manager._cached_objects["mixed"] = mixed
        orders = app.model_manager.get("orders")

        assert dependents_error(app, "model_manager", orders) is None

    def test_a_field_marked_for_deletion_is_not_counted(self, app, client):
        assert _post(client, "metrics", "net", {"expression": self.NET}).status_code == 201
        app.metric_manager._cached_objects["net"] = None

        assert _post(client, "models", "orders", self._orders_on_lake(app)).status_code == 200


class TestARenameWritesEveryObjectOrNone:
    def _rename(self, client, type_key, old_name, new_name):
        body = {"type": type_key, "old_name": old_name, "new_name": new_name}
        return client.post("/api/rename/", json=body)

    def test_a_model_that_an_old_metric_reads_is_renamed_in_full(self, app, client):
        response = self._rename(client, "models", "orders", "sales")

        assert response.status_code == 200
        assert app.model_manager.renamed_from("sales") == "orders"
        assert app.metric_manager.get("legacy").expression == "${ref(sales).amount} * 2"
        assert app.metric_manager.get("revenue").expression == "sum(${ref(sales).amount})"
        assert app.dimension_manager.get("order_day").expression == "${ref(sales).day}"

    def test_a_refusal_the_rename_causes_is_a_400_and_changes_nothing(
        self, app, client, monkeypatch
    ):
        draft = {"expression": "sum(${ref(visits).n})"}
        assert _post(client, "metrics", "draft", draft).status_code == 201
        cached = {
            name: dict(getattr(app, name).cached_objects)
            for name in ("model_manager", "metric_manager", "dimension_manager")
        }
        monkeypatch.setattr(
            app.dimension_manager,
            "save_error",
            lambda obj: "No dimension reads sales." if "sales" in obj.expression else None,
        )

        response = self._rename(client, "models", "orders", "sales")

        assert response.status_code == 400
        assert response.get_json()["error"] == "No dimension reads sales."
        for name, objects in cached.items():
            assert getattr(app, name).cached_objects == objects
        assert app.model_manager.renames == {}
        assert app.model_manager.get("sales") is None
        assert app.metric_manager.get("legacy").expression == LEGACY

    def test_an_error_that_is_not_a_refusal_also_changes_nothing(self, app, monkeypatch):
        from visivo.server.rename_service import rename_object

        def fail(config):
            raise RuntimeError("no disk")

        monkeypatch.setattr(app.dimension_manager, "save_from_config", fail)

        with pytest.raises(RuntimeError):
            rename_object(app, type_key="models", old_name="orders", new_name="sales")

        assert app.model_manager.cached_objects == {}
        assert app.metric_manager.cached_objects == {}
        assert app.model_manager.renames == {}

    def test_an_object_that_was_refused_before_the_rename_is_renamed_as_it_is(
        self, app, client, monkeypatch
    ):
        monkeypatch.setattr(app.dimension_manager, "save_error", lambda obj: "Always refused.")

        response = self._rename(client, "models", "orders", "sales")

        assert response.status_code == 200
        assert app.dimension_manager.get("order_day").expression == "${ref(sales).day}"

    def test_a_source_rename_is_judged_when_every_model_is_written(self, app, client):
        net = "sum(${ref(orders).amount}) - sum(${ref(returns).amount})"
        returns = {"sql": "select * from test_table", "source": "${ref(warehouse)}"}
        assert _post(client, "models", "returns", returns).status_code == 201
        assert _post(client, "metrics", "net", {"expression": net}).status_code == 201

        response = self._rename(client, "sources", "warehouse", "wh")

        assert response.status_code == 200
        assert "ref(wh)" in str(app.model_manager.get("orders").source)
        assert "ref(wh)" in str(app.model_manager.get("returns").source)
