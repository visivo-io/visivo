"""Chart skeletons: each member's example rewritten to the request's model,
metrics and dimensions, and always a valid Insight wrapped in a Chart."""

import pytest
import yaml

from visivo.agent.charting import rules
from visivo.agent.charting.schema import RecommendRequest, ShapeCard
from visivo.agent.charting.skeleton import Repaired, chart_skeleton
from visivo.models.chart import Chart
from visivo.models.insight import Insight


def card(column, role, cardinality, **extra):
    return ShapeCard(column=column, role=role, cardinality=cardinality, **extra)


DAY = card("pickup_day", "time", 365, time_grain="day", time_span_points=365)
MONTH = card("month", "time", 12, time_grain="month", time_span_points=12)
COMPANY = card("company", "categorical", 3)
BOROUGH = card("borough", "categorical", 5)
DISTANCE = card("trip_distance", "numeric_continuous", 48_000)
RIDES = {"name": "rides", "agg": "count"}
REVENUE = {"name": "revenue", "agg": "sum"}


@pytest.fixture(scope="module")
def members():
    return {e.type: e for e in rules.load_traces()}


def build(member, props=None, **request):
    request.setdefault("context", {"model": "trips"})
    text, adapted, _ = chart_skeleton(member, RecommendRequest(**request), props)
    return yaml.safe_load(text), adapted


def insight(skeleton, index=0):
    return skeleton["insights"][index]


class TestTheSwap:
    def test_a_line_gets_the_request_model_metric_axis_and_split(self, members):
        skeleton, adapted = build(members["scatter"], metrics=[RIDES], dimensions=[DAY, COMPANY])

        assert adapted
        line = insight(skeleton)
        assert line["name"] == "rides-by-pickup_day-and-company"
        assert line["props"]["x"] == "?{ DATE_TRUNC('DAY', ${ref(trips).pickup_day}) }"
        assert line["props"]["y"] == "?{ COUNT(*) }"
        assert line["interactions"] == [
            {"split": "?{ ${ref(trips).company} }"},
            {"sort": "?{ DATE_TRUNC('DAY', ${ref(trips).pickup_day}) ASC }"},
        ], "the example's sort survives: that is the gotcha it encodes"

    def test_the_card_grain_replaces_the_example_grain(self, members):
        skeleton, _ = build(members["scatter"], metrics=[REVENUE], dimensions=[MONTH])

        assert insight(skeleton)["props"]["x"] == "?{ DATE_TRUNC('MONTH', ${ref(trips).month}) }"
        assert insight(skeleton)["props"]["y"] == "?{ SUM(${ref(trips).revenue}) }"

    def test_a_split_with_no_series_dimension_is_dropped(self, members):
        skeleton, adapted = build(members["scatter"], metrics=[REVENUE], dimensions=[MONTH])

        assert adapted and [list(i) for i in insight(skeleton)["interactions"]] == [["sort"]]

    def test_a_numeric_axis_loses_the_time_function(self, members):
        days_since = card("days_since_signup", "numeric_discrete", 90)
        skeleton, _ = build(members["scatter"], metrics=[RIDES], dimensions=[days_since])

        assert insight(skeleton)["props"]["x"] == "?{ ${ref(trips).days_since_signup} }"

    def test_columns_go_where_the_example_uses_their_role(self, members):
        """The box example puts the category on x and the clipped number on
        y; the request lists the number first."""
        skeleton, adapted = build(members["box"], dimensions=[DISTANCE, BOROUGH])

        assert adapted
        props = insight(skeleton)["props"]
        assert props["x"] == "?{ ${ref(trips).borough} }"
        assert props["y"] == "?{ ${ref(trips).trip_distance} }", "no p99, so no clip"
        assert "interactions" not in insight(skeleton), "the example's filter is dropped"

    def test_the_measured_column_of_a_rows_type_is_numeric(self, members):
        """A box takes no metric: its required y is the value it measures,
        so the time axis goes to x even though the request lists it first."""
        fare = card("fare", "numeric_continuous", 5_000)
        skeleton, adapted = build(members["box"], dimensions=[MONTH, fare])

        props = insight(skeleton)["props"]
        assert adapted and props["y"] == "?{ ${ref(trips).fare} }"
        assert props["x"] == "?{ ${ref(trips).month} }"

    def test_a_bare_column_takes_the_axis_first(self, members):
        skeleton, _ = build(members["bar"], metrics=[RIDES], dimensions=[BOROUGH, MONTH])

        assert insight(skeleton)["props"]["x"] == "?{ ${ref(trips).month} }"
        assert insight(skeleton)["interactions"][0] == {"split": "?{ ${ref(trips).borough} }"}

    def test_a_clip_uses_the_cards_p99_at_the_columns_precision(self, members):
        stats = {"p99": 18.532200000000003, "min": 0.31, "max": 33.57}
        distance = card("trip_distance", "numeric_continuous", 48_000, stats=stats)
        skeleton, _ = build(members["histogram"], dimensions=[distance])

        assert insight(skeleton)["props"]["x"] == "?{ LEAST(${ref(trips).trip_distance}, 18.53) }"
        assert skeleton["charts"][0]["layout"]["title"]["text"] == (
            "Trip distance (capped at the p99: trip distance 18.53)"
        )

    @pytest.mark.parametrize(
        "stats, cap",
        [
            ({"p99": 18.532200000000003}, "18.53"),
            ({"p99": 1234567.891, "min": 0.000001, "max": 2e6}, "1235000.0"),
            ({"p99": 41.7, "min": 1, "max": 90}, "42"),
        ],
    )
    def test_a_cap_without_a_short_precision_keeps_four_digits(self, members, stats, cap):
        distance = card("trip_distance", "numeric_continuous", 48_000, stats=stats)
        skeleton, _ = build(members["histogram"], dimensions=[distance])

        assert (
            insight(skeleton)["props"]["x"] == f"?{{ LEAST(${{ref(trips).trip_distance}}, {cap}) }}"
        )

    @pytest.mark.parametrize("type_", ["box", "violin"])
    def test_a_box_or_violin_never_clips_its_values(self, members, type_):
        """One global cap moves the quartiles of every long group."""
        stats = {"p99": 18.53, "min": 0.31, "max": 33.57}
        distance = card("trip_distance", "numeric_continuous", 48_000, stats=stats)
        skeleton, adapted = build(members[type_], dimensions=[distance, COMPANY])

        assert adapted and insight(skeleton)["props"]["y"] == "?{ ${ref(trips).trip_distance} }"
        assert "LEAST" not in yaml.safe_dump(skeleton).upper()

    def test_a_raw_value_column_takes_the_metric(self, members):
        step = card("step", "categorical", 6)
        skeleton, adapted = build(
            members["waterfall"], metrics=[{"name": "delta", "agg": "sum"}], dimensions=[step]
        )

        assert adapted
        props = insight(skeleton)["props"]
        assert props["x"] == "?{ ${ref(trips).step} }"
        assert props["y"] == "?{ SUM(${ref(trips).delta}) }"
        assert "measure" not in props, "an optional prop nothing maps to is dropped"

    def test_names_match_before_positions(self, members):
        prices = [{"name": n, "agg": "max"} for n in ("close", "open", "low", "high")]
        skeleton, adapted = build(members["candlestick"], metrics=prices, dimensions=[DAY])

        props = insight(skeleton)["props"]
        assert adapted and props["open"] == "?{ MAX(${ref(trips).open}) }"
        assert props["close"] == "?{ MAX(${ref(trips).close}) }"
        assert skeleton["charts"][0]["layout"]["xaxis"]["rangeslider"] == {"visible": False}

    def test_a_row_past_the_first_needs_an_ordering(self, members):
        alone, _ = build(members["indicator"], metrics=[REVENUE])
        by_month, _ = build(members["indicator"], metrics=[REVENUE], dimensions=[MONTH])

        assert insight(alone)["props"]["value"] == "?{ SUM(${ref(trips).revenue}) }[0]"
        assert "reference" not in insight(alone)["props"]["delta"]
        assert insight(by_month)["props"]["delta"]["reference"] == (
            "?{ SUM(${ref(trips).revenue}) }[1]"
        )

    def test_a_label_beside_a_swapped_value_is_renamed(self, members):
        measures = [{"name": n, "agg": "avg"} for n in ("fare", "miles", "tip_pct")]
        zone = card("zone", "identifier", 263)
        skeleton, adapted = build(
            members["parcoords"], metrics=[*measures, RIDES], dimensions=[zone]
        )

        assert adapted
        labels = [d["label"] for d in insight(skeleton)["props"]["dimensions"]]
        assert labels == ["Fare", "Miles", "Tip pct", "Rides"]

    def test_a_heatmap_puts_one_dimension_on_each_axis(self, members):
        weekday, hour = card("weekday", "categorical", 7), card("hour", "numeric_discrete", 24)
        skeleton, adapted = build(members["heatmap"], metrics=[RIDES], dimensions=[weekday, hour])

        props = insight(skeleton)["props"]
        assert adapted and props["z"] == "?{ COUNT(*) }"
        assert {props["x"], props["y"]} == {
            "?{ ${ref(trips).weekday} }",
            "?{ ${ref(trips).hour} }",
        }

    def test_a_heatmap_over_time_takes_the_card_grain(self, members):
        skeleton, adapted = build(
            members["heatmap"], metrics=[REVENUE], dimensions=[MONTH, COMPANY]
        )

        props = insight(skeleton)["props"]
        assert adapted
        assert props["x"] == "?{ DATE_TRUNC('MONTH', ${ref(trips).month}) }"
        assert props["y"] == "?{ ${ref(trips).company} }"
        assert props["z"] == "?{ SUM(${ref(trips).revenue}) }"


class TestTheFamilyProps:
    def test_xy_draws_markers_and_area_stacks(self, members):
        doc = {f.name: f for f in rules.load_families()}
        xy, _ = build(
            members["scatter"],
            doc["xy"].props,
            metrics=[{"name": "fare", "agg": "avg"}],
            dimensions=[DISTANCE],
        )
        area, _ = build(members["scatter"], doc["area"].props, metrics=[RIDES], dimensions=[DAY])

        assert insight(xy)["props"]["mode"] == "markers"
        assert insight(area)["props"]["stackgroup"] == "one"


class TestOther:
    """A top-N cut draws Other in one neutral colour, last."""

    @pytest.fixture(scope="class")
    def other(self):
        return rules.load_transforms().get("top_n_other").other

    def test_a_split_gets_one_colour_per_trace_and_the_rank_sort_first(self, members, other):
        request = RecommendRequest(
            metrics=[RIDES], dimensions=[DAY, COMPANY], context={"model": "trips"}
        )
        text, adapted, _ = chart_skeleton(members["bar"], request, cuts=["company"], other=other)
        bar = insight(yaml.safe_load(text))

        assert adapted
        assert bar["props"]["marker"]["color"] == (
            "?{ CASE WHEN ${ref(trips).company} = 'Other' THEN '#9e9e9e' END }[0]"
        )
        assert bar["interactions"][0]["split"] == "?{ ${ref(trips).company} }"
        assert bar["interactions"][1] == {"sort": "?{ min(${ref(trips).company_rank}) ASC }"}

    def test_slices_get_a_colour_each_and_the_pie_keeps_its_order(self, members, other):
        request = RecommendRequest(
            metrics=[RIDES], dimensions=[COMPANY], context={"model": "trips"}
        )
        text, *_ = chart_skeleton(members["pie"], request, cuts=["company"], other=other)
        pie = insight(yaml.safe_load(text))

        assert pie["props"]["marker"]["colors"] == (
            "?{ CASE WHEN ${ref(trips).company} = 'Other' THEN '#9e9e9e' END }"
        )
        assert pie["props"]["sort"] is False
        assert pie["interactions"][0] == {"sort": "?{ min(${ref(trips).company_rank}) ASC }"}

    @pytest.mark.parametrize(
        "kind, prop, named",
        [
            ("bar", "color", " ELSE '#123456'"),
            ("funnel", "color", " ELSE '#123456'"),
            ("treemap", "colors", ""),
        ],
    )
    def test_an_unsplit_cut_greys_only_other(self, members, other, kind, prop, named):
        """Measured in the browser: a null in a bar's or funnel's colour array
        draws black, a null in a treemap's falls back to the colorway."""
        request = RecommendRequest(
            metrics=[RIDES],
            dimensions=[card("company", "categorical", 32)],
            context={"model": "trips", "theme_color": "#123456"},
        )
        text, adapted, _ = chart_skeleton(members[kind], request, cuts=["company"], other=other)
        mark = insight(yaml.safe_load(text))

        assert adapted
        assert mark["props"]["marker"][prop] == (
            f"?{{ CASE WHEN ${{ref(trips).company}} = 'Other' THEN '#9e9e9e'{named} END }}"
        )
        assert mark["interactions"][0] == {"sort": "?{ min(${ref(trips).company_rank}) ASC }"}

    def test_a_type_with_no_colour_prop_still_sorts_other_last(self, members, other):
        weekday, zone = card("weekday", "categorical", 7), card("zone", "categorical", 40)
        request = RecommendRequest(
            metrics=[RIDES], dimensions=[weekday, zone], context={"model": "trips"}
        )
        text, *_ = chart_skeleton(members["heatmap"], request, cuts=["zone"], other=other)
        heatmap = insight(yaml.safe_load(text))

        assert "CASE" not in str(heatmap["props"])
        assert heatmap["interactions"][0] == {"sort": "?{ min(${ref(trips).zone_rank}) ASC }"}

    def test_a_cut_column_the_insight_does_not_draw_is_left_alone(self, members, other):
        request = RecommendRequest(
            metrics=[RIDES], dimensions=[BOROUGH], context={"model": "trips"}
        )
        text, *_ = chart_skeleton(members["bar"], request, cuts=["company"], other=other)
        assert "company" not in text


class TestTheFallback:
    def test_a_nested_hierarchy_keeps_the_example_and_says_why(self, members):
        zone = card("zone", "categorical", 12)
        request = RecommendRequest(
            metrics=[REVENUE], dimensions=[BOROUGH, zone], context={"model": "trips"}
        )
        text, adapted, reason = chart_skeleton(members["treemap"], request)
        skeleton = yaml.safe_load(text)

        assert not adapted and skeleton["models"][0]["name"] == "revenue_nodes"
        assert insight(skeleton)["name"] == "revenue-by-borough-and-zone"
        assert reason.startswith("the example builds its own nodes model")

    def test_one_level_of_a_hierarchy_needs_no_nodes_model(self, members):
        skeleton, adapted = build(members["treemap"], metrics=[REVENUE], dimensions=[BOROUGH])

        assert adapted and "models" not in skeleton
        assert insight(skeleton)["props"] == {
            "type": "treemap",
            "branchvalues": "total",
            "labels": "?{ ${ref(trips).borough} }",
            "parents": "?{ '' }",
            "values": "?{ SUM(${ref(trips).revenue}) }",
        }

    def test_a_request_column_with_no_place_keeps_the_example(self, members):
        """The pie example has one label column."""
        skeleton, adapted = build(members["pie"], metrics=[RIDES], dimensions=[BOROUGH, COMPANY])

        assert not adapted
        assert insight(skeleton)["props"]["labels"] == "?{ ${ref(trips).payment_type} }"

    def test_a_required_prop_nothing_maps_to_keeps_the_example(self, members):
        skeleton, adapted = build(members["candlestick"], metrics=[RIDES], dimensions=[DAY])

        assert not adapted


class TestEverySkeletonIsValid:
    @pytest.mark.parametrize("entry", rules.load_traces(), ids=lambda e: e.type)
    def test_every_member_yields_an_insight_and_a_chart(self, entry):
        if entry.type == "table":
            pytest.skip("tables have table_yaml")
        text, *_ = chart_skeleton(
            entry, RecommendRequest(metrics=[RIDES], dimensions=[BOROUGH, COMPANY])
        )
        skeleton = yaml.safe_load(text)
        insights = [Insight(**i) for i in skeleton["insights"]]
        chart = Chart(**skeleton["charts"][0])
        assert insights and len(chart.insights) == len(insights)
        assert all(i.name.startswith("rides-by-borough") for i in insights)


class TestTheEdges:
    def test_it_writes_under_the_project_parsers_yaml_loader(self, members):
        """The server parses the project first, which makes SafeLoader build
        YamlOrderedDict; safe_dump refuses those."""
        from visivo.parsers.yaml_ordered_dict import setup_yaml_ordered_dict

        setup_yaml_ordered_dict()
        skeleton, adapted = build(members["bar"], metrics=[RIDES], dimensions=[BOROUGH])
        zone = card("zone", "categorical", 12)
        fallback, unadapted = build(members["treemap"], metrics=[RIDES], dimensions=[BOROUGH, zone])
        assert adapted and not unadapted
        assert insight(skeleton)["name"] == "rides-by-borough" and fallback["models"]

    def test_each_aggregation_has_its_sql(self, members):
        def y(agg):
            skeleton, _ = build(
                members["bar"], metrics=[{"name": "riders", "agg": agg}], dimensions=[BOROUGH]
            )
            return insight(skeleton)["props"]["y"]

        assert y("count_distinct") == "?{ COUNT(DISTINCT ${ref(trips).riders}) }"
        assert y("rate") == "?{ AVG(${ref(trips).riders}) }"
        assert y("median") == "?{ MEDIAN(${ref(trips).riders}) }"

    def test_a_column_under_a_cast_under_a_time_function_is_a_time_column(self):
        import sqlglot

        from visivo.agent.charting.skeleton import _placeholders, _slot_kind

        tree = sqlglot.parse_one("date_trunc('day', CAST(__ref_0__ AS DATE))", read="duckdb")
        assert _slot_kind(_placeholders(tree)[0]) == "time"

    def test_sql_that_does_not_parse_keeps_the_example(self, members):
        broken = members["bar"].model_copy(
            update={
                "example": members["bar"].example.replace(
                    "text: ?{ count(*) }", "text: ?{ count(( }"
                )
            }
        )
        skeleton, adapted = build(broken, metrics=[RIDES], dimensions=[BOROUGH])
        assert not adapted and insight(skeleton)["name"] == "rides-by-borough"


def recommended(family, metrics=(), dimensions=(), **request):
    """What ``recommend`` draws for one family (its best member, after the
    repairs), or ``None`` when the family rejects the request."""
    from visivo.agent.charting.recommend import _doc, recommend

    rule = next(f for f in _doc().families if f.name == family)
    request = RecommendRequest(
        metrics=list(metrics), dimensions=list(dimensions), context={"model": "m"}, **request
    )
    response = recommend(request, rules=[rule])
    return (response.recommendations or [None])[0], request


def read_columns(text):
    """Every ``${ref(model).column}`` a skeleton reads (not the chart's
    refs to its insights), by the project's own ref parser."""
    from visivo.query.patterns import replace_refs

    found = set()
    replace_refs(text, lambda model, column: found.add((model, column)) if column else "")
    return found


def m(name, agg="sum"):
    return {"name": name, "agg": agg}


WEEKDAY = card("weekday", "categorical", 7)
ZONE_20 = card("zone", "categorical", 20)
ZONE_60 = card("zone", "categorical", 60)
STAGE = card("stage", "categorical", 5, ordered=True)
STEP = card("step", "categorical", 6)
TICKER = card("ticker", "categorical", 3)
STATE = card("state", "geo_region", 50, geo_kind="us_state")
LAT, LON = card("lat", "geo_point", 3_000), card("lon", "geo_point", 3_000)
FARE = card("fare", "numeric_continuous", 3_000, stats={"p99": 80.12, "min": 2.5, "max": 150.0})
HOUR = card("hour", "numeric_discrete", 24)
OHLC = [m(n, "max") for n in ("open", "high", "low", "close")]
MEASURES = [m(n, "avg") for n in ("fare", "miles", "tip")]

# (family, metrics, dimensions, semantics): a request each family admits,
# with one dimension and with two, wherever the family takes that many.
ADMITTED = [
    ("kpi", [REVENUE], [MONTH], {}),
    ("line", [RIDES], [DAY], {}),
    ("line", [RIDES], [DAY, COMPANY], {}),
    ("area", [RIDES], [DAY], {"part_of_whole": True}),
    ("area", [RIDES], [DAY, COMPANY], {"part_of_whole": True}),
    ("xy", [m("fare", "avg")], [DISTANCE], {}),
    ("xy", [m("fare", "avg")], [DISTANCE, COMPANY], {}),
    ("bar", [RIDES], [COMPANY], {}),
    ("bar", [RIDES], [BOROUGH, COMPANY], {}),
    ("heatmap", [RIDES], [WEEKDAY, ZONE_20], {}),
    ("distribution", [], [DISTANCE], {}),
    ("distribution", [], [DISTANCE, BOROUGH], {}),
    ("density2d", [], [DISTANCE, FARE], {}),
    ("part_of_whole", [RIDES], [COMPANY], {"part_of_whole": True}),
    ("hierarchy", [RIDES], [COMPANY], {}),
    ("flow", [], [BOROUGH, COMPANY], {"part_of_whole": True}),
    ("funnel", [RIDES], [STAGE], {"ordered_stages": True}),
    ("funnel", [RIDES], [STAGE, COMPANY], {"ordered_stages": True}),
    ("waterfall", [REVENUE], [STEP], {"signed_contributions": True}),
    # the second dimension a waterfall takes is its relative/total column
    (
        "waterfall",
        [REVENUE],
        [STEP, card("measure", "categorical", 2)],
        {"signed_contributions": True},
    ),
    ("geo_region", [RIDES], [STATE], {}),
    ("geo_region", [RIDES], [STATE, MONTH], {}),
    ("geo_point", [RIDES], [LAT, LON], {}),
    ("geo_point", [RIDES], [LON, LAT], {}),
    ("geo_density", [], [LAT, LON], {}),
    ("financial", OHLC, [DAY], {}),
    ("financial", OHLC, [DAY, TICKER], {}),
    ("multivariate", MEASURES, [ZONE_60], {}),
    ("multivariate", MEASURES, [ZONE_60, BOROUGH], {}),
    ("polar", [RIDES], [WEEKDAY], {}),
    ("polar", [RIDES], [WEEKDAY, COMPANY], {}),
    ("ternary_smith", [m("card"), m("cash"), m("other")], [ZONE_20], {}),
    ("ternary_smith", [m("card"), m("cash"), m("other")], [ZONE_20, BOROUGH], {}),
    ("three_d", MEASURES, [ZONE_20], {}),
    ("three_d", MEASURES, [ZONE_20, COMPANY], {}),
]

# Requests a family admits that no skeleton can draw from the request alone.
UNRUNNABLE = [
    # a KPI over two dimensions is out of range, and nothing in its repairs folds one
    ("kpi", [REVENUE], [MONTH, COMPANY], {}, "a request column has no place"),
    ("part_of_whole", [RIDES], [BOROUGH, COMPANY], {}, "a request column has no place"),
    # nesting needs a nodes model over the table behind the model
    ("hierarchy", [RIDES], [BOROUGH, ZONE_20], {"hierarchy": True}, "builds its own nodes"),
    # a carpet reads a grid model and a points model
    ("carpet", MEASURES, [COMPANY, BOROUGH], {}, "reads two models"),
]


class TestEveryFamily:
    """Every family's skeleton is built from the request's own columns for
    a one- and a two-dimension request it admits; where it cannot be, the
    example is never offered as the skeleton."""

    @pytest.mark.parametrize(
        "family, metrics, dimensions, semantics",
        ADMITTED,
        ids=[f"{c[0]}-{len(c[2])}" for c in ADMITTED],
    )
    def test_the_skeleton_reads_only_the_request(self, family, metrics, dimensions, semantics):
        result, request = recommended(family, metrics, dimensions, semantics=semantics)

        assert result is not None, f"{family} should admit this request"
        assert result.example_yaml is None and result.yaml_skeleton, result.warnings
        named = {d.column for d in request.dimensions} | {x.name for x in request.metrics}
        cut = {f"{c}_rank" for c in named}
        columns = read_columns(result.yaml_skeleton)
        assert columns and {model for model, _ in columns} == {"m"}
        assert {c for _, c in columns} <= named | cut

    def test_the_table_covers_every_chart_family(self):
        from visivo.agent.charting.recommend import _doc

        charts = {f.name for f in _doc().families if f.skeleton == "chart"}
        assert charts - {"image"} <= {c[0] for c in ADMITTED} | {c[0] for c in UNRUNNABLE}

    @pytest.mark.parametrize(
        "family, metrics, dimensions, semantics, reason",
        UNRUNNABLE,
        ids=[f"{c[0]}-{len(c[2])}" for c in UNRUNNABLE],
    )
    def test_an_example_that_cannot_carry_it_is_only_a_pattern(
        self, family, metrics, dimensions, semantics, reason
    ):
        result, _ = recommended(family, metrics, dimensions, semantics=semantics)

        assert result is not None and result.yaml_skeleton is None and result.example_yaml
        assert reason in result.warnings[-1] and "not a chart to paste" in result.warnings[-1]

    def test_a_ref_the_rewrite_does_not_reach_is_caught(self, members):
        """The last guard: a ref outside any ``?{ }`` is never rewritten, so
        the skeleton would read the example's model."""
        planted = members["bar"].model_copy(
            update={
                "example": members["bar"].example.replace(
                    "type: bar", "type: bar\n      customdata: '${ref(trips).zone}'"
                )
            }
        )
        text, adapted, reason = chart_skeleton(
            planted, RecommendRequest(metrics=[RIDES], dimensions=[BOROUGH])
        )
        assert not adapted and reason == "it would read trips.zone, which the request lacks"


class TestTheRequiredSlotsComeFirst:
    def test_a_name_match_never_starves_a_required_slot(self, members):
        """The bar example splits on `company`; a request whose only
        dimension is `company` draws it on x, with no split."""
        skeleton, adapted = build(members["bar"], metrics=[RIDES], dimensions=[COMPANY])

        assert adapted
        assert insight(skeleton)["props"]["x"] == "?{ ${ref(trips).company} }"
        assert insight(skeleton)["interactions"] == [{"sort": "?{ COUNT(*) DESC }"}]

    def test_a_dimension_a_repair_turned_into_an_input_is_not_drawn(self):
        result, _ = recommended("geo_region", [RIDES], [STATE, MONTH])

        assert result.transforms == ["dominant_category"]
        assert "locations: ?{ ${ref(m).state} }" in result.yaml_skeleton
        assert "month" not in result.yaml_skeleton

    def test_a_second_dimension_with_no_slot_becomes_the_split(self, members):
        skeleton, adapted = build(members["funnel"], metrics=[RIDES], dimensions=[STAGE, COMPANY])

        assert adapted and insight(skeleton)["interactions"][0] == {
            "split": "?{ ${ref(trips).company} }"
        }

    def test_a_dimension_the_type_draws_as_points_labels_them(self, members):
        skeleton, adapted = build(members["scatter3d"], metrics=MEASURES, dimensions=[ZONE_20])

        assert adapted and insight(skeleton)["props"]["text"] == "?{ ${ref(trips).zone} }"
        assert "interactions" not in insight(skeleton)

    def test_coordinates_are_matched_by_name_in_any_order(self, members):
        """Over raw columns (a density map rounds them) and under an
        aggregate (the scatter map example draws zone centroids)."""
        density, adapted = build(members["densitymap"], dimensions=[LON, LAT])
        points, also = build(members["scattermap"], metrics=[RIDES], dimensions=[LON, LAT])

        assert adapted and also
        assert insight(density)["props"]["lat"] == "?{ ROUND(${ref(trips).lat}, 2) }"
        assert insight(density)["props"]["lon"] == "?{ ROUND(${ref(trips).lon}, 2) }"
        props = insight(points)["props"]
        assert props["lat"] == "?{ ${ref(trips).lat} }"
        assert props["lon"] == "?{ ${ref(trips).lon} }"
        assert props["marker"]["size"] == "?{ SQRT(COUNT(*)) }"

    def test_the_series_dimension_is_only_ever_a_split(self):
        """The scatter map example labels points with a zone before it
        splits; the operator the recommender counts as series is the split."""
        operator = card("operator", "categorical", 3)
        result, _ = recommended("geo_point", [RIDES], [LAT, LON, operator])
        skeleton = yaml.safe_load(result.yaml_skeleton)

        assert "text" not in skeleton["insights"][0]["props"]
        assert skeleton["insights"][0]["interactions"] == [{"split": "?{ ${ref(m).operator} }"}]

    def test_a_list_entry_nothing_maps_to_is_dropped(self, members):
        skeleton, adapted = build(members["parcats"], dimensions=[BOROUGH, COMPANY])

        labels = [d["label"] for d in insight(skeleton)["props"]["dimensions"]]
        assert adapted and labels == ["Borough", "Company"]
        assert insight(skeleton)["props"]["counts"] == "?{ CAST(COUNT(*) AS DOUBLE) }"


class TestBarLabels:
    """Value labels only up to the bar entry's ``text_labels.max_marks``."""

    @pytest.fixture(scope="class")
    def most(self, members):
        return members["bar"].text_labels.max_marks

    def test_labels_stay_while_every_bar_can_carry_one(self, members, most):
        companies = card("company", "categorical", most)
        request = RecommendRequest(metrics=[RIDES], dimensions=[companies])
        repaired = Repaired(counts={"company": most})
        text, *_ = chart_skeleton(members["bar"], request, repaired=repaired)

        assert yaml.safe_load(text)["insights"][0]["props"]["text"] == "?{ COUNT(*) }"

    def test_past_it_the_labels_go(self, members, most):
        request = RecommendRequest(metrics=[RIDES], dimensions=[BOROUGH, COMPANY])
        counts = {"borough": 5, "company": most // 5 + 1}
        text, *_ = chart_skeleton(members["bar"], request, repaired=Repaired(counts=counts))

        assert "text" not in yaml.safe_load(text)["insights"][0]["props"]

    def test_the_counts_are_the_ones_after_the_repairs(self, most):
        """5 boroughs by 20 companies cut to 8 is 40 bars, too many to label;
        more companies than fit, cut to the limit, keep theirs."""
        grouped, _ = recommended("bar", [RIDES], [BOROUGH, card("company", "categorical", 20)])
        ranked, _ = recommended("bar", [RIDES], [card("company", "categorical", most + 5)])

        assert grouped.transforms == ranked.transforms == ["top_n_other"]
        assert "text" not in yaml.safe_load(grouped.yaml_skeleton)["insights"][0]["props"]
        assert "text" in yaml.safe_load(ranked.yaml_skeleton)["insights"][0]["props"]


class TestHeatmapAxes:
    """Categories ordered by the metric's total, time chronological."""

    def test_two_categorical_axes_order_by_their_totals(self):
        result, _ = recommended("heatmap", [RIDES], [WEEKDAY, ZONE_20])
        skeleton = yaml.safe_load(result.yaml_skeleton)

        assert "interactions" not in skeleton["insights"][0]
        layout = skeleton["charts"][0]["layout"]
        assert layout["xaxis"] == {"categoryorder": "total descending"}
        assert layout["yaxis"] == {"categoryorder": "total ascending"}

    def test_a_time_axis_stays_chronological(self):
        result, _ = recommended("heatmap", [RIDES], [MONTH, ZONE_20])
        skeleton = yaml.safe_load(result.yaml_skeleton)
        heatmap = skeleton["insights"][0]

        assert heatmap["props"]["x"] == "?{ DATE_TRUNC('MONTH', ${ref(m).month}) }"
        assert heatmap["interactions"] == [
            {"sort": "?{ DATE_TRUNC('MONTH', ${ref(m).month}) ASC }"}
        ]
        assert skeleton["charts"][0]["layout"]["yaxis"] == {"categoryorder": "total ascending"}
        assert "xaxis" not in skeleton["charts"][0]["layout"]

    def test_a_cut_axis_keeps_its_rank_so_other_stays_last(self):
        result, _ = recommended("heatmap", [RIDES], [WEEKDAY, ZONE_60])
        skeleton = yaml.safe_load(result.yaml_skeleton)

        heatmap = skeleton["insights"][0]
        assert result.transforms == ["top_n_other"]
        assert heatmap["interactions"] == [{"sort": "?{ min(${ref(m).zone_rank}) ASC }"}]
        cut = next(p for p in ("x", "y") if heatmap["props"][p] == "?{ ${ref(m).zone} }")
        layout = skeleton["charts"][0]["layout"]
        assert f"{cut}axis" not in layout and len(layout) == 2, "the weekday axis and the title"


class TestNames:
    def test_two_recommendations_for_one_request_never_share_a_name(self):
        from visivo.agent.charting.recommend import recommend

        request = RecommendRequest(
            metrics=[RIDES],
            dimensions=[BOROUGH, card("company", "categorical", 20)],
            intent="compare",
            context={"model": "m", "max_results": 25},
        )
        skeletons = [
            yaml.safe_load(r.yaml_skeleton)
            for r in recommend(request).recommendations
            if r.yaml_skeleton
        ]
        names = [i["name"] for s in skeletons for i in s["insights"]]
        names += [s["charts"][0]["name"] for s in skeletons]
        assert len(skeletons) >= 2 and len(names) == len(set(names))
        assert "rides-by-borough-and-company-heatmap" in names
        assert "rides-by-borough-and-company-bar" in names
        titles = {s["charts"][0]["layout"]["title"]["text"] for s in skeletons}
        assert titles == {"Rides by borough and company"}

    def test_a_shared_trace_type_is_named_by_its_family(self):
        line, _ = recommended("line", [RIDES], [DAY])
        xy, _ = recommended("xy", [m("fare", "avg")], [DISTANCE])

        assert "name: rides-by-pickup_day-line\n" in line.yaml_skeleton
        assert "name: fare-by-trip_distance-xy\n" in xy.yaml_skeleton

    def test_a_rows_chart_is_named_after_what_it_measures(self, members):
        skeleton, _ = build(members["box"], dimensions=[DISTANCE, COMPANY])

        assert insight(skeleton)["name"] == "trip_distance-by-company"
        assert skeleton["charts"][0]["layout"]["title"] == {"text": "Trip distance by company"}

    def test_three_dimensions_read_as_a_list(self, members):
        skeleton, _ = build(
            members["parcats"], dimensions=[BOROUGH, COMPANY, card("payment", "categorical", 4)]
        )

        assert insight(skeleton)["name"] == "rows-by-borough-company-and-payment"
        title = skeleton["charts"][0]["layout"]["title"]["text"]
        assert title == "Rows by borough, company and payment"
