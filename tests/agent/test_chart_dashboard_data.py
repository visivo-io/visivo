"""Reading a saved chart or dashboard with its data (VIS-1820). Both tools only
read, name what they return as data, and keep a whole dashboard inside one
bounded answer."""

import json
from types import SimpleNamespace
from unittest import mock

import pytest

from visivo.agent import data_tools
from visivo.agent.data_tools import CATALOG_TOOLS, DATA_TOOLS
from visivo.agent.mcp_protocol import tool_list
from visivo.agent.tools import TOOLS, ToolError, call
from visivo.server.services import draft_insight

LIST = "list_charts_and_dashboards"
GET = "get_chart_or_dashboard_data"


def _write(app, kind, config):
    result = call(app, f"write_{kind}", {"config": config})
    assert result["status"] == "draft", result
    return config["name"]


def _insight(name, **props):
    base = {"type": "bar", "x": "?{${ref(orders_q).x}}", "y": "?{sum(${ref(orders_q).y})}"}
    return {"name": name, "props": {**base, **props}}


def _row(*items):
    return {"height": "medium", "items": list(items)}


@pytest.fixture
def project(integration_app):
    """A model, two insights, two charts that share one insight, two tables and
    a dashboard that shows all of them."""
    app = integration_app
    source = app.project.sources[0].name
    call(app, "describe_source", {"name": source})
    _write(
        app,
        "model",
        {"name": "orders_q", "sql": "SELECT x, y FROM test_table", "source": f"ref({source})"},
    )
    _write(app, "insight", _insight("by_x"))
    _write(app, "insight", _insight("by_x_line", type="scatter"))
    _write(
        app,
        "chart",
        {
            "name": "orders_chart",
            "insights": ["ref(by_x)"],
            "layout": {"title": {"text": "Orders by x"}},
        },
    )
    _write(app, "chart", {"name": "both_chart", "insights": ["ref(by_x)", "ref(by_x_line)"]})
    _write(app, "table", {"name": "insight_table", "data": "ref(by_x)"})
    _write(app, "table", {"name": "model_table", "data": "ref(orders_q)"})
    _write(
        app,
        "dashboard",
        {
            "name": "orders",
            "description": "Orders at a glance.",
            "rows": [
                _row({"chart": "ref(orders_chart)"}, {"table": "ref(insight_table)"}),
                _row({"rows": [_row({"chart": "ref(both_chart)"})]}),
                _row({"table": "ref(model_table)"}),
            ],
        },
    )
    return app


def _drafts(app):
    return {
        attribute: dict(getattr(app, attribute).cached_objects)
        for attribute in ("chart_manager", "dashboard_manager", "insight_manager", "table_manager")
    }


def _dataset(result, name):
    return next(entry for entry in result["data"] if entry["name"] == name)


class TestListChartsAndDashboards:
    def test_it_lists_each_dashboard_with_what_it_shows(self, project):
        dashboards = {d["name"]: d for d in call(project, LIST, {})["dashboards"]}

        assert dashboards["orders"] == {
            "name": "orders",
            "description": "Orders at a glance.",
            "charts": ["orders_chart", "both_chart"],
            "tables": ["insight_table", "model_table"],
        }

    def test_it_lists_each_chart_with_its_title_insights_and_dashboards(self, project):
        charts = {chart["name"]: chart for chart in call(project, LIST, {})["charts"]}

        assert charts["orders_chart"] == {
            "name": "orders_chart",
            "title": "Orders by x",
            "insights": ["by_x"],
            "dashboards": ["orders"],
        }
        assert charts["both_chart"]["insights"] == ["by_x", "by_x_line"]
        assert "title" not in charts["both_chart"]

    def test_a_chart_on_no_dashboard_is_listed(self, project):
        _write(project, "chart", {"name": "loose_chart", "insights": ["ref(by_x)"]})

        charts = {chart["name"]: chart for chart in call(project, LIST, {})["charts"]}

        assert charts["loose_chart"] == {"name": "loose_chart", "insights": ["by_x"]}

    def test_it_names_the_project(self, project):
        result = call(project, LIST, {})

        assert result["project"] == project.project.name
        assert "branch" not in result

    def test_a_host_with_branches_names_the_project_and_the_branch(self):
        """A host that holds no parsed project says which one it serves."""
        host = SimpleNamespace(project=None, project_name="Sales", branch_name="main")

        result = TOOLS[LIST].handler(host, {})

        assert (result["project"], result["branch"]) == ("Sales", "main")
        assert result["dashboards"] == [] and result["charts"] == []

    def test_the_names_are_sorted(self, project):
        result = call(project, LIST, {})

        for listed in (result["dashboards"], result["charts"]):
            names = [entry["name"] for entry in listed]
            assert names == sorted(names) and len(names) > 1

    def test_a_project_with_no_charts_lists_none(self, project, monkeypatch):
        monkeypatch.setattr(project.chart_manager, "get_all_objects_list", lambda: [])
        monkeypatch.setattr(project.dashboard_manager, "get_all_objects_list", lambda: [None])

        result = call(project, LIST, {})

        assert result["dashboards"] == [] and result["charts"] == []

    def test_it_changes_no_draft(self, project):
        before = _drafts(project)

        call(project, LIST, {})

        assert _drafts(project) == before

    def test_it_reads_no_source(self, project, monkeypatch):
        monkeypatch.setattr(
            data_tools, "execute_and_get_result", lambda *a, **k: pytest.fail("queried")
        )
        monkeypatch.setattr(
            data_tools, "execute_draft_insight", lambda *a, **k: pytest.fail("queried")
        )

        assert call(project, LIST, {})["charts"]

    def test_a_template_dashboard_lists_the_items_in_its_slots(self, project):
        template = '<section><div data-visivo-item="orders_chart"></div></section>'
        _write(project, "dashboard", {"name": "page", "template": template})

        dashboards = {d["name"]: d for d in call(project, LIST, {})["dashboards"]}

        assert dashboards["page"] == {"name": "page", "charts": ["orders_chart"]}


class TestGetChartData:
    def test_a_chart_returns_its_spec_and_the_rows_of_its_insight(self, project):
        result = call(project, GET, {"type": "chart", "name": "orders_chart"})

        assert result["note"] == data_tools.DATA_NOTICE
        assert (result["type"], result["name"]) == ("chart", "orders_chart")
        assert result["spec"]["layout"]["title"]["text"] == "Orders by x"
        assert result["insights"] == ["by_x"]
        (data,) = result["data"]
        assert (data["name"], data["kind"], data["type"]) == ("by_x", "insight", "bar")
        assert data["row_count"] == 6 and len(data["rows"]) == 6
        assert set(data["props_mapping"]) == {"props.x", "props.y"}
        assert data["spec"]["props"]["type"] == "bar"
        assert result["truncated"] is False

    def test_the_rows_are_the_rows_preview_insight_returns(self, project):
        preview = call(project, "preview_insight", {"name": "by_x"})

        data = _dataset(call(project, GET, {"type": "chart", "name": "orders_chart"}), "by_x")

        assert data["rows"] == preview["rows"] and data["columns"] == preview["columns"]

    def test_the_limit_bounds_each_insight(self, project):
        result = call(project, GET, {"type": "chart", "name": "both_chart", "limit": 2})

        assert [entry["row_count"] for entry in result["data"]] == [2, 2]
        assert result["truncated"] is True

    def test_the_limit_cannot_pass_the_maximum(self, project, monkeypatch):
        seen = []
        real = data_tools._insight_rows
        monkeypatch.setattr(
            data_tools,
            "_insight_rows",
            lambda app, config, values, limit, *timeout: seen.append(limit)
            or real(app, config, values, 1, *timeout),
        )

        call(project, GET, {"type": "chart", "name": "orders_chart", "limit": 100_000})

        assert seen == [data_tools.MAX_PREVIEW_INSIGHT_ROWS]

    def test_an_input_takes_its_default_or_the_value_given(self, project):
        _write(
            project,
            "input",
            {
                "name": "min_x",
                "type": "single-select",
                "options": ["2", "4"],
                "display": {"type": "dropdown", "default": {"value": "4"}},
            },
        )
        filtered = _insight("filtered")
        filtered["interactions"] = [{"filter": "?{${ref(orders_q).x} > ${ref(min_x).value}}"}]
        _write(project, "insight", filtered)
        _write(project, "chart", {"name": "filtered_chart", "insights": ["ref(filtered)"]})

        default = call(project, GET, {"type": "chart", "name": "filtered_chart"})
        chosen = call(
            project,
            GET,
            {"type": "chart", "name": "filtered_chart", "input_values": {"min_x": 2}},
        )

        assert _dataset(default, "filtered")["inputs_substituted"] == {"min_x": {"value": "4"}}
        assert _dataset(default, "filtered")["row_count"] == 2
        assert _dataset(chosen, "filtered")["row_count"] == 4

    def test_an_insight_that_fails_says_why_and_the_other_still_returns(self, project):
        _write(project, "insight", _insight("broken", x="?{${ref(orders_q).no_such_column}}"))
        _write(project, "chart", {"name": "mixed", "insights": ["ref(broken)", "ref(by_x)"]})

        result = call(project, GET, {"type": "chart", "name": "mixed"})

        assert "no_such_column" in _dataset(result, "broken")["error"]
        assert "rows" not in _dataset(result, "broken")
        assert _dataset(result, "by_x")["row_count"] == 6

    def test_an_insight_that_does_not_exist_says_so(self, project, monkeypatch):
        chart = project.chart_manager.get("orders_chart")
        monkeypatch.setattr(
            data_tools, "_chart_insights", lambda app, found: [("ghost", None)] if found else []
        )

        result = call(project, GET, {"type": "chart", "name": chart.name})

        assert result["data"] == [
            {"name": "ghost", "kind": "insight", "error": "No insight named 'ghost'."}
        ]

    def test_it_changes_no_draft(self, project):
        before = _drafts(project)

        call(project, GET, {"type": "dashboard", "name": "orders"})

        assert _drafts(project) == before

    @pytest.mark.parametrize(
        "arguments, message",
        [
            ({"name": "orders_chart"}, "'type' is required"),
            ({"type": "model", "name": "orders_q"}, "'type' is required"),
            ({"type": "chart"}, "'name' is required"),
            ({"type": "chart", "name": "ghost"}, "No chart named 'ghost'"),
            ({"type": "dashboard", "name": "orders_chart"}, "No dashboard named 'orders_chart'"),
            ({"type": "chart", "name": "orders_chart", "input_values": [1]}, "input_values"),
            ({"type": "chart", "name": "orders_chart", "limit": "many"}, "'limit' must be"),
        ],
    )
    def test_a_bad_request_is_a_refusal(self, project, arguments, message):
        with pytest.raises(ToolError, match=message):
            call(project, GET, arguments)


class TestGetDashboardData:
    def test_a_dashboard_returns_its_spec_charts_tables_and_data(self, project):
        result = call(project, GET, {"type": "dashboard", "name": "orders"})

        assert result["spec"]["description"] == "Orders at a glance."
        assert [(c["name"], c["insights"]) for c in result["charts"]] == [
            ("orders_chart", ["by_x"]),
            ("both_chart", ["by_x", "by_x_line"]),
        ]
        assert [(t["name"], t["data"]) for t in result["tables"]] == [
            ("insight_table", "by_x"),
            ("model_table", "orders_q"),
        ]
        assert [(d["name"], d["kind"]) for d in result["data"]] == [
            ("by_x", "insight"),
            ("by_x_line", "insight"),
            ("orders_q", "model"),
        ]
        assert all(d["row_count"] == 6 for d in result["data"])

    def test_an_insight_two_charts_share_is_read_once(self, project, monkeypatch):
        read = []
        real = draft_insight.execute_draft_insight

        def counting(app, output_dir, config, **kwargs):
            if kwargs.get("max_rows") != 1:
                read.append(config["name"])
            return real(app, output_dir, config, **kwargs)

        monkeypatch.setattr(data_tools, "execute_draft_insight", counting)

        call(project, GET, {"type": "dashboard", "name": "orders"})

        assert sorted(read) == ["by_x", "by_x_line"]

    def test_a_table_on_a_model_says_when_the_model_has_more_rows(self, project):
        result = call(project, GET, {"type": "dashboard", "name": "orders", "limit": 2})

        model = _dataset(result, "orders_q")
        assert model["row_count"] == 2 and model["truncated"] is True
        assert model["columns"] == ["x", "y"]

    def test_a_template_dashboard_returns_the_items_in_its_slots(self, project):
        template = '<section><div data-visivo-item="orders_chart"></div></section>'
        _write(project, "dashboard", {"name": "page", "template": template})

        result = call(project, GET, {"type": "dashboard", "name": "page"})

        assert [c["name"] for c in result["charts"]] == ["orders_chart"]
        assert [d["name"] for d in result["data"]] == ["by_x"]

    def test_the_whole_answer_fits_the_byte_budget(self, project, monkeypatch):
        whole = call(project, GET, {"type": "dashboard", "name": "orders"})
        without_rows = {**whole, "data": [{**d, "rows": []} for d in whole["data"]]}
        budget = len(json.dumps(without_rows, default=str)) + 120
        monkeypatch.setattr(data_tools, "MAX_SAVED_RESULT_BYTES", budget)

        result = call(project, GET, {"type": "dashboard", "name": "orders"})

        assert len(json.dumps(result, default=str)) <= budget
        assert result["truncated"] is True and "specs_omitted" not in result
        assert all(d["truncated"] and d["row_count"] == len(d["rows"]) for d in result["data"])
        assert 0 < sum(d["row_count"] for d in result["data"]) < 18

    def _many_charts(self, app, count, title):
        names = [
            _write(
                app,
                "chart",
                {
                    "name": f"wide_{index:02d}",
                    "insights": ["ref(by_x)"],
                    "layout": {"title": {"text": title}},
                },
            )
            for index in range(count)
        ]
        rows = [_row({"chart": f"ref({name})"}) for name in names]
        _write(app, "dashboard", {"name": "wide", "rows": rows})
        return names

    def test_specs_larger_than_the_limit_are_left_out_and_the_answer_fits(self, project):
        """The limit bounds the answer, not only its rows: 60 charts with a
        1,500 character title are above it with no row at all."""
        names = self._many_charts(project, 60, "t" * 1500)

        result = call(project, GET, {"type": "dashboard", "name": "wide"})

        assert len(json.dumps(result, default=str)) <= data_tools.MAX_SAVED_RESULT_BYTES
        assert "get_chart" in result["specs_omitted"]
        assert "spec" not in result
        assert [chart["name"] for chart in result["charts"]] == names
        assert all("spec" not in chart for chart in result["charts"])
        assert all("spec" not in dataset for dataset in result["data"])
        assert _dataset(result, "by_x")["row_count"] == 6

    def test_specs_that_fit_are_not_left_out(self, project):
        self._many_charts(project, 3, "short")

        result = call(project, GET, {"type": "dashboard", "name": "wide"})

        assert "specs_omitted" not in result
        assert result["spec"]["name"] == "wide"
        assert all("spec" in chart for chart in result["charts"])

    def test_names_larger_than_the_limit_are_a_refusal(self, project, monkeypatch):
        self._many_charts(project, 3, "short")
        monkeypatch.setattr(data_tools, "MAX_SAVED_RESULT_BYTES", 200)

        with pytest.raises(ToolError, match="too large for one answer.*each chart on its own"):
            call(project, GET, {"type": "dashboard", "name": "wide"})

    def test_a_small_dataset_keeps_its_rows_when_a_large_one_is_trimmed(self):
        small = {"name": "small", "rows": [{"a": 1}], "row_count": 1, "truncated": False}
        large = {
            "name": "large",
            "rows": [{"a": "x" * 50}] * 40,
            "row_count": 40,
            "truncated": False,
        }
        payload = {"data": [large, small]}
        empty = len(json.dumps({"data": [{**large, "rows": []}, {**small, "rows": []}]}))

        with mock.patch.object(data_tools, "MAX_SAVED_RESULT_BYTES", empty + 400):
            data_tools._fit_datasets(payload)

        assert small["row_count"] == 1 and small["truncated"] is False
        assert 0 < large["row_count"] < 40 and large["truncated"] is True

    def test_what_the_time_budget_does_not_reach_is_skipped_and_says_so(self, project, monkeypatch):
        monkeypatch.setattr(data_tools, "SAVED_DATA_BUDGET_S", -1)
        monkeypatch.setattr(
            data_tools, "execute_draft_insight", lambda *a, **k: pytest.fail("queried")
        )

        result = call(project, GET, {"type": "dashboard", "name": "orders"})

        assert all("Get this chart on its own" in d["skipped"] for d in result["data"])
        assert all("rows" not in d for d in result["data"])

    def test_a_slow_source_cannot_hold_the_call_past_its_deadline(self, project, monkeypatch):
        """No new query starts after the budget, and a query that runs gets no
        more than the time left to the deadline. So the call returns by the
        deadline, with a reason on each dataset."""
        from time import monotonic, sleep

        from visivo.models.sources.sqlite_source import SqliteSource

        monkeypatch.setattr(data_tools, "SAVED_DATA_BUDGET_S", 0.3)
        monkeypatch.setattr(data_tools, "SAVED_DATA_DEADLINE_S", 0.6)
        monkeypatch.setattr(SqliteSource, "read_sql", lambda self, query, **kwargs: sleep(3))

        started = monotonic()
        result = call(project, GET, {"type": "dashboard", "name": "orders"})
        took = monotonic() - started

        assert took < 1.5, took
        reasons = [d.get("error") or d.get("skipped") for d in result["data"]]
        assert len(reasons) == 3 and all(reasons)
        assert "did not return within 0.6s" in _dataset(result, "by_x")["error"]
        assert any("skipped" in d for d in result["data"])
        assert all("rows" not in d for d in result["data"])

    def test_a_query_gets_its_own_limit_when_the_deadline_is_far(self, project, monkeypatch):
        seen = []

        def record(*args, timeout_s=None, **kwargs):
            seen.append(timeout_s)
            raise draft_insight.DraftInsightError(400, {"error": "stop"})

        monkeypatch.setattr(data_tools, "execute_draft_insight", record)
        monkeypatch.setattr(data_tools, "SAVED_DATA_DEADLINE_S", 600)

        call(project, GET, {"type": "chart", "name": "orders_chart"})

        assert seen == [data_tools.AGENT_QUERY_TIMEOUT_S]

    def test_a_chart_the_dashboard_names_that_does_not_exist_says_so(self, project, monkeypatch):
        monkeypatch.setattr(
            data_tools, "_dashboard_items", lambda app, dashboard: ({"ghost": None}, {"gone": None})
        )

        result = call(project, GET, {"type": "dashboard", "name": "orders"})

        assert result["charts"] == [{"name": "ghost", "error": "No chart named 'ghost'."}]
        assert result["tables"] == [{"name": "gone", "error": "No table named 'gone'."}]


class TestHowObjectsAreNamed:
    """A project names an object as ``ref(name)``, as ``${ref(name)}``, or writes
    it in line. Each form reads the same data."""

    def test_a_context_string_reference_reads_the_same_as_a_ref(self, project):
        _write(project, "chart", {"name": "braced_chart", "insights": ["${ref(by_x)}"]})
        _write(project, "table", {"name": "braced_table", "data": "${ref(orders_q)}"})
        _write(
            project,
            "dashboard",
            {
                "name": "braced",
                "rows": [
                    _row({"chart": "${ref(braced_chart)}"}, {"table": "${ref(braced_table)}"})
                ],
            },
        )

        listed = {d["name"]: d for d in call(project, LIST, {})["dashboards"]}
        result = call(project, GET, {"type": "dashboard", "name": "braced"})

        assert listed["braced"] == {
            "name": "braced",
            "charts": ["braced_chart"],
            "tables": ["braced_table"],
        }
        assert result["charts"] == [
            {"name": "braced_chart", "spec": result["charts"][0]["spec"], "insights": ["by_x"]}
        ]
        assert [(d["name"], d["kind"], d["row_count"]) for d in result["data"]] == [
            ("by_x", "insight", 6),
            ("orders_q", "model", 6),
        ]

    def test_an_insight_written_in_the_chart_is_read(self, project):
        _write(project, "chart", {"name": "inline_chart", "insights": [_insight("inline_one")]})

        result = call(project, GET, {"type": "chart", "name": "inline_chart"})

        assert result["insights"] == ["inline_one"]
        assert _dataset(result, "inline_one")["row_count"] == 6

    def test_a_chart_and_a_table_written_in_the_dashboard_are_read(self, project):
        _write(
            project,
            "dashboard",
            {
                "name": "inline",
                "rows": [
                    _row(
                        {"chart": {"name": "inline_chart", "insights": ["ref(by_x)"]}},
                        {"table": {"name": "inline_table", "data": _insight("table_insight")}},
                    )
                ],
            },
        )

        result = call(project, GET, {"type": "dashboard", "name": "inline"})

        assert [c["name"] for c in result["charts"]] == ["inline_chart"]
        assert result["tables"][0]["data"] == "table_insight"
        assert [(d["name"], d["row_count"]) for d in result["data"]] == [
            ("by_x", 6),
            ("table_insight", 6),
        ]

    def test_a_model_written_in_a_table_is_read(self, project):
        source = project.project.sources[0].name
        model = {
            "name": "inline_model",
            "sql": "SELECT x FROM test_table",
            "source": f"ref({source})",
        }
        table = project.table_manager.validate_object({"name": "t", "data": model})

        kind, name, found = data_tools._table_data(project, table)

        assert (kind, name) == ("model", "inline_model") and found.sql == model["sql"]

    def test_a_pivot_table_reads_what_its_columns_name(self, project):
        table = project.table_manager.validate_object(
            {
                "name": "pivot",
                "columns": ["${ref(by_x).x}"],
                "rows": ["${ref(by_x).x}"],
                "values": ["sum(${ref(by_x).y})"],
            }
        )

        kind, name, _ = data_tools._table_data(project, table)

        assert (kind, name) == ("insight", "by_x")

    def test_a_table_that_names_nothing_readable_has_no_data(self, project):
        nothing = project.table_manager.validate_object({"name": "bare"})
        ghost = project.table_manager.validate_object({"name": "lost", "data": "ref(ghost)"})
        reader = data_tools._SavedData(project, {}, 5)

        plain = SimpleNamespace(data="not a reference", columns=None, rows=None, values=None)

        assert data_tools._table_data(project, nothing) == (None, None, None)
        assert data_tools._table_data(project, plain) == (None, None, None)
        assert data_tools._table_data(project, ghost) == (None, "ghost", None)
        assert set(data_tools._table_entry("lost", ghost, reader)) == {"name", "spec"}
        assert reader.datasets == {}

    def test_a_model_with_no_sql_says_so(self, project, monkeypatch):
        monkeypatch.setattr(
            data_tools,
            "_table_data",
            lambda app, table: ("model", "csvish", SimpleNamespace(sql=None)),
        )

        result = call(project, GET, {"type": "dashboard", "name": "orders"})

        assert _dataset(result, "csvish") == {
            "name": "csvish",
            "kind": "model",
            "error": "Model 'csvish' has no SQL on a source to read.",
        }

    def test_a_model_query_that_writes_never_reaches_the_source(self, project, monkeypatch):
        monkeypatch.setattr(
            data_tools, "execute_and_get_result", lambda *a, **k: pytest.fail("ran")
        )
        model = SimpleNamespace(sql="DROP TABLE test_table", source=None)

        with pytest.raises(ToolError, match="Only read queries"):
            data_tools._model_rows(project, "bad", model, 5)


class TestAProjectThatLivesElsewhere:
    """A host that holds the project as rows fills the same managers, so both
    tools answer as they do for a local project."""

    @pytest.fixture
    def remote(self, integration_app):
        from tests.agent.test_remote import _envelope, _project

        source = integration_app.project.sources[0]
        rows = {
            "sources": [_envelope(source.name, source.model_dump(exclude_none=True, mode="json"))],
            "models": [
                _envelope(
                    "orders_q",
                    {"sql": "SELECT x, y FROM test_table", "source": f"ref({source.name})"},
                )
            ],
            "insights": [_envelope("by_x", {"props": _insight("by_x")["props"]})],
            "charts": [_envelope("orders_chart", {"insights": ["ref(by_x)"]})],
            "tables": [_envelope("model_table", {"data": "ref(orders_q)"}, status="new")],
            "dashboards": [
                _envelope(
                    "orders",
                    {"rows": [_row({"chart": "ref(orders_chart)"}, {"table": "ref(model_table)"})]},
                )
            ],
        }
        project, core = _project(rows)
        return project, core

    def test_the_list_reads_the_rows_and_names_no_project(self, remote):
        project, core = remote

        result = call(project, LIST, {})

        assert result["dashboards"] == [
            {"name": "orders", "charts": ["orders_chart"], "tables": ["model_table"]}
        ]
        assert "project" not in result and "branch" not in result
        assert core.saved == []

    def test_the_data_comes_from_the_source(self, remote):
        project, core = remote

        result = call(project, GET, {"type": "dashboard", "name": "orders"})

        assert [(d["name"], d["kind"], d["row_count"]) for d in result["data"]] == [
            ("by_x", "insight", 6),
            ("orders_q", "model", 6),
        ]
        assert core.saved == []

    def test_both_name_the_project_and_the_branch_the_host_set(self, remote):
        project, _ = remote
        project.project_name, project.branch_name = "sales", "main"

        listed = call(project, LIST, {})
        fetched = call(project, GET, {"type": "chart", "name": "orders_chart"})

        for result in (listed, fetched):
            assert (result["project"], result["branch"]) == ("sales", "main")


class TestTheRegistry:
    def test_both_tools_are_offered(self):
        assert {LIST, GET} <= set(TOOLS)

    def test_both_declare_that_they_only_read(self):
        listed = {tool["name"]: tool for tool in tool_list()}

        assert listed[LIST]["annotations"] == {
            "title": "List charts and dashboards",
            "readOnlyHint": True,
            "destructiveHint": False,
            "openWorldHint": False,
        }
        assert listed[GET]["annotations"] == {
            "title": "Get chart or dashboard data",
            "readOnlyHint": True,
            "destructiveHint": False,
            "openWorldHint": True,
        }

    def test_only_the_tool_that_reads_a_source_is_a_data_tool(self):
        """A host that sends the data tools to a worker with the warehouse
        drivers reads this registry to choose."""
        assert GET in DATA_TOOLS and LIST not in DATA_TOOLS
        assert set(CATALOG_TOOLS) == {LIST}

    def test_both_take_a_project_id(self):
        for name in (LIST, GET):
            assert "project_id" in TOOLS[name].input_schema["properties"]

    def test_the_description_states_the_row_limit(self):
        assert str(data_tools.MAX_PREVIEW_INSIGHT_ROWS) in TOOLS[GET].description


class TestOverMcp:
    """The same answers through the second transport."""

    def _call(self, client, name, arguments):
        body = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
        }
        response = client.post("/api/mcp/", json=body)
        assert response.status_code == 200
        return json.loads(response.data)["result"]

    def test_the_list_and_the_data_arrive_as_json_text(self, project):
        client = project.app.test_client()

        listed = self._call(client, LIST, {})
        fetched = self._call(client, GET, {"type": "chart", "name": "orders_chart"})

        assert listed["isError"] is False and fetched["isError"] is False
        names = [d["name"] for d in json.loads(listed["content"][0]["text"])["dashboards"]]
        assert "orders" in names
        assert json.loads(fetched["content"][0]["text"])["data"][0]["row_count"] == 6

    def test_an_unknown_chart_is_an_error_result(self, project):
        result = self._call(project.app.test_client(), GET, {"type": "chart", "name": "ghost"})

        assert result["isError"] is True
        assert "No chart named 'ghost'" in result["content"][0]["text"]
