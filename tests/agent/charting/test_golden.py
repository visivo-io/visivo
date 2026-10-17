"""The golden table: request → expected top family.

Every rule edit must keep this green. Each row is one RecommendRequest and
what should be drawn first: the family, and where it matters the trace type
and the repairs. The rows cover every intent, the edges of the measured
ranges (one value either side), the worked cases of
specs/chart-selection/01-rule-format.md and the table/pivot cases of
06-tables.md.
"""

import pytest

from visivo.agent.charting.recommend import recommend
from visivo.agent.charting.schema import Intent, RecommendRequest, ShapeCard
from visivo.models.color_palette import ColorPalette


def card(column, role, cardinality, **extra):
    if role == "time" and "time_span_points" not in extra:
        extra["time_span_points"] = cardinality
    return ShapeCard(column=column, role=role, cardinality=cardinality, **extra)


def cat(column, n, **extra):
    return card(column, "categorical", n, **extra)


def m(name, agg="sum", **extra):
    return {"name": name, "agg": agg, **extra}


RIDES = m("rides", "count")
REVENUE = m("revenue")
DAY = card("pickup_day", "time", 365, time_grain="day")
MONTH = card("month", "time", 12, time_grain="month")
DISTANCE = card("trip_distance", "numeric_continuous", 48_000)
FARE = card("fare", "numeric_continuous", 5_000)
BOROUGH = cat("pickup_borough", 5)
LAT, LON = card("lat", "geo_point", 900), card("lon", "geo_point", 900)
OHLC = [m(n, "max") for n in ("open", "high", "low", "close")]


def shares(*head):
    """Top values with these leading shares and the rest spread over sixteen more."""
    rest = (1 - sum(head)) / 16
    return [{"value": f"v{i}", "share": v} for i, v in enumerate([*head] + [rest] * 16)]


def row(case, expected, trace=None, transforms=None, **request):
    return pytest.param(request, expected, trace, transforms, id=case)


GOLDEN = [
    # kpi
    row("kpi: one number", "kpi", metrics=[RIDES], intent="kpi"),
    row("kpi: one number, no intent", "kpi", metrics=[REVENUE]),
    row("kpi: against last month", "kpi", metrics=[REVENUE], dimensions=[MONTH], intent="kpi"),
    # trend
    row(
        "trend: rides per day",
        "line",
        "scatter",
        [],
        metrics=[RIDES],
        dimensions=[DAY],
        intent="trend",
    ),
    row("trend: no intent still a line", "line", metrics=[RIDES], dimensions=[DAY]),
    row(
        "trend: days since signup is an ordered axis",
        "line",
        metrics=[RIDES],
        dimensions=[card("days_since_signup", "numeric_discrete", 90)],
        intent="trend",
    ),
    row(
        "B: three companies per day",
        "line",
        "scatter",
        [],
        metrics=[RIDES],
        dimensions=[DAY, cat("company", 3)],
        intent="trend",
    ),
    row(
        "trend: 12 series is the line max",
        "line",
        "scatter",
        [],
        metrics=[RIDES],
        dimensions=[DAY, cat("company", 12)],
        intent="trend",
    ),
    row(
        "trend: 13 series is repaired",
        "line",
        "scatter",
        ["top_n_other"],
        metrics=[RIDES],
        dimensions=[DAY, cat("company", 13)],
        intent="trend",
    ),
    row(
        "B: twenty companies per day",
        "line",
        "scatter",
        ["top_n_other"],
        metrics=[RIDES],
        dimensions=[DAY, cat("company", 20)],
        intent="trend",
    ),
    row(
        "trend: a cumulative part of a whole stacks",
        "area",
        metrics=[RIDES],
        dimensions=[DAY, cat("company", 3)],
        intent="composition",
        semantics={"part_of_whole": True},
    ),
    # change
    row(
        "change: revenue over months",
        "line",
        metrics=[REVENUE],
        dimensions=[MONTH],
        intent="change",
    ),
    row(
        "change: signed steps are a waterfall",
        "waterfall",
        metrics=[m("delta")],
        dimensions=[cat("step", 6)],
        intent="change",
        semantics={"signed_contributions": True},
    ),
    row(
        "change: a year of daily candles gets a date range first",
        "financial",
        "candlestick",
        ["input_filter"],
        metrics=OHLC,
        dimensions=[DAY],
        intent="change",
    ),
    row(
        "change: candles over 250 trading days",
        "financial",
        "candlestick",
        [],
        metrics=OHLC,
        dimensions=[card("trade_day", "time", 250, time_grain="day")],
        intent="change",
    ),
    # compare
    row(
        "compare: rides by borough",
        "bar",
        "bar",
        [],
        metrics=[RIDES],
        dimensions=[BOROUGH],
        intent="compare",
    ),
    row(
        "A: rides by borough and company",
        "bar",
        "bar",
        [],
        metrics=[RIDES],
        dimensions=[BOROUGH, cat("company", 3)],
        intent="compare",
    ),
    row(
        "A: boundaries do not beat a compare",
        "bar",
        metrics=[RIDES],
        dimensions=[card("pickup_borough", "geo_region", 5), cat("company", 3)],
        intent="compare",
        semantics={"boundaries_available": True},
    ),
    row(
        "compare: hour of day is a bar axis",
        "bar",
        metrics=[RIDES],
        dimensions=[card("pickup_hour", "numeric_discrete", 24)],
        intent="compare",
    ),
    row(
        "compare: twelve months may be columns",
        "bar",
        "bar",
        [],
        metrics=[RIDES],
        dimensions=[MONTH],
        intent="compare",
    ),
    row(
        "compare: weekday by hour is a grid",
        "heatmap",
        metrics=[RIDES],
        dimensions=[cat("weekday", 7), card("hour", "numeric_discrete", 24)],
        intent="compare",
    ),
    row(
        "compare: 41 zones by weekday is still a grid, repaired",
        "heatmap",
        "heatmap",
        ["top_n_other"],
        metrics=[RIDES],
        dimensions=[cat("zone", 41), cat("weekday", 7)],
        intent="compare",
    ),
    row(
        "compare: two units side by side",
        "bar",
        metrics=[m("fare", unit="USD"), m("distance", "avg", unit="mi")],
        dimensions=[cat("vendor", 4)],
        intent="compare",
    ),
    # rank
    row(
        "rank: 20 zones fit a bar",
        "bar",
        "bar",
        [],
        metrics=[REVENUE],
        dimensions=[cat("zone", 20)],
        intent="rank",
    ),
    row(
        "rank: 21 zones are trimmed to the bar's limit",
        "bar",
        "bar",
        ["top_n_other"],
        metrics=[REVENUE],
        dimensions=[cat("zone", 21)],
        intent="rank",
    ),
    row(
        "D: 263 zone ids are a table",
        "table",
        metrics=[REVENUE],
        dimensions=[card("zone_id", "identifier", 263)],
        intent="rank",
    ),
    row(
        "rank: 263 zone names are a table",
        "table",
        metrics=[REVENUE],
        dimensions=[cat("zone_name", 263)],
        intent="rank",
    ),
    # composition
    row(
        "composition: four payment types are a pie",
        "part_of_whole",
        "pie",
        [],
        metrics=[RIDES],
        dimensions=[cat("payment", 4)],
        intent="composition",
        semantics={"part_of_whole": True},
    ),
    row(
        "composition: six slices are trimmed to five",
        "part_of_whole",
        "pie",
        ["top_n_other"],
        metrics=[RIDES],
        dimensions=[cat("payment", 6)],
        intent="composition",
        semantics={"part_of_whole": True},
    ),
    row(
        "composition: twenty slices with a short tail are five",
        "part_of_whole",
        "pie",
        ["top_n_other"],
        metrics=[RIDES],
        dimensions=[cat("company", 20, top_n=shares(0.40, 0.25, 0.12, 0.08))],
        intent="composition",
        semantics={"part_of_whole": True},
    ),
    row(
        "composition: twenty slices whose Other would be largest are a ranked bar",
        "bar",
        "bar",
        [],
        metrics=[RIDES],
        dimensions=[cat("company", 20, top_n=shares(0.30, 0.16, 0.09, 0.07))],
        intent="composition",
        semantics={"part_of_whole": True},
    ),
    row(
        "composition: an average is never a pie",
        "bar",
        metrics=[m("fare", "avg")],
        dimensions=[cat("payment", 4)],
        intent="composition",
        semantics={"part_of_whole": True},
    ),
    row(
        "composition: nested categories",
        "hierarchy",
        "treemap",
        metrics=[REVENUE],
        dimensions=[BOROUGH, cat("zone", 20)],
        intent="composition",
        semantics={"hierarchy": True},
    ),
    row(
        "composition: with totals is a pivot",
        "table_pivot",
        metrics=[RIDES],
        dimensions=[BOROUGH, cat("payment", 5)],
        intent="composition",
        semantics={"part_of_whole": True, "totals_required": True},
    ),
    # distribution
    row(
        "C: trip distance",
        "distribution",
        "histogram",
        [],
        dimensions=[DISTANCE],
        intent="distribution",
    ),
    row("C: no intent still a histogram", "distribution", "histogram", dimensions=[DISTANCE]),
    row(
        "distribution: two groups overlay",
        "distribution",
        "histogram",
        [],
        dimensions=[DISTANCE, cat("payment", 2)],
        intent="distribution",
    ),
    row(
        "distribution: three groups is the overlay max",
        "distribution",
        "histogram",
        [],
        dimensions=[DISTANCE, cat("company", 3)],
        intent="distribution",
    ),
    row(
        "distribution: four groups are boxes",
        "distribution",
        "box",
        [],
        dimensions=[DISTANCE, cat("vendor", 4)],
        intent="distribution",
    ),
    row(
        "C: by borough is a box",
        "distribution",
        "box",
        [],
        dimensions=[DISTANCE, BOROUGH],
        intent="distribution",
    ),
    row(
        "distribution: twenty groups are every group as a box",
        "distribution",
        "box",
        [],
        dimensions=[DISTANCE, cat("company", 20)],
        intent="distribution",
    ),
    row(
        "distribution: twenty-five groups are boxes behind an input, never a top-N",
        "distribution",
        "box",
        ["input_filter"],
        dimensions=[DISTANCE, cat("company", 25)],
        intent="distribution",
    ),
    # relationship
    row(
        "relationship: fare by distance",
        "xy",
        "scatter",
        metrics=[m("fare", "avg")],
        dimensions=[DISTANCE],
        intent="relationship",
        context={"row_count": 5_000},
    ),
    row(
        "relationship: a million points are WebGL",
        "xy",
        "scattergl",
        [],
        metrics=[m("fare", "avg")],
        dimensions=[DISTANCE],
        intent="relationship",
        context={"row_count": 1_000_000},
    ),
    row(
        "relationship: two raw numbers are a density",
        "density2d",
        "histogram2d",
        dimensions=[DISTANCE, FARE],
        intent="relationship",
    ),
    # flow
    row(
        "flow: pickup to dropoff borough",
        "flow",
        "sankey",
        metrics=[RIDES],
        dimensions=[BOROUGH, cat("dropoff_borough", 5)],
        intent="flow",
    ),
    row(
        "flow: without the intent it is a grouped bar",
        "bar",
        metrics=[RIDES],
        dimensions=[BOROUGH, cat("dropoff_borough", 5)],
    ),
    row(
        "flow: ordered stages are a funnel",
        "funnel",
        metrics=[m("users", "count_distinct")],
        dimensions=[cat("stage", 5, ordered=True)],
        intent="flow",
        semantics={"ordered_stages": True},
    ),
    # geo
    row(
        "geo: states have built-in boundaries",
        "geo_region",
        "choropleth",
        [],
        metrics=[RIDES],
        dimensions=[card("state", "geo_region", 50, geo_kind="us_state")],
        intent="geo",
    ),
    row(
        "geo: boroughs without a GeoJSON are bars",
        "bar",
        metrics=[RIDES],
        dimensions=[card("pickup_borough", "geo_region", 5, geo_kind="custom")],
        intent="geo",
    ),
    row(
        "geo: boroughs with a GeoJSON are a map",
        "geo_region",
        metrics=[RIDES],
        dimensions=[card("pickup_borough", "geo_region", 5, geo_kind="custom")],
        intent="geo",
        semantics={"boundaries_available": True},
    ),
    row(
        "geo: a state by company folds the company in",
        "geo_region",
        "choropleth",
        ["dominant_category"],
        metrics=[RIDES],
        dimensions=[card("state", "geo_region", 50, geo_kind="us_state"), cat("company", 3)],
        intent="geo",
    ),
    row(
        "geo: pickup points",
        "geo_point",
        "scattermap",
        [],
        metrics=[RIDES],
        dimensions=[LAT, LON],
        intent="geo",
    ),
    row(
        "geo: points split by company",
        "geo_point",
        "scattermap",
        [],
        metrics=[RIDES],
        dimensions=[LAT, LON, cat("company", 3)],
        intent="geo",
    ),
    # detail
    row(
        "detail: every zone with revenue and rides",
        "table",
        metrics=[REVENUE, RIDES],
        dimensions=[card("zone_id", "identifier", 263)],
        intent="detail",
    ),
    row(
        "detail: six months by four vendors is a pivot",
        "table_pivot",
        metrics=[REVENUE],
        dimensions=[card("month", "time", 6, time_grain="month"), cat("vendor", 4)],
        intent="detail",
    ),
    row(
        "detail: forty days by vendor stays a line",
        "line",
        metrics=[REVENUE],
        dimensions=[card("day", "time", 40, time_grain="day"), cat("vendor", 4)],
        intent="trend",
    ),
    row(
        "detail: five measures per vendor are a table",
        "table",
        metrics=[m(f"m{i}") for i in range(5)],
        dimensions=[cat("vendor", 4)],
    ),
    row(
        "detail: fifty zones by hour is a paged table",
        "table",
        metrics=[RIDES],
        dimensions=[cat("zone", 50), card("hour", "numeric_discrete", 24)],
        intent="compare",
    ),
    row(
        "detail: a single value is not a chart",
        "table",
        metrics=[RIDES],
        dimensions=[cat("vendor", 1)],
    ),
    # calibration (real data, p2b-weight-calibration.md)
    row(
        "composition: an average of an additive column is never a pie",
        "bar",
        metrics=[m("tip", "avg", card=card("tip", "numeric_continuous", 1_960, additive=True))],
        dimensions=[cat("payment", 5)],
        intent="composition",
        semantics={"part_of_whole": True},
    ),
    row(
        "composition: a share by borough and vendor stacks, not a trimmed pie",
        "bar",
        "bar",
        [],
        metrics=[RIDES],
        dimensions=[cat("pickup_borough", 8), cat("vendor", 3)],
        intent="composition",
        semantics={"part_of_whole": True},
    ),
    # asked for by name, or nothing better
    row(
        "requested: a pie of 40 zones ranks first, trimmed",
        "part_of_whole",
        "pie",
        ["top_n_other"],
        metrics=[RIDES],
        dimensions=[cat("zone", 40)],
        intent="compare",
        requested="pie",
    ),
    row(
        "requested: a violin by name is not the box",
        "distribution",
        "violin",
        [],
        dimensions=[DISTANCE, BOROUGH],
        intent="distribution",
        context={"row_count": 100_000},
        requested="violin",
    ),
    row(
        "no other option: four measures over a year stay a line",
        "line",
        "scatter",
        [],
        metrics=[m(f"m{i}") for i in range(4)],
        dimensions=[DAY],
        intent="trend",
    ),
]

WARNINGS = {
    "requested: a pie of 40 zones ranks first, trimmed": "40 zone values exceeds 5",
    "no other option: four measures over a year stay a line": "4 metrics exceeds the 3 scatter",
    "B: twenty companies per day": "20 series exceeds 12; top_n_other brings it to 8",
    "composition: twenty slices with a short tail are five": (
        "20 company values exceeds 5; top_n_other brings it to 5"
    ),
}


@pytest.mark.parametrize("request_, family, trace, transforms", GOLDEN)
def test_golden(request_, family, trace, transforms):
    best = recommend(RecommendRequest(**request_)).recommendations[0]

    assert best.family == family, best.why
    if trace is not None:
        assert best.trace_type == trace
    if transforms is not None:
        assert best.transforms == transforms, best.warnings


@pytest.mark.parametrize("case", WARNINGS)
def test_the_top_says_what_it_costs(case):
    """Out of range, asked for, or cut: the warning carries the trade-off."""
    request_ = next(p.values[0] for p in GOLDEN if p.id == case)
    best = recommend(RecommendRequest(**request_)).recommendations[0]

    assert any(w.startswith(WARNINGS[case]) for w in best.warnings), best.warnings


def test_the_table_is_large_enough_and_covers_every_intent():
    requests = [p.values[0] for p in GOLDEN]
    assert len(GOLDEN) >= 40
    assert {r.get("intent") for r in requests} >= set(Intent.__args__) | {None}
    families = {p.values[1] for p in GOLDEN}
    assert len(families) >= 15


TREND = {
    "metrics": [RIDES],
    "dimensions": [DAY.model_dump(exclude_none=True), cat("company", 20).model_dump()],
    "intent": "trend",
    "context": {"model": "trips"},
}


class TestTheTool:
    def test_it_is_registered_and_passes_the_injection_boundary(self):
        from visivo.agent.tools import SPECIAL_TOOL_NAMES, TOOLS

        assert "recommend_charts" in TOOLS and "recommend_charts" in SPECIAL_TOOL_NAMES
        forbidden = ("commit", "publish", "deploy", "run_", "delete_", "drop_", "execute")
        assert not any(f in "recommend_charts" for f in forbidden)

    def test_a_call_returns_the_compact_ranking(self, integration_app):
        from visivo.agent.tools import call

        result = call(integration_app, "recommend_charts", TREND)
        top = result["recommendations"]
        assert top[0]["family"] == "line" and top[0]["transforms"] == ["top_n_other"]
        assert "${ref(trips).pickup_day}" in top[0]["yaml_skeleton"]
        how = result["transforms"]["top_n_other"]
        assert how.startswith("In the model, replace <dim> with `CASE WHEN") and "#9e9e9e" in how
        assert "unsplit, a bar or funnel draws a null black" in how
        assert result["pairings"]["bar_line_dual_axis"]["kind"] == "overlay"
        assert "funnel: needs `ordered_stages`" in result["rejected"]

    @pytest.mark.parametrize(
        "theme, first",
        [
            ({}, "#0a9396"),
            ({"colorway": ["#123456", "#654321"]}, "#123456"),
            ({"colorway": "High Contrast"}, ColorPalette.PREDEFINED_PALETTES["High Contrast"][0]),
            ({"mode": "dark", "dark": {"colorway": ["#abcdef"]}}, "#abcdef"),
        ],
    )
    def test_named_bars_of_a_cut_take_the_theme_s_first_colour(self, integration_app, theme, first):
        from visivo.agent.tools import call
        from visivo.models.theme import Theme

        integration_app._cached_theme = Theme(**theme) if theme else None
        request = {
            "metrics": [RIDES],
            "dimensions": [cat("company", 32).model_dump()],
            "requested": "bar",
            "context": {"model": "trips"},
        }
        bar = call(integration_app, "recommend_charts", request)["recommendations"][0]
        assert bar["trace_type"] == "bar" and bar["transforms"] == ["top_n_other"]
        assert f"THEN '#9e9e9e' ELSE '{first}' END" in bar["yaml_skeleton"]

    def test_only_the_top_three_carry_skeletons(self, integration_app):
        from visivo.agent.tools import call

        result = call(integration_app, "recommend_charts", {**TREND, "context": {"max_results": 6}})
        top = result["recommendations"]
        assert len(top) == 5 or len(top) == 6
        detail = ("yaml_skeleton", "example_yaml", "table_yaml", "encodings")
        with_detail = [any(key in r for key in detail) for r in top]
        assert with_detail[:3] == [True, True, True] and not any(with_detail[3:])
        assert all(r["why"] for r in top), "every entry explains itself"

    def test_an_example_is_detail_too_and_stops_at_the_top_three(self):
        from visivo.agent.charting.recommend import compact
        from visivo.agent.charting.schema import Recommendation, RecommendResponse

        recs = [
            Recommendation(family=f, score=0, why=["x"], example_yaml="insights: []")
            for f in ("bar", "pie", "line", "heatmap")
        ]
        top = compact(RecommendResponse(recommendations=recs))["recommendations"]
        assert ["example_yaml" in r for r in top] == [True, True, True, False]

    def test_empty_fields_are_left_out(self, integration_app):
        from visivo.agent.tools import call

        result = call(integration_app, "recommend_charts", {"metrics": [RIDES], "intent": "kpi"})
        kpi = result["recommendations"][0]
        assert kpi["family"] == "kpi" and "transforms" not in kpi and "alternatives" not in kpi

    def test_a_bad_request_is_a_readable_refusal(self, integration_app):
        from visivo.agent.tools import ToolError, call

        with pytest.raises(ToolError, match=r"Invalid request: dimensions\.0\.role"):
            call(
                integration_app,
                "recommend_charts",
                {"dimensions": [{"column": "x", "role": "colour", "cardinality": 3}]},
            )
        with pytest.raises(ToolError, match="intent"):
            call(integration_app, "recommend_charts", {"intent": "vibes"})

    def test_a_named_chart_ranks_first_and_an_unknown_one_is_refused(self, integration_app):
        from visivo.agent.tools import ToolError, call

        result = call(integration_app, "recommend_charts", {**TREND, "requested": "heatmap"})
        assert result["recommendations"][0]["family"] == "heatmap"
        with pytest.raises(
            ToolError, match="Invalid request: requested: .*'pizza' is neither a family"
        ):
            call(integration_app, "recommend_charts", {**TREND, "requested": "pizza"})

    def test_it_is_listed_and_callable_over_mcp(self, integration_client):
        import json

        def rpc(method, params=None):
            body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
            response = integration_client.post("/api/mcp/", json=body)
            assert response.status_code == 200
            return json.loads(response.data)["result"]

        listed = {t["name"]: t for t in rpc("tools/list")["tools"]}
        schema = listed["recommend_charts"]["inputSchema"]
        assert {"metrics", "dimensions", "intent", "semantics", "context", "requested"} <= set(
            schema["properties"]
        )
        result = rpc("tools/call", {"name": "recommend_charts", "arguments": TREND})
        assert result["isError"] is False
        assert json.loads(result["content"][0]["text"])["recommendations"][0]["family"] == "line"
