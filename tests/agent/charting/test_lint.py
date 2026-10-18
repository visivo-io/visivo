"""Write-time warnings for configs that validate and render wrong. Each case
is a defect the agent eval found more than once."""

from types import SimpleNamespace

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

    def test_reversed_or_light_to_dark_scales_and_other_traces_pass(self):
        titled = {"colorbar": {"title": {"text": "Trips"}}}
        for props in (
            {"type": "heatmap", "colorscale": "Blues", "reversescale": True, **titled},
            {"type": "heatmap", "colorscale": "Viridis", **titled},
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
        assert len(found) == 1 and "value axis (yaxis)" in found[0]
        horizontal = lint.warnings(self.APP, "charts", self.chart("hbars"))
        assert "value axis (xaxis)" in horizontal[0]
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

    def test_a_clean_write_has_no_warnings_key(self, integration_app):
        result = call(
            integration_app, "write_markdown", {"config": {"name": "m", "content": "# hi"}}
        )
        assert "warnings" not in result
