"""Write-time warnings for configs that validate and render wrong. Each case
is a defect the agent eval found more than once."""

from types import SimpleNamespace

import pytest

from visivo.agent.charting import lint
from visivo.agent.tools import call

DATES = SimpleNamespace(
    range=SimpleNamespace(start="2024-01-01"),
    display=SimpleNamespace(default=SimpleNamespace(start="2024-01-01")),
)
BOROUGH = SimpleNamespace(range=None, display=SimpleNamespace(default=None))
APP = SimpleNamespace(input_manager=SimpleNamespace(get={"d": DATES, "b": BOROUGH}.get))


def _insight(props, interactions=None):
    return {"name": "i", "props": props, "interactions": interactions or []}


class TestColorScales:
    def test_a_dark_to_light_scale_on_a_map_is_flagged(self):
        props = {"type": "choropleth", "colorscale": "YlOrRd", "colorbar": {"title": "t"}}
        found = lint.warnings(APP, "insights", _insight(props))
        assert len(found) == 1 and "reversescale: true" in found[0]

    def test_a_reversed_light_to_dark_scale_is_flagged(self):
        """The eval agent "fixed" a pale-high YlOrRd heatmap with Reds plus
        `reversescale: true`, which turned it pale-high again."""
        props = {"type": "heatmap", "colorscale": "Reds", "reversescale": True}
        props["colorbar"] = {"title": {"text": "Trips"}}
        found = lint.warnings(APP, "insights", _insight(props))
        assert len(found) == 1 and "Remove `reversescale`" in found[0]

    def test_reversed_or_light_to_dark_scales_and_other_traces_pass(self):
        titled = {"colorbar": {"title": {"text": "Trips"}}}
        for props in (
            {"type": "heatmap", "colorscale": "Blues", "reversescale": True, **titled},
            {"type": "heatmap", "colorscale": "Viridis", **titled},
            {"type": "heatmap", "colorscale": "Reds", **titled},
            {"type": "bar", "colorscale": "YlOrRd"},
        ):
            assert lint.warnings(APP, "insights", _insight(props)) == []

    def test_an_untitled_colour_bar_is_flagged_unless_hidden(self):
        found = lint.warnings(APP, "insights", _insight({"type": "choropleth", "colorbar": {}}))
        assert len(found) == 1 and "colour bar has no title" in found[0] and "zmax" in found[0]
        hidden = {"type": "heatmap", "showscale": False}
        assert lint.warnings(APP, "insights", _insight(hidden)) == []


class TestIndicators:
    def test_an_unformatted_kpi_is_flagged(self):
        props = {"type": "indicator", "value": "?{ sum(${ref(m).x}) }[0]"}
        found = lint.warnings(APP, "insights", _insight(props))
        assert len(found) == 1 and "number.valueformat" in found[0]

    def test_a_formatted_kpi_passes(self):
        props = {"type": "indicator", "number": {"valueformat": ".1%"}}
        assert lint.warnings(APP, "insights", _insight(props)) == []


class TestIndicatorCells:
    """A one-row column bound to `value` renders as a dash; the KPI skill's
    first gotcha says to pick `[0]`, and this says it again at write time."""

    def test_a_query_with_no_index_is_flagged_for_each_cell(self):
        props = {
            "type": "indicator",
            "number": {"valueformat": ",.0f"},
            "value": "?{ sum(${ref(m).x}) }",
            "delta": {"reference": " ?{ sum(${ref(m).x}) } "},
            "gauge": {"threshold": {"value": "?{ max(${ref(m).target}) }"}},
        }
        found = lint.warnings(APP, "insights", _insight(props))
        assert len(found) == 3
        assert "`value: ?{ sum(${ref(m).x}) }[0]`" in found[0]
        assert "`delta.reference: ?{ sum(${ref(m).x}) }[0]`" in found[1]
        assert "`gauge.threshold.value:" in found[2]

    def test_an_indexed_query_or_a_number_passes(self):
        props = {
            "type": "indicator",
            "number": {"valueformat": ",.0f"},
            "value": "?{ sum(${ref(m).x}) }[0]",
            "delta": {"reference": "?{ sum(${ref(m).x}) }[1]"},
            "gauge": {"threshold": {"value": 90}},
        }
        assert lint.warnings(APP, "insights", _insight(props)) == []


class TestLineOrder:
    X = "?{ date_trunc('day', ${ref(m).pickup_at}) }"
    Y = "?{ count(${ref(m).id}) }"

    def test_an_unsorted_line_is_flagged_with_its_own_x(self):
        props = {"type": "scatter", "mode": "lines+markers", "x": self.X, "y": self.Y}
        found = lint.warnings(APP, "insights", _insight(props))
        assert found == [
            "`mode: lines+markers` joins the points in row order, not x order, so the line "
            "zig-zags. Add `- sort: ?{ date_trunc('day', ${ref(m).pickup_at}) ASC }` under "
            "`interactions`."
        ]

    def test_a_sorted_line_markers_or_a_literal_x_pass(self):
        sort = [{"sort": "?{ ${ref(m).pickup_at} ASC }"}]
        line = {"type": "scatter", "mode": "lines", "x": self.X, "y": self.Y}
        assert lint.warnings(APP, "insights", _insight(line, sort)) == []
        for props in (
            {**line, "mode": "markers"},
            {**line, "type": "bar"},
            {**line, "x": ["a", "b"]},
        ):
            assert lint.warnings(APP, "insights", _insight(props)) == []


class TestIndicatorLabels:
    def test_a_label_in_the_prefix_is_flagged(self):
        props = {"type": "indicator", "number": {"valueformat": ",.0f", "prefix": "Total Trips"}}
        found = lint.warnings(APP, "insights", _insight(props))
        assert len(found) == 1 and "`title.text: Total Trips`" in found[0]

    def test_a_unit_prefix_passes(self):
        for prefix in ("$", "USD ", "\u20ac"):
            props = {"type": "indicator", "number": {"valueformat": ",.0f", "prefix": prefix}}
            assert lint.warnings(APP, "insights", _insight(props)) == []

    def test_an_unformatted_relative_delta_is_flagged(self):
        props = {
            "type": "indicator",
            "number": {"valueformat": ",.0f"},
            "delta": {"reference": "?{ ${ref(m).x} }[1]", "relative": True},
        }
        found = lint.warnings(APP, "insights", _insight(props))
        assert len(found) == 1 and "delta.valueformat: '.1%'" in found[0]
        props["delta"]["valueformat"] = ".1%"
        assert lint.warnings(APP, "insights", _insight(props)) == []
        props["delta"] = {"reference": "?{ ${ref(m).x} }[1]"}
        assert lint.warnings(APP, "insights", _insight(props)) == []


class TestNumberFormats:
    def test_a_signed_fixed_format_is_flagged_wherever_it_sits(self):
        props = {
            "type": "indicator",
            "number": {"valueformat": "+.1f", "suffix": "%"},
            "delta": {"valueformat": "-,.0f"},
        }
        found = lint.warnings(APP, "insights", _insight(props))
        assert len(found) == 2 and "Drop the sign (`.1f`)" in found[0]
        layout = {"yaxis": {"tickformat": "+.2s"}, "annotations": [{"hoverformat": "(.0f"}]}
        assert len(lint.warnings(APP, "charts", {"name": "c", "layout": layout})) == 2

    def test_formats_plotly_reads_pass(self):
        for valueformat in (",.0f", "$,.2f", ".1%", "+.1%", "+d", "+.3r", "~s"):
            props = {"type": "indicator", "number": {"valueformat": valueformat}}
            assert lint.warnings(APP, "insights", _insight(props)) == []
        assert lint.warnings(APP, "charts", {"name": "c", "layout": {"title": "+.1f"}}) == []


class TestDateRangeAccessors:
    def test_an_unquoted_date_accessor_is_flagged_once_per_use(self):
        filter_ = "?{ ${ref(m).day} between ${ref(d).min} and ${ref(d).max} }"
        found = lint.warnings(APP, "insights", _insight({"type": "bar"}, [{"filter": filter_}]))
        assert len(found) == 2 and "'${ref(d).min}'::date" in found[0]

    def test_quoted_dates_numeric_ranges_and_unknown_inputs_pass(self):
        for filter_ in (
            "?{ ${ref(m).day} between '${ref(d).min}'::date and '${ref(d).max}'::date }",
            "?{ ${ref(m).x} >= ${ref(b).min} }",
            "?{ ${ref(m).x} >= ${ref(nope).min} }",
        ):
            assert (
                lint.warnings(APP, "insights", _insight({"type": "bar"}, [{"filter": filter_}]))
                == []
            )

    def test_an_app_without_inputs_never_flags(self):
        filter_ = "?{ ${ref(m).day} >= ${ref(d).min} }"
        assert (
            lint.warnings(SimpleNamespace(), "insights", _insight({}, [{"filter": filter_}])) == []
        )

    def test_a_default_start_alone_marks_a_date_range(self):
        by_default = SimpleNamespace(
            range=None, display=SimpleNamespace(default=SimpleNamespace(start="2024-03-01"))
        )
        app = SimpleNamespace(input_manager=SimpleNamespace(get={"w": by_default}.get))
        assert (
            lint._is_date_range(app, "w")
            and not lint._iso_date("next week")
            and not lint._iso_date(5)
        )


class TestModelReferences:
    def test_an_insight_naming_no_model_is_flagged(self):
        found = lint.warnings(APP, "insights", _insight({"type": "bar", "y": "?{ count(*) }"}))
        assert any("references no model" in f for f in found)

    def test_a_ref_in_props_or_interactions_is_enough(self):
        in_props = _insight({"type": "bar", "y": "?{ count(${ref(m).id}) }"})
        in_filter = _insight({"type": "bar", "y": "?{ 1 }"}, [{"filter": "?{ ${ref(m).x} > 1 }"}])
        static = _insight({"type": "image", "z": [[1, 2], [3, 4]]})
        for config in (in_props, in_filter, static):
            assert not any(
                "references no model" in f for f in lint.warnings(APP, "insights", config)
            )


class TestAxisTitles:
    INSIGHTS = {
        "bars": SimpleNamespace(props=SimpleNamespace(type=SimpleNamespace(value="bar"))),
        "hbars": SimpleNamespace(props=SimpleNamespace(type="bar", orientation="h")),
        "grid": SimpleNamespace(props=SimpleNamespace(type="heatmap")),
        "kpi": SimpleNamespace(props=SimpleNamespace(type="indicator")),
    }
    APP = SimpleNamespace(insight_manager=SimpleNamespace(get=INSIGHTS.get))

    def chart(self, insight, layout=None):
        return {"name": "c", "insights": [f"${{ref({insight})}}"], "layout": layout}

    def test_an_untitled_value_axis_is_flagged(self):
        found = lint.warnings(self.APP, "charts", self.chart("bars", {"xaxis": {"title": "Week"}}))
        assert (
            len(found) == 1
            and "value axis (yaxis)" in found[0]
            and "`layout.yaxis.title.text" in found[0]
        )
        horizontal = lint.warnings(self.APP, "charts", self.chart("hbars"))
        assert "value axis (xaxis)" in horizontal[0] and "`layout.xaxis.title.text" in horizontal[0]
        both = {"name": "c", "insights": ["${ref(bars)}", "${ref(hbars)}"]}
        assert "(xaxis and yaxis)" in lint.warnings(self.APP, "charts", both)[0]

    def test_a_titled_value_axis_passes_without_a_category_title(self):
        assert (
            lint.warnings(
                self.APP, "charts", self.chart("bars", {"yaxis": {"title": {"text": "Trips"}}})
            )
            == []
        )
        assert (
            lint.warnings(self.APP, "charts", self.chart("hbars", {"xaxis": {"title": "Mt CO2"}}))
            == []
        )

    def test_heatmaps_kpis_unknown_insights_and_bare_apps_pass(self):
        for config, app in (
            (self.chart("grid"), self.APP),
            (self.chart("kpi"), self.APP),
            (self.chart("nope"), self.APP),
            (self.chart("bars"), SimpleNamespace()),
        ):
            assert lint.warnings(app, "charts", config) == []

    def test_a_blank_title_counts_as_missing(self):
        layout = {"yaxis": {"title": {"text": " "}}}
        assert "value axis" in lint.warnings(self.APP, "charts", self.chart("bars", layout))[0]


class TestRefShapes:
    def test_a_column_inside_the_ref_is_flagged_once_with_the_fix(self):
        props = {"type": "bar", "x": "?{${ref(tips.borough)}}", "y": "?{${ref(tips.borough)}}"}
        found = lint.warnings(APP, "insights", _insight(props))
        assert found == [
            "`${ref(tips.borough)}` puts the column inside the ref, so it names no object "
            "and the insight never runs. Write `${ref(tips).borough}`."
        ]

    def test_a_column_ref_outside_a_query_is_flagged_with_the_fix(self):
        props = {
            "type": "heatmap",
            "x": "${ref(trips).hour}",
            "marker": {"color": ["${ref(trips).day}"]},
            "z": "?{ count(${ref(trips).id}) }",
        }
        found = lint.warnings(APP, "insights", _insight(props))
        assert found[:2] == [
            "`x: ${ref(trips).hour}` sits outside a query, so it is a plain string, the insight "
            "runs nothing and its chart never loads. Write `x: ?{ ${ref(trips).hour} }`.",
            "`marker.color: ${ref(trips).day}` sits outside a query, so it is a plain string, "
            "the insight runs nothing and its chart never loads. "
            "Write `marker.color: ?{ ${ref(trips).day} }`.",
        ]

    def test_an_input_accessor_outside_a_query_passes(self):
        props = {"type": "bar", "x": "?{ ${ref(tips).borough} }", "name": "${ref(b).value}"}
        assert lint.warnings(APP, "insights", _insight(props)) == []
        no_inputs = SimpleNamespace()
        assert "sits outside a query" in lint.warnings(no_inputs, "insights", _insight(props))[0]

    @pytest.mark.parametrize("type_key", ["metrics", "dimensions"])
    def test_a_column_inside_the_ref_of_a_semantic_expression_is_flagged(self, type_key):
        config = {"name": "m", "expression": "count(${ref(trips.vendor)})"}
        assert lint.warnings(APP, type_key, config) == [
            "`${ref(trips.vendor)}` puts the column inside the ref, so it names no object "
            f"and the {type_key[:-1]} never runs. Write `${{ref(trips).vendor}}`."
        ]
        assert (
            lint.warnings(APP, type_key, {"name": "m", "expression": "count(${ref(trips).vendor})"})
            == []
        )

    def test_a_ref_in_a_model_sql_is_flagged(self):
        sql = "SELECT * FROM ${ref(trips)} t JOIN ${ref(zones)} z ON t.z = z.id"
        found = lint.warnings(APP, "models", {"name": "m", "sql": sql})
        assert len(found) == 1 and "Query the source's tables directly" in found[0]

    def test_well_formed_refs_and_plain_sql_pass(self):
        props = {"type": "bar", "x": "?{ ${ref(tips).borough} }"}
        assert lint.warnings(APP, "insights", _insight(props)) == []
        assert lint.warnings(APP, "models", {"name": "m", "sql": "select * from trips"}) == []


class TestDashboardRefs:
    CHARTS = {"trend_chart": object()}
    INSIGHTS = {"kpi_trips": object()}
    APP = SimpleNamespace(
        chart_manager=SimpleNamespace(get=CHARTS.get),
        table_manager=SimpleNamespace(get={}.get),
        insight_manager=SimpleNamespace(get=INSIGHTS.get),
    )

    def test_an_insight_placed_as_a_chart_and_missing_items_are_flagged(self):
        rows = [
            {"items": [{"chart": "${ref(kpi_trips)}"}, {"chart": "${ref(trend_chart)}"}]},
            {
                "items": [
                    {"rows": [{"items": [{"table": "${ref(nope)}"}, {"chart": "${ref(gone)}"}]}]}
                ]
            },
            {"items": [{"chart": "${ref(kpi_trips)}"}, {"markdown": {"content": "# hi"}}]},
        ]
        found = lint.warnings(self.APP, "dashboards", {"name": "d", "rows": rows})
        assert len(found) == 3
        assert "`kpi_trips` is an insight, not a chart" in found[0]
        assert "table `nope`, which does not exist" in found[1]
        assert "chart `gone`, which does not exist" in found[2]

    def test_existing_items_and_apps_without_managers_pass(self):
        rows = [{"items": [{"chart": "${ref(trend_chart)}"}, {"input": "${ref(region)}"}]}]
        assert lint.warnings(self.APP, "dashboards", {"name": "d", "rows": rows}) == []
        assert lint.warnings(SimpleNamespace(), "dashboards", {"name": "d", "rows": rows}) == []


class TestTables:
    def test_an_unaliased_column_is_flagged(self):
        config = {"name": "t", "columns": ["${ref(m).trips}", '${ref(m).zone} as "Zone"']}
        found = lint.warnings(APP, "tables", config)
        assert len(found) == 1 and "${ref(m).trips}" in found[0]

    def test_aliased_columns_and_data_tables_pass(self):
        assert lint.warnings(APP, "tables", {"name": "t", "columns": ['${ref(m).a} AS "A"']}) == []
        assert lint.warnings(APP, "tables", {"name": "t", "data": "${ref(m)}"}) == []

    def test_other_types_are_not_linted(self):
        assert lint.warnings(APP, "charts", {"name": "c"}) == []
        assert lint.warnings(APP, "markdowns", {"name": "m"}) == []


class TestDoublePercent:
    SQL = (
        "SELECT tz.Zone AS zone, COUNT(*) AS trips, "
        "AVG(yt.tip_amount / yt.fare_amount) * 100 AS tip_pct, "
        'SUM(CASE WHEN yt."Airport_fee" > 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS airport_share, '
        "AVG(yt.tip_amount / yt.fare_amount) AS tip_rate "
        "FROM yellow_trips AS yt JOIN taxi_zones AS tz ON yt.PULocationID = tz.LocationID GROUP BY 1"
    )
    APP = SimpleNamespace(
        model_manager=SimpleNamespace(get={"zones": SimpleNamespace(sql=SQL)}.get),
        metric_manager=SimpleNamespace(
            get={
                "tip_share": SimpleNamespace(expression="100.0 * sum(tip) / sum(fare)"),
                "tip_ratio": SimpleNamespace(expression="sum(tip) / sum(fare)"),
            }.get
        ),
        dimension_manager=SimpleNamespace(get={}.get),
    )

    def table(self, value, fmt=".1%"):
        return {"name": "t", "columns": [{"value": value, "format": fmt}]}

    def test_a_percent_format_on_a_model_column_already_times_100_is_flagged(self):
        for column in ("tip_pct", "airport_share", "Airport_Share"):
            entry = f'${{ref(zones).{column}}} as "Share"'
            found = lint.warnings(self.APP, "tables", self.table(entry))
            assert len(found) == 1 and "2100%" in found[0] and "model `zones`" in found[0]

    def test_a_fraction_or_a_non_percent_format_passes(self):
        assert (
            lint.warnings(self.APP, "tables", self.table('${ref(zones).tip_rate} as "Tip"')) == []
        )
        assert (
            lint.warnings(self.APP, "tables", self.table('${ref(zones).tip_pct} as "Tip"', ".1f"))
            == []
        )
        assert (
            lint.warnings(self.APP, "tables", self.table('${ref(zones).trips} as "T"', ",.0f"))
            == []
        )
        unknown = self.table('${ref(other).tip_pct} as "Tip"')
        assert lint.warnings(self.APP, "tables", unknown) == []
        assert lint.warnings(SimpleNamespace(), "tables", unknown) == []

    def test_a_metric_or_inline_expression_times_100_is_flagged(self):
        for value in ('${ref(tip_share)} as "Tip"', '${ref(zones).tip_share} as "Tip"'):
            found = lint.warnings(self.APP, "tables", self.table(value))
            assert len(found) == 1 and "`tip_share`" in found[0]
        values = {
            "name": "p",
            "values": [{"value": "sum(${ref(zones).tip_rate}) * 100", "format": "0.1%"}],
        }
        found = lint.warnings(self.APP, "tables", values)
        assert len(found) == 1 and "the expression" in found[0]
        ratio = self.table('${ref(tip_ratio)} as "Tip"')
        assert lint.warnings(self.APP, "tables", ratio) == []

    def test_scaling_by_1000_or_100_point_5_is_not_a_percentage(self):
        for expression in ("sum(x) * 1000", "sum(x) * 100.5", "1000 * sum(x)", "x + 100"):
            assert lint._times_100(self.APP, expression) is None
        for expression in ("sum(x) * 100", "100.0*sum(x)", "sum(x)*100.00 / n"):
            assert lint._times_100(self.APP, expression) == "the expression"

    def test_sql_that_does_not_parse_is_skipped(self):
        broken = SimpleNamespace(
            model_manager=SimpleNamespace(get=lambda n: SimpleNamespace(sql="SELECT ("))
        )
        assert lint._times_100(broken, "${ref(zones).tip_pct}") is None

    def test_an_insight_with_a_percent_format_over_a_times_100_query_is_flagged(self):
        props = {
            "type": "bar",
            "x": "?{ ${ref(zones).zone} }",
            "y": "?{ avg(${ref(zones).tip_pct}) }",
            "texttemplate": "%{y}",
            "hoverlabel": {"hoverformat": ".1%"},
        }
        found = lint.warnings(self.APP, "insights", _insight(props))
        assert len(found) == 1 and "`hoverlabel.hoverformat: '.1%'`" in found[0]
        props["y"] = "?{ avg(${ref(zones).tip_rate}) }"
        assert lint.warnings(self.APP, "insights", _insight(props)) == []

    def test_a_kpi_with_a_percent_valueformat_over_a_times_100_metric_is_flagged(self):
        props = {
            "type": "indicator",
            "value": "?{ ${ref(tip_share)} }[0]",
            "number": {"valueformat": ".1%"},
        }
        found = lint.warnings(self.APP, "insights", _insight(props))
        assert len(found) == 1 and "number.valueformat" in found[0]

    def test_a_date_format_is_not_a_percent_format(self):
        props = {"type": "scatter", "x": "?{ ${ref(zones).tip_pct} }", "xhoverformat": "%b %Y"}
        props["hoverformat"] = "%Y-%m"
        assert lint.warnings(self.APP, "insights", _insight(props)) == []

    def test_an_unaliased_formatted_column_is_flagged(self):
        found = lint.warnings(self.APP, "tables", self.table("${ref(zones).trips}", ",.0f"))
        assert len(found) == 1 and "Alias every column" in found[0]


class TestDateRangeInputs:
    def b17(self, **range_):
        return {
            "name": "pickup_date",
            "type": "multi-select",
            "range": {"start": "2024-.1-01", "end": "2024-04-01", "step": "1 day", **range_},
            "display": {
                "type": "date-range",
                "default": {"start": "2024-01-01", "end": "2024-01-31"},
            },
        }

    def test_the_b17_typo_in_a_range_bound_is_flagged(self):
        found = lint.warnings(APP, "inputs", self.b17())
        assert len(found) == 1 and "`range.start: 2024-.1-01` is not a date" in found[0]

    def test_dates_expressions_and_queries_pass(self):
        for start in (
            "2024-01-01",
            "2024-01-01T00:00:00",
            "today - 30 days",
            "START_OF_MONTH",
            "end_of_quarter + 1 week",
            "?{ min(${ref(trips).pickup_date}) }",
        ):
            assert lint.warnings(APP, "inputs", self.b17(start=start)) == [], start

    def test_a_bad_default_a_number_and_a_bad_step_are_flagged(self):
        config = self.b17(start="2024-01-01", end=2024, step="daily")
        config["display"]["default"]["start"] = "yesterday"
        found = lint.warnings(APP, "inputs", config)
        assert len(found) == 3
        assert "`range.end: 2024`" in found[0] and "`display.default.start: yesterday`" in found[1]
        assert "`range.step: daily`" in found[2]
        assert lint.warnings(APP, "inputs", self.b17(start="2024-01-01", step="?{ 1 }")) == []

    def test_other_inputs_pass(self):
        chips = {"name": "b", "type": "multi-select", "display": {"type": "chips"}}
        assert lint.warnings(APP, "inputs", chips) == []
        assert lint.warnings(APP, "inputs", {"name": "s", "type": "single-select"}) == []
        no_default = self.b17(start="2024-01-01")
        del no_default["display"]["default"]
        assert lint.warnings(APP, "inputs", no_default) == []


class TestTheWriteCarriesThem:
    def test_write_chart_warns_about_untitled_axes(self, integration_app):
        insight = {"name": "by_region", "props": {"type": "bar", "x": "?{ 1 }", "y": "?{ 2 }"}}
        call(integration_app, "write_insight", {"config": insight})
        chart = {"name": "by_region_chart", "insights": ["${ref(by_region)}"]}
        result = call(integration_app, "write_chart", {"config": chart})
        assert any("value axis (yaxis)" in w for w in result["warnings"])

    def test_write_insight_returns_its_warnings(self, integration_app):
        config = {
            "name": "map",
            "props": {"type": "heatmap", "x": "?{ 1 }", "colorscale": "Greens"},
        }
        result = call(integration_app, "write_insight", {"config": config})
        assert result["status"] == "draft"
        assert any("reversescale" in w for w in result["warnings"])

    def test_write_insight_warns_about_a_percentage_formatted_twice(self, integration_app):
        model = {"name": "shares", "sql": "SELECT x, y * 100.0 / x AS share FROM test_table"}
        call(integration_app, "write_model", {"config": model})
        props = {
            "type": "indicator",
            "value": "?{ avg(${ref(shares).share}) }[0]",
            "number": {"valueformat": ".1%"},
        }
        result = call(integration_app, "write_insight", {"config": _insight(props)})
        assert any("model `shares` for `share`" in w for w in result["warnings"])

    def test_write_input_warns_about_a_bound_that_is_not_a_date(self, integration_app):
        config = TestDateRangeInputs().b17()
        result = call(integration_app, "write_input", {"config": config})
        assert result["status"] == "draft"
        assert any("`range.start: 2024-.1-01`" in w for w in result["warnings"])

    def test_a_clean_write_has_no_warnings_key(self, integration_app):
        result = call(
            integration_app, "write_markdown", {"config": {"name": "m", "content": "# hi"}}
        )
        assert "warnings" not in result


class TestLayoutInputRefs:
    def chart(self, layout):
        return {"name": "c", "insights": [], "layout": layout}

    def test_a_ref_to_a_missing_input_is_flagged(self):
        found = lint.warnings(APP, "charts", self.chart({"title": {"text": "${ref(year).value}"}}))
        assert len(found) == 1
        assert "`layout.title.text`" in found[0] and "no input named `year`" in found[0]

    def test_a_ref_to_an_existing_input_passes(self):
        assert (
            lint.warnings(APP, "charts", self.chart({"title": {"text": "${ref(d).value}"}})) == []
        )

    def test_text_without_a_ref_passes(self):
        assert lint.warnings(APP, "charts", self.chart({"title": {"text": "Plain"}})) == []

    def test_an_app_without_inputs_is_not_judged(self):
        bare = SimpleNamespace()
        assert lint.warnings(bare, "charts", self.chart({"title": "${ref(year).value}"})) == []

    def test_write_and_validate_chart_both_warn(self, integration_app):
        chart = {
            "name": "c_missing_input",
            "insights": [],
            "layout": {"title": {"text": "${ref(nope)}"}},
        }
        for tool in ("write_chart", "validate_chart"):
            result = call(integration_app, tool, {"config": chart})
            assert any("no input named `nope`" in w for w in result["warnings"]), tool


class TestValidateWarnsWhatWriteWarns:
    """validate_* is the dry run of write_*, so it returns the same warnings."""

    CONFIGS = {
        "input": TestDateRangeInputs().b17(),
        "dashboard": {
            "name": "d_missing_chart",
            "rows": [{"items": [{"chart": "${ref(no_such_chart)}"}]}],
        },
        "metric": {"name": "m_dotted", "expression": "SUM(${ref(orders.amount)})"},
        "dimension": {"name": "d_dotted", "expression": "${ref(orders.region)}"},
        "markdown": {"name": "note", "content": "Revenue is {{ revenue }} today"},
        "chart": {
            "name": "c_missing_input",
            "insights": [],
            "layout": {"title": {"text": "${ref(nope)}"}},
        },
    }

    @pytest.mark.parametrize("kind", sorted(CONFIGS))
    def test_validate_and_write_return_the_same_warnings(self, integration_app, kind):
        config = self.CONFIGS[kind]
        validated = call(integration_app, f"validate_{kind}", {"config": config})
        written = call(integration_app, f"write_{kind}", {"config": config})

        assert validated["valid"] is True
        assert validated["warnings"]
        assert validated["warnings"] == written["warnings"]
