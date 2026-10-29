"""The recommender, stage by stage, on the NYC-taxi cases of
specs/chart-selection/01-rule-format.md."""

import pytest
import yaml

from visivo.agent.charting import rules
from visivo.agent.charting.recommend import recommend
from visivo.agent.charting.schema import RecommendRequest, ShapeCard
from visivo.models.table import RowsPerPageEnum


def card(column, role, cardinality, **extra):
    return ShapeCard(column=column, role=role, cardinality=cardinality, **extra)


BOROUGH = card("pickup_borough", "categorical", 5)
COMPANY_3 = card("company", "categorical", 3)
COMPANY_10 = card("company", "categorical", 10)
COMPANY_20 = card("company", "categorical", 20)
DAY = card("pickup_day", "time", 365, time_grain="day", time_span_points=365)
DISTANCE = card("trip_distance", "numeric_continuous", 48_000)
ZONE = card("zone_id", "identifier", 263)
RIDES = {"name": "rides", "agg": "count"}


def top(request):
    return recommend(request).recommendations[0]


ALL = {"max_results": 25}


class TestTheRuleFileLoads:
    def test_every_when_clause_is_in_the_vocabulary(self):
        """A typo in a `when` would otherwise never fire, silently."""
        from visivo.agent.charting.recommend import check_vocabulary
        from visivo.agent.charting.schema import ScoreAdjustment

        check_vocabulary(rules.load_families())
        bad = rules.load_families()[0].model_copy(
            update={
                "score": [
                    ScoreAdjustment(when="intent == kpi and the moon is full", delta=1, reason="r")
                ]
            }
        )
        with pytest.raises(ValueError, match="unknown `when`"):
            check_vocabulary([bad])
        with pytest.raises(ValueError, match="unknown `when`"):
            recommend(RecommendRequest(metrics=[RIDES]), rules=[bad])

    def test_a_requires_clause_is_checked_too(self):
        from visivo.agent.charting.recommend import check_vocabulary
        from visivo.agent.charting.schema import HardGates

        bad = rules.load_families()[0].model_copy(
            update={"hard_gates": HardGates(requires=["the moon is full"])}
        )
        with pytest.raises(ValueError, match="the moon is full"):
            check_vocabulary([bad])


class TestGoldenA_BoroughByCompany:
    """Two small categoricals, no time: a bar carries both; a line cannot."""

    def test_bar_wins(self):
        request = RecommendRequest(
            metrics=[RIDES], dimensions=[BOROUGH, COMPANY_3], intent="compare"
        )

        best = top(request)
        assert best.family == "bar" and best.trace_type == "bar"
        assert "a second dimension of 2–7 values" in best.encodings, "the entry's variations"

    def test_line_is_rejected_for_want_of_an_ordered_axis(self):
        response = recommend(RecommendRequest(metrics=[RIDES], dimensions=[BOROUGH, COMPANY_3]))

        assert any(r.family == "line" and "ordered axis" in r.reason for r in response.rejected)

    def test_a_type_that_takes_no_metrics_is_rejected_for_one(self):
        """`max: 0` is structural (the type draws rows), not a range."""
        response = recommend(RecommendRequest(metrics=[RIDES], dimensions=[BOROUGH]))

        assert any(
            r.family == "distribution" and r.reason.startswith("histogram takes no metrics")
            for r in response.rejected
        )


class TestGoldenB_RidesPerDayByCompany:
    """A time axis plus a categorical: a line at cardinality 3, a repaired
    line at cardinality 20."""

    def test_three_companies_is_a_plain_line(self):
        best = top(RecommendRequest(metrics=[RIDES], dimensions=[DAY, COMPANY_3], intent="trend"))

        assert best.family == "line" and best.trace_type == "scatter" and best.transforms == []
        assert "indicator_overlay" in best.pairings
        assert "few enough series to follow" in best.why

    def test_ten_companies_stay_one_line_chart(self):
        """Measured: lines stay traceable to 12 series once the colorway has enough colours."""
        best = top(RecommendRequest(metrics=[RIDES], dimensions=[DAY, COMPANY_10], intent="trend"))

        assert best.family == "line" and best.transforms == []

    def test_twenty_companies_is_repaired_first(self):
        response = recommend(
            RecommendRequest(metrics=[RIDES], dimensions=[DAY, COMPANY_20], intent="trend")
        )

        best = response.recommendations[0]
        assert best.family == "line" and best.transforms == ["top_n_other"]
        assert response.transforms_suggested[0] == "top_n_other"
        assert "20 series exceeds 12; top_n_other brings it to 8" in best.warnings

    def test_a_year_of_days_ranks_the_line_above_the_bar(self):
        """Bars are admitted on a time axis but penalised at this many
        periods, so the line wins without any intent being stated."""
        response = recommend(RecommendRequest(metrics=[RIDES], dimensions=[DAY, COMPANY_3]))

        families = [r.family for r in response.recommendations]
        assert families.index("line") < families.index("bar")
        bar = next(r for r in response.recommendations if r.family == "bar")
        assert bar.transforms == ["regrain"] and "after regrain" in bar.why
        assert "365 pickup_day values exceeds 20; regrain brings it to 13" in bar.warnings

    def test_too_few_points_is_not_a_trend(self):
        two_days = card("pickup_day", "time", 2, time_span_points=2)
        response = recommend(RecommendRequest(metrics=[RIDES], dimensions=[two_days]))

        assert any(r.family == "line" and "axis points" in r.reason for r in response.rejected)


class TestGoldenC_TripDistance:
    """One numeric column and a distribution intent: the distribution family,
    drawn as a histogram alone or with a few overlaid groups, and as a box
    once the groups pass what overlaid histograms carry."""

    def test_histogram_wins(self):
        best = top(RecommendRequest(dimensions=[DISTANCE], intent="distribution"))

        assert (best.family, best.trace_type) == ("distribution", "histogram")
        assert any("Pre-bucket" in w for w in best.warnings)

    def test_without_an_intent_the_histogram_still_ranks(self):
        """Intent is a preference, not a gate: the agent often omits it."""
        assert top(RecommendRequest(dimensions=[DISTANCE])).trace_type == "histogram"

    def test_a_small_split_overlays_the_histogram(self):
        best = top(RecommendRequest(dimensions=[DISTANCE, COMPANY_3], intent="distribution"))

        assert best.trace_type == "histogram" and best.transforms == []
        assert "3 series is readable but above the ideal of 2" in best.warnings

    def test_five_groups_are_a_box_not_a_repaired_histogram(self):
        """Measured: a fourth overlaid colour already muddies the bins, and a
        box per group carries five without a repair."""
        best = top(RecommendRequest(dimensions=[DISTANCE, BOROUGH], intent="distribution"))

        assert (best.family, best.trace_type, best.transforms) == ("distribution", "box", [])

    def test_a_large_split_is_every_group_as_a_box(self):
        """The histogram's repairs name the box first; the box puts all twenty on x."""
        response = recommend(
            RecommendRequest(dimensions=[DISTANCE, COMPANY_20], intent="distribution")
        )

        best = response.recommendations[0]
        assert (best.trace_type, best.transforms) == ("box", [])

    def test_past_the_box_limit_an_input_filter_never_a_top_n(self):
        best = top(
            RecommendRequest(
                dimensions=[DISTANCE, card("company", "categorical", 25)], intent="distribution"
            )
        )

        assert (best.trace_type, best.transforms) == ("box", ["input_filter"])


class TestTheObviousEdges:
    def test_one_metric_and_nothing_else_is_a_kpi(self):
        best = top(RecommendRequest(metrics=[RIDES], intent="kpi"))

        assert best.family == "kpi" and best.layout.row_role == "kpi"

    def test_an_identifier_dimension_is_a_table_never_a_chart(self):
        response = recommend(RecommendRequest(metrics=[RIDES], dimensions=[ZONE], intent="rank"))

        assert response.recommendations[0].family == "table"
        assert "bar" not in {r.family for r in response.recommendations} or (
            response.recommendations[0].score
            > next(r.score for r in response.recommendations if r.family == "bar")
        )

    def test_max_results_is_honoured(self):
        request = RecommendRequest(
            metrics=[RIDES], dimensions=[BOROUGH], context={"max_results": 1}
        )

        assert len(recommend(request).recommendations) == 1

    def test_a_plain_dict_request_is_accepted(self):
        response = recommend({"metrics": [RIDES], "intent": "kpi"})

        assert response.recommendations[0].family == "kpi"

    def test_a_range_nothing_repairs_ranks_lower_and_warns_but_is_never_rejected(self):
        strict = [
            r.model_copy(
                update={
                    "members": [
                        m.model_copy(update={"limits": m.limits.model_copy(update={"repair": []})})
                        for m in r.members
                    ]
                }
            )
            for r in rules.load_families()
        ]
        request = RecommendRequest(metrics=[RIDES], dimensions=[DAY, COMPANY_20], context=ALL)
        repaired = rec(recommend(request), "line")
        unrepaired = rec(recommend(request, rules=strict), "line")

        assert unrepaired.transforms == [] and unrepaired.score < repaired.score
        assert "20 series exceeds the 12 scatter stays readable with" in unrepaired.warnings[0]
        assert "nothing in its repair list fixes it" in unrepaired.warnings[0]


class TestHighCardinalityMeansLookup:
    """A daily axis has 365 values and a measure has thousands; neither is a
    reason to reach for a table. A 263-zone categorical is."""

    def test_a_long_time_axis_does_not_trigger_the_table(self):
        best = top(RecommendRequest(metrics=[RIDES], dimensions=[DAY], intent="trend"))

        assert best.family == "line"

    def test_a_high_cardinality_categorical_does(self):
        zones = card("zone_name", "categorical", 263)
        best = top(RecommendRequest(metrics=[RIDES], dimensions=[zones], intent="rank"))

        assert best.family == "table"


class TestAnOrderedAxisIsNotOnlyTime:
    """Jared's review of #727: 'days since x event' and other sequential,
    non-timestamp dimensions are line axes too."""

    def test_days_since_signup_is_a_line_axis(self):
        days_since = card("days_since_signup", "numeric_discrete", 90)
        best = top(RecommendRequest(metrics=[RIDES], dimensions=[days_since], intent="trend"))

        assert best.family == "line"

    def test_a_categorical_marked_ordered_is_too(self):
        sizes = card("shirt_size", "categorical", 5, ordered=True)
        response = recommend(RecommendRequest(metrics=[RIDES], dimensions=[sizes], intent="trend"))

        assert "line" in {r.family for r in response.recommendations}

    def test_an_unmarked_categorical_is_not(self):
        response = recommend(
            RecommendRequest(metrics=[RIDES], dimensions=[BOROUGH], intent="trend")
        )

        assert any(r.family == "line" and "ordered axis" in r.reason for r in response.rejected)

    def test_time_is_preferred_as_the_axis_when_both_are_present(self):
        """Rides per day split by passenger count: the day is the axis and
        passenger count becomes the series, not the other way round."""
        passengers = card("passenger_count", "numeric_discrete", 6)
        best = top(RecommendRequest(metrics=[RIDES], dimensions=[passengers, DAY], intent="trend"))

        assert best.family == "line" and best.transforms == []
        assert "a time axis is a line's home" in best.why


class TestBarsAreNotOnlyForCategories:
    def test_hour_of_day_is_a_bar_axis(self):
        hour = card("pickup_hour", "numeric_discrete", 24)
        best = top(RecommendRequest(metrics=[RIDES], dimensions=[hour], intent="compare"))

        assert best.family == "bar"

    def test_twelve_months_may_be_columns(self):
        months = card("pickup_month", "time", 12, time_grain="month", time_span_points=12)
        best = top(RecommendRequest(metrics=[RIDES], dimensions=[months], intent="compare"))

        assert best.family == "bar"
        assert not any("too many periods" in w for w in best.why)


class TestAnIndicatorMayCarryATimeReference:
    def test_a_metric_over_time_can_still_be_a_kpi(self):
        response = recommend(RecommendRequest(metrics=[RIDES], dimensions=[DAY], intent="kpi"))

        assert response.recommendations[0].family == "kpi"
        assert (
            "the KPI is compared with the previous period" in response.recommendations[0].encodings
        )

    def test_but_not_over_a_category(self):
        response = recommend(RecommendRequest(metrics=[RIDES], dimensions=[BOROUGH], intent="kpi"))

        assert any(
            r.family == "kpi" and r.reason == "pickup_borough is categorical; indicator takes time"
            for r in response.rejected
        )


class TestIntentIsAPreference:
    def test_an_intent_outside_a_gated_list_still_rejects(self):
        """The mechanism stays for families that are genuinely intent-bound;
        it just never fires when the intent is unset."""
        gated = [
            r.model_copy(
                update={"hard_gates": r.hard_gates.model_copy(update={"intents": ["flow"]})}
            )
            for r in rules.load_families()
            if r.name == "bar"
        ]
        with_intent = recommend(
            RecommendRequest(metrics=[RIDES], dimensions=[BOROUGH], intent="compare"), rules=gated
        )
        without = recommend(RecommendRequest(metrics=[RIDES], dimensions=[BOROUGH]), rules=gated)

        assert with_intent.rejected and "intents" in with_intent.rejected[0].reason
        assert without.recommendations[0].family == "bar"


class TestEveryTraceTypeHasAHome:
    def test_every_prop_type_is_claimed_by_exactly_one_family(self):
        """scatter is a line, an area or an xy chart depending on `mode` and
        `fill`, and scattergl a line or xy; every other type has one home."""
        from visivo.models.props.types import PropType

        claimed = [t for r in rules.load_families() for t in r.trace_types]

        assert sorted(set(claimed)) == sorted(p.value for p in PropType)
        assert claimed.count("scatter") == 3 and claimed.count("scattergl") == 2
        assert all(claimed.count(t) == 1 for t in set(claimed) - {"scatter", "scattergl"})


def metric(name, agg="sum", unit=None):
    return {"name": name, "agg": agg, "unit": unit}


def families(response):
    return [r.family for r in response.recommendations]


def rec(response, family):
    return next(r for r in response.recommendations if r.family == family)


class TestGoldenTables:
    """P2f (VIS-1446): the ten table/pivot cases from
    specs/chart-selection/06-tables.md §6, plus the boundaries."""

    def test_260_zones_by_revenue_is_a_table_not_a_bar(self):
        response = recommend(
            RecommendRequest(
                metrics=[metric("revenue")],
                dimensions=[card("zone_name", "categorical", 263)],
                intent="rank",
            )
        )
        assert families(response)[0] == "table"
        bar = rec(response, "bar")
        assert bar.score < 0 and "looking up" in " ".join(bar.why)
        assert rec(response, "table").trace_type is None, "a Visivo table is not a trace"
        assert "detail_table_below" in bar.pairings

    def test_a_table_skeleton_aliases_every_column_and_pages_for_its_rows(self):
        from visivo.models.table import Table

        response = recommend(
            RecommendRequest(
                metrics=[metric("revenue"), metric("rides", "count")],
                dimensions=[card("zone_name", "categorical", 263)],
                intent="detail",
                context={"model": "zone_revenue"},
            )
        )
        table = rec(response, "table")
        spec = yaml.safe_load(table.table_yaml)["tables"][0]
        assert spec["columns"] == [
            '${ref(zone_revenue).zone_name} as "Zone Name"',
            '${ref(zone_revenue).revenue} as "Revenue"',
            '${ref(zone_revenue).rides} as "Rides"',
        ]
        assert spec["rows_per_page"] == 50
        Table(**spec)

    def test_a_small_lookup_table_has_no_pager(self):
        response = recommend(
            RecommendRequest(
                metrics=[metric("m")],
                dimensions=[card("vendor", "categorical", 4)],
                intent="detail",
            )
        )
        assert yaml.safe_load(rec(response, "table").table_yaml)["tables"][0]["rows_per_page"] == 5

    def test_five_metrics_by_four_vendors_is_a_table_two_is_a_bar(self):
        five = recommend(
            RecommendRequest(
                metrics=[metric(f"m{i}") for i in range(5)],
                dimensions=[card("vendor", "categorical", 4)],
            )
        )
        assert families(five)[:2] == ["table", "bar"]
        two = recommend(
            RecommendRequest(
                metrics=[metric("rides", "count"), metric("revenue")],
                dimensions=[card("vendor", "categorical", 4)],
            )
        )
        assert families(two)[:2] == ["bar", "table"]
        assert rec(two, "table").score < rec(two, "bar").score, "no alphabetical tie"

    def test_six_months_by_four_vendors_with_exact_figures_is_a_pivot_with_periods_as_columns(self):
        from visivo.models.table import Table

        response = recommend(
            RecommendRequest(
                metrics=[metric("revenue")],
                dimensions=[
                    card("month", "time", 6, time_grain="month", time_span_points=6),
                    card("vendor", "categorical", 4),
                ],
                intent="detail",
                context={"model": "trips_monthly"},
            )
        )
        assert families(response)[0] == "table_pivot"
        pivot = rec(response, "table_pivot")
        spec = yaml.safe_load(pivot.table_yaml)["tables"][0]
        assert spec["rows"] == ["${ref(trips_monthly).vendor}"] and spec["columns"] == [
            "${ref(trips_monthly).month}"
        ]
        assert spec["values"] == ["sum(${ref(trips_monthly).revenue})"]
        assert spec["format_cells"] == {
            "scope": "row",
            "min_color": "#e8d5df",
            "max_color": "#713b57",
        }
        assert spec["rows_per_page"] == 5, "one page so the gradient spans every row"
        assert any("unordered" in w for w in pivot.warnings)
        Table(**spec)

    def test_forty_periods_is_a_line_and_the_pivot_is_marked_down_for_its_columns(self):
        response = recommend(
            RecommendRequest(
                metrics=[metric("revenue")],
                dimensions=[
                    card("day", "time", 40, time_span_points=40),
                    card("vendor", "categorical", 4),
                ],
                intent="trend",
                context=ALL,
            )
        )
        assert families(response)[0] == "line"
        pivot = rec(response, "table_pivot")
        assert any("41 columns" in w and "scrolls sideways" in w for w in pivot.warnings)
        assert pivot.score == -0.7, "trend -0.4, and one range out of bounds -0.3"

    def test_twenty_quarters_with_exact_figures_still_prefers_the_line(self):
        response = recommend(
            RecommendRequest(
                metrics=[metric("revenue")],
                dimensions=[
                    card("quarter", "time", 20, time_span_points=20),
                    card("region", "categorical", 4),
                ],
                intent="detail",
                context=ALL,
            )
        )
        assert families(response)[0] == "line"
        assert any("scrolls sideways" in w for w in rec(response, "table_pivot").warnings)

    def test_an_identifier_dimension_is_never_a_chart_whatever_the_intent(self):
        for intent in ("rank", "compare", "trend", "composition", None):
            response = recommend(
                RecommendRequest(
                    metrics=[metric("fare", unit="USD")], dimensions=[ZONE], intent=intent
                )
            )
            assert families(response)[0] == "table", intent

    def test_mixed_units_push_the_table_up(self):
        response = recommend(
            RecommendRequest(
                metrics=[metric("fare", unit="USD"), metric("distance", "avg", unit="mi")],
                dimensions=[card("vendor", "categorical", 4)],
            )
        )
        assert "rows mix units" in " ".join(rec(response, "table").why)

    def test_a_composition_with_totals_is_a_pivot_that_says_to_build_them_in_sql(self):
        response = recommend(
            RecommendRequest(
                metrics=[metric("rides", "count")],
                dimensions=[BOROUGH, card("payment", "categorical", 5)],
                intent="composition",
                semantics={"part_of_whole": True, "totals_required": True},
            )
        )
        assert families(response)[0] == "table_pivot"
        assert "totals built in SQL" in " ".join(rec(response, "table_pivot").why)

    def test_exact_values_lift_both_table_families(self):
        plain = recommend(
            RecommendRequest(metrics=[metric("m")], dimensions=[BOROUGH, COMPANY_3], context=ALL)
        )
        exact = recommend(
            RecommendRequest(
                metrics=[metric("m")],
                dimensions=[BOROUGH, COMPANY_3],
                semantics={"exact_values": True},
                context=ALL,
            )
        )
        assert rec(exact, "table").score > rec(plain, "table").score
        assert rec(exact, "table_pivot").score > rec(plain, "table_pivot").score

    def test_the_column_budget_beats_the_cell_window(self):
        """50 zones × 24 hours is 1 200 cells (inside the pivot window) but
        25 columns: a paged table with an input filter, not a pivot."""
        response = recommend(
            RecommendRequest(
                metrics=[metric("rides", "count")],
                dimensions=[card("zone", "categorical", 50), card("hour", "numeric_discrete", 24)],
                intent="compare",
                context=ALL,
            )
        )
        assert families(response)[0] == "table"
        assert "too many cells for a heatmap" in " ".join(rec(response, "table").why)
        assert any("scrolls sideways" in w for w in rec(response, "table_pivot").warnings)

    def test_too_many_values_trim_to_the_budget_with_a_warning(self):
        response = recommend(
            RecommendRequest(
                metrics=[metric("fare"), metric("tips"), metric("rides", "count")],
                dimensions=[
                    card("borough", "categorical", 6),
                    card("payment_type", "categorical", 5),
                ],
                intent="compare",
            )
        )
        pivot = rec(response, "table_pivot")
        spec = yaml.safe_load(pivot.table_yaml)["tables"][0]
        assert spec["values"] == [
            "sum(${ref(model).fare})",
            "sum(${ref(model).tips})",
        ], "1 + 2×5 = 11 ≤ 12"
        assert any("2 of 3 values fit" in w for w in pivot.warnings)

    def test_the_boundaries_of_the_pivot_cell_window(self):
        def score_at(n_rows, n_cols):
            response = recommend(
                RecommendRequest(
                    metrics=[metric("m")],
                    dimensions=[card("a", "categorical", n_rows), card("b", "categorical", n_cols)],
                )
            )
            return rec(response, "table_pivot").score

        assert score_at(80, 5) == 0.0, "400 cells: a heatmap's job"
        assert score_at(81, 5) == 0.5, "401 cells: the pivot window opens"
        assert score_at(400, 5) == 0.5, "2 000 cells: still a pivot"
        assert score_at(401, 5) == 0.0, "2 001 cells: a filtered detail table instead"

    def test_the_boundary_of_the_column_budget(self):
        def scrolls(n_cols):
            response = recommend(
                RecommendRequest(
                    metrics=[metric("m")],
                    dimensions=[card("a", "categorical", 50), card("b", "categorical", n_cols)],
                    context=ALL,
                )
            )
            return any("scrolls sideways" in w for w in rec(response, "table_pivot").warnings)

        assert not scrolls(11) and scrolls(12), "1 + 11 = 12 fits the 12-column budget"

    def test_a_many_dimension_chart_carries_a_detail_table_pairing(self):
        response = recommend(
            RecommendRequest(
                metrics=[RIDES], dimensions=[card("zone", "categorical", 60)], intent="rank"
            )
        )
        bar = rec(response, "bar")
        # Axis-cardinality repair (top-N on the x axis itself) is P2b's; the
        # pairing is what P2f adds.
        assert "detail_table_below" in bar.pairings
        assert "detail_table_below" not in rec(response, "table").pairings


class TestTheTableRuleFile:
    def test_tables_yml_loads_and_pages_sensibly(self):
        doc = rules.load_tables()
        assert doc.rows_per_page.enum == [size.value for size in RowsPerPageEnum]
        assert doc.rows_per_page.pick(7) == 10 and doc.rows_per_page.pick(263) == 50
        assert doc.rows_per_page.pick(40, gradient=True) == 50
        assert doc.rows_per_page.pick(None) == 50
        assert doc.placement.pivot_beside_chart.max_columns == 6

    def test_a_broken_file_names_itself(self, tmp_path):
        path = tmp_path / "tables.yml"
        path.write_text("gotchas: []\n")
        with pytest.raises(ValueError, match=r"tables\.yml"):
            rules.load_tables(path)
        path.write_text("- list\n")
        with pytest.raises(ValueError, match="mapping"):
            rules.load_tables(path)

    def test_the_schema_checks_the_enum_and_hex_colours(self):
        from pydantic import ValidationError

        from visivo.agent.charting.schema import FormatCellsRule, RowsPerPageRule

        with pytest.raises(ValidationError, match="one of the enum"):
            RowsPerPageRule(enum=[3, 5], lookup="l", long=50, with_format_cells="w")
        with pytest.raises(ValidationError, match="must be hex"):
            FormatCellsRule(scope={}, colors={"min": "red", "max": "#713b57"})


class TestTheWhenVocabulary:
    def test_direct_clauses(self):
        from visivo.agent.charting.recommend import _Facts, _clause, _fires

        request = RecommendRequest(metrics=[RIDES], dimensions=[BOROUGH], intent="rank")
        facts = _Facts()
        assert _clause("intent != detail")(request, facts) is True
        assert _clause("intent != rank")(request, facts) is False
        assert _clause("not a clause") is None
        assert _clause("intent == rank and not a clause") is None
        assert _clause("not not a clause") is None
        with pytest.raises(ValueError, match="unknown `when`"):
            _fires("not a clause", request, facts)

    def test_a_pivot_rejects_an_off_role_second_dimension(self):
        response = recommend(RecommendRequest(metrics=[RIDES], dimensions=[DAY, DISTANCE]))
        assert any(
            r.family == "table_pivot"
            and r.reason.startswith("trip_distance is numeric_continuous; table_pivot takes")
            for r in response.rejected
        )


def only(family, *types):
    """``family`` drawn by the named members alone."""
    rule = next(r for r in rules.load_families() if r.name == family)
    return [rule.model_copy(update={"members": [m for m in rule.members if m.type in types]})]


def rejected(response, family):
    return next(r.reason for r in response.rejected if r.family == family)


class TestStageOneGates:
    """A gate rejects with the reason; it is structural or a minimum."""

    def test_an_axis_role_the_family_cannot_take(self):
        response = recommend(RecommendRequest(metrics=[RIDES], dimensions=[DAY]))
        assert rejected(response, "xy") == (
            "pickup_day cannot be the axis; needs numeric_continuous, numeric_discrete"
        )

    def test_a_required_semantic(self):
        stages = card("stage", "categorical", 5, ordered=True)
        without = recommend(RecommendRequest(metrics=[RIDES], dimensions=[stages]))
        with_it = recommend(
            RecommendRequest(
                metrics=[RIDES], dimensions=[stages], semantics={"ordered_stages": True}
            )
        )
        assert rejected(without, "funnel") == "needs `ordered_stages`"
        assert families(with_it)[0] == "funnel"

    def test_region_boundaries_are_built_in_or_supplied(self):
        def geo(supplied=False, **region):
            request = RecommendRequest(
                metrics=[RIDES],
                dimensions=[card("region", "geo_region", 50, **region)],
                intent="geo",
                semantics={"boundaries_available": supplied},
            )
            return recommend(request)

        assert rejected(geo(geo_kind="custom"), "geo_region") == "needs `region boundaries`"
        assert families(geo(geo_kind="us_state"))[0] == "geo_region"
        assert families(geo(geo_kind="custom", supplied=True))[0] == "geo_region"

    def test_a_minimum_count(self):
        response = recommend(RecommendRequest(metrics=[RIDES], dimensions=[BOROUGH]))
        assert rejected(response, "heatmap") == "heatmap needs at least 2 dimensions, has 1"
        assert rejected(response, "multivariate") == "parcoords needs at least 3 metrics, has 1"
        kpi_alone = recommend(RecommendRequest(metrics=[RIDES]))
        assert rejected(kpi_alone, "bar") == "bar needs at least 1 dimension, has 0"

    def test_a_minimum_number_of_values(self):
        one = card("payment", "categorical", 1)
        response = recommend(
            RecommendRequest(metrics=[RIDES], dimensions=[one], semantics={"part_of_whole": True})
        )
        assert rejected(response, "part_of_whole") == "needs at least 2 values of payment, has 1"

    def test_a_minimum_row_count_when_the_request_knows_it(self):
        lat, lon = card("lat", "geo_point", 900), card("lon", "geo_point", 900)
        few = recommend(
            RecommendRequest(dimensions=[lat, lon], intent="geo", context={"row_count": 50})
        )
        unknown = recommend(RecommendRequest(dimensions=[lat, lon], intent="geo", context=ALL))
        assert rejected(few, "geo_density") == "needs at least 200 rows, has 50"
        assert "geo_density" in families(unknown)

    def test_a_minimum_of_rows_per_group(self):
        fare = card("fare", "numeric_continuous", 5_000)
        request = RecommendRequest(dimensions=[fare, BOROUGH], context={"row_count": 300})
        response = recommend(request, rules=only("distribution", "violin"))
        assert rejected(response, "distribution") == "needs 100 rows per pickup_borough, has 60"


class TestStageTwoLimits:
    """Ranges try the entry's repairs in order, scoped to what each fixes."""

    def test_the_first_repair_that_fixes_the_range_wins(self):
        zones = card("zone", "categorical", 60)
        bar = rec(
            recommend(RecommendRequest(metrics=[RIDES], dimensions=[zones], context=ALL)), "bar"
        )
        assert bar.transforms == ["top_n_other"], "before input_filter in bar's list"
        assert "60 zone values exceeds 20; top_n_other brings it to 20" in bar.warnings

    def test_a_repair_acts_only_on_the_roles_it_names(self):
        """top_n_other is first, but a top-N of days is meaningless."""
        bar = rec(
            recommend(RecommendRequest(metrics=[RIDES], dimensions=[DAY], context=ALL)), "bar"
        )
        assert bar.transforms == ["regrain"]

    def test_regrain_climbs_one_grain_at_a_time_from_where_it_got_to(self):
        bar = rec(
            recommend(RecommendRequest(metrics=[RIDES], dimensions=[DAY, COMPANY_20], context=ALL)),
            "bar",
        )
        assert bar.transforms == ["top_n_other", "regrain"]
        assert bar.warnings == [
            "20 series exceeds 10; top_n_other brings it to 8",
            "365 pickup_day values exceeds 20; regrain brings it to 13",
            "104 cells exceeds 50; regrain brings it to 5",
        ], "days to months for the axis, then months to quarters for the cells"

    def test_an_unknown_grain_is_assumed_to_fit(self):
        periods = card("period", "time", 365)
        bar = rec(
            recommend(RecommendRequest(metrics=[RIDES], dimensions=[periods], context=ALL)), "bar"
        )
        assert bar.transforms == ["regrain"]
        assert "365 period values exceeds 20; regrain brings it to 20" in bar.warnings

    def test_what_nothing_fixes_costs_score_and_names_the_alternatives(self):
        four = [metric(f"m{i}") for i in range(4)]
        line = rec(recommend(RecommendRequest(metrics=four, dimensions=[DAY], context=ALL)), "line")
        assert line.trace_type == "scatter"
        assert line.warnings[0] == (
            "4 metrics exceeds the 3 scatter stays readable with, and nothing in its repair "
            "list fixes it; consider heatmap"
        )
        assert line.alternatives == ["heatmap"]
        assert line.score == round(0.2 + 0.1 - 0.3, 3), "series, time axis, one range out"

    def test_a_second_dimension_on_a_one_series_map_is_folded_by_dominant_category(self):
        state = card("state", "geo_region", 50, geo_kind="us_state")
        response = recommend(
            RecommendRequest(metrics=[RIDES], dimensions=[state, COMPANY_3], intent="geo")
        )
        best = response.recommendations[0]
        assert (best.family, best.transforms) == ("geo_region", ["dominant_category"])

    def test_more_rows_than_svg_draws_switch_the_member_not_the_family(self):
        fare = {"name": "fare", "agg": "avg"}

        def xy(rows):
            response = recommend(
                RecommendRequest(
                    metrics=[fare],
                    dimensions=[DISTANCE],
                    intent="relationship",
                    context={"row_count": rows},
                )
            )
            return response.recommendations[0]

        assert (xy(500).family, xy(500).trace_type) == ("xy", "scatter")
        assert (xy(1_000_000).family, xy(1_000_000).trace_type) == ("xy", "scattergl")

    def test_a_chart_named_before_the_first_fixing_repair_is_drawn_instead(self):
        from visivo.agent.charting.recommend import _Outcome, _repair, _doc

        histogram = {e.type: e for e in rules.load_traces()}["histogram"]
        outcome = _Outcome(member=histogram)
        request = RecommendRequest(dimensions=[DISTANCE, COMPANY_20])
        _repair(
            outcome, "histogram", histogram.data_shape, histogram.limits, request, _doc().transforms
        )

        assert outcome.unfixed == 1 and outcome.transforms == [] and outcome.alternatives == ["box"]
        assert outcome.warnings == [
            "20 series exceeds the 3 histogram stays readable with; draw a box instead"
        ]

    def test_a_split_is_cut_to_its_ideal_and_a_category_to_its_maximum(self):
        line = top(RecommendRequest(metrics=[RIDES], dimensions=[DAY, COMPANY_20], intent="trend"))
        pie = top(
            RecommendRequest(
                metrics=[RIDES],
                dimensions=[COMPANY_20],
                semantics={"part_of_whole": True},
                intent="composition",
            )
        )

        assert "20 series exceeds 12; top_n_other brings it to 8" in line.warnings
        assert "20 company values exceeds 5; top_n_other brings it to 5" in pie.warnings

    def test_a_top_n_that_leaves_other_the_largest_slice_gives_way_to_the_bar(self):
        shares = [0.30, 0.16, 0.09, 0.07] + [0.0225] * 16
        tail = card(
            "company",
            "categorical",
            20,
            top_n=[{"value": f"c{i}", "share": v} for i, v in enumerate(shares)],
        )
        response = recommend(
            RecommendRequest(
                metrics=[RIDES],
                dimensions=[tail],
                semantics={"part_of_whole": True},
                intent="composition",
                context=ALL,
            )
        )

        assert families(response)[0] == "bar"
        pie = rec(response, "part_of_whole")
        assert pie.transforms == [] and pie.alternatives == ["bar"]
        assert pie.warnings[0] == (
            "20 company values exceeds the 5 pie stays readable with; top_n_other would leave "
            "Other 38% of the rows, more than the largest company (30%), and nothing in its "
            "repair list fixes it; consider bar"
        )

    def test_without_top_values_the_cut_is_assumed_to_leave_other_small(self):
        from visivo.agent.charting.recommend import _crowded

        assert _crowded(COMPANY_20, 5) is None
        few = card("company", "categorical", 20, top_n=[{"value": "a", "share": 0.9}])
        assert _crowded(few, 5) is None

    def test_between_ideal_and_max_warns_without_a_repair(self):
        line = top(RecommendRequest(metrics=[RIDES], dimensions=[DAY, COMPANY_10], intent="trend"))
        assert line.transforms == []
        assert line.warnings == ["10 series is readable but above the ideal of 8"]


class TestStageThreeScore:
    def test_the_score_is_the_sum_of_its_reasons_less_its_repairs(self):
        best = top(RecommendRequest(metrics=[RIDES], dimensions=[DAY, COMPANY_20], intent="trend"))
        assert best.why == [
            "a trend reads best as a line",
            "few enough series to follow",
            "a time axis is a line's home",
            "after top_n_other",
        ]
        assert best.score == round(0.4 + 0.2 + 0.1 - 0.1, 3)

    def test_a_niche_member_says_why_it_ranks_low(self):
        speeds = [metric(n) for n in ("x", "y", "z")]
        grid = [card(n, "numeric_continuous", 10) for n in ("a", "b", "c")]
        three_d = rec(
            recommend(RecommendRequest(metrics=speeds, dimensions=grid, context=ALL)), "three_d"
        )
        assert three_d.why[-1].endswith("is a niche type; it ranks only with a reason")
        assert three_d.score <= -0.5

    def test_every_recommendation_explains_itself(self):
        for request in REQUESTS:
            for r in recommend(request).recommendations:
                assert r.why and all(r.why)


class TestTheMemberAFamilyIsDrawnWith:
    def test_deprecated_members_are_never_chosen(self):
        deprecated = {e.type for e in rules.load_traces() if e.status == "deprecated"}
        chosen = {r.trace_type for q in REQUESTS for r in recommend(q).recommendations}
        assert deprecated and not deprecated & chosen

    def test_a_member_with_a_range_left_out_loses_to_one_repaired(self):
        line = only("line", "scatter", "scattergl")[0]
        stuck = [
            (
                m.model_copy(update={"limits": m.limits.model_copy(update={"repair": []})})
                if m.type == "scatter"
                else m
            )
            for m in line.members
        ]
        response = recommend(
            RecommendRequest(metrics=[RIDES], dimensions=[DAY, COMPANY_20]),
            rules=[line.model_copy(update={"members": stuck})],
        )
        best = response.recommendations[0]
        assert (best.trace_type, best.transforms) == ("scattergl", ["top_n_other"])

    def test_ties_go_to_the_first_listed(self):
        """Three overlaid groups fit a histogram and a box alike."""
        best = top(RecommendRequest(dimensions=[DISTANCE, COMPANY_3], intent="distribution"))
        assert best.trace_type == "histogram"

    def test_a_member_alternatives_are_carried(self):
        hour, distance = card("hour", "numeric_discrete", 24), card("km", "numeric_discrete", 30)
        response = recommend(
            RecommendRequest(metrics=[RIDES], dimensions=[hour, distance]),
            rules=only("density2d", "contour"),
        )
        assert response.recommendations[0].alternatives == ["heatmap"]


class TestTheResponse:
    def test_chart_skeletons_validate_and_tables_carry_table_yaml(self):
        from visivo.models.chart import Chart
        from visivo.models.insight import Insight

        for request in REQUESTS:
            for r in recommend(request).recommendations:
                if r.family in ("table", "table_pivot"):
                    assert r.table_yaml and r.yaml_skeleton is None
                    continue
                assert bool(r.yaml_skeleton) != bool(r.example_yaml), "one or the other"
                skeleton = yaml.safe_load(r.yaml_skeleton or r.example_yaml)
                [Insight(**i) for i in skeleton["insights"]]
                Chart(**skeleton["charts"][0])

    def test_an_adapted_skeleton_reads_the_request_model(self):
        best = top(
            RecommendRequest(
                metrics=[RIDES], dimensions=[DAY], intent="trend", context={"model": "trips"}
            )
        )
        assert "${ref(trips).pickup_day}" in best.yaml_skeleton
        assert best.example_yaml is None
        assert not any("no runnable skeleton" in w for w in best.warnings)

    def test_an_unadapted_example_is_never_offered_as_a_skeleton(self):
        """The pie example has one label column, so a second dimension has no
        place: the example comes back as a pattern, under its own key."""
        pie = rec(
            recommend(
                RecommendRequest(metrics=[RIDES], dimensions=[BOROUGH, COMPANY_3], context=ALL)
            ),
            "part_of_whole",
        )
        assert pie.yaml_skeleton is None
        assert "payment_type" in pie.example_yaml
        assert pie.warnings[-1] == (
            "no runnable skeleton: a request column has no place in the example; example_yaml "
            "is the pie example as written, a pattern to map your columns onto, not a chart "
            "to paste"
        )

    def test_encodings_are_the_member_variations_or_the_pivot_rules(self):
        response = recommend(
            RecommendRequest(metrics=[metric("m")], dimensions=[BOROUGH, COMPANY_3], context=ALL)
        )
        assert rec(response, "bar").encodings["long category labels"].startswith("`orientation: h`")
        pivot = rec(response, "table_pivot").encodings
        assert set(pivot) == {"rows", "columns", "format_cells"}

    def test_transforms_suggested_follow_the_ranking(self):
        response = recommend(RecommendRequest(metrics=[RIDES], dimensions=[DAY, COMPANY_20]))
        applied = [t for r in response.recommendations for t in r.transforms]
        assert response.transforms_suggested == list(dict.fromkeys(applied))

    def test_the_same_request_gives_the_same_answer(self):
        for request in REQUESTS:
            assert recommend(request) == recommend(RecommendRequest(**request.model_dump()))


REQUESTS = [
    RecommendRequest(metrics=[RIDES], dimensions=[BOROUGH, COMPANY_3], intent="compare"),
    RecommendRequest(metrics=[RIDES], dimensions=[DAY, COMPANY_3], intent="trend"),
    RecommendRequest(metrics=[RIDES], dimensions=[DAY, COMPANY_20]),
    RecommendRequest(dimensions=[DISTANCE], intent="distribution"),
    RecommendRequest(dimensions=[DISTANCE, BOROUGH]),
    RecommendRequest(metrics=[RIDES], dimensions=[ZONE], intent="rank"),
    RecommendRequest(metrics=[RIDES], intent="kpi"),
    RecommendRequest(
        metrics=[RIDES],
        dimensions=[card("lat", "geo_point", 900), card("lon", "geo_point", 900)],
        intent="geo",
    ),
    RecommendRequest(
        metrics=[RIDES],
        dimensions=[card("state", "geo_region", 50, geo_kind="us_state")],
        intent="geo",
    ),
]


class TestOtherInTheSkeleton:
    def test_a_cut_split_carries_the_other_colour_and_rank_sort(self):
        best = top(
            RecommendRequest(
                metrics=[RIDES],
                dimensions=[DAY, COMPANY_20],
                intent="trend",
                context={"model": "trips"},
            )
        )
        line = yaml.safe_load(best.yaml_skeleton)["insights"][0]

        case = "?{ CASE WHEN ${ref(trips).company} = 'Other' THEN '#9e9e9e' END }[0]"
        assert line["props"]["line"]["color"] == case
        assert line["interactions"][1] == {"sort": "?{ min(${ref(trips).company_rank}) ASC }"}

    def test_no_cut_no_other(self):
        best = top(
            RecommendRequest(
                metrics=[RIDES], dimensions=[DAY, COMPANY_3], context={"model": "trips"}
            )
        )
        assert "Other" not in best.yaml_skeleton and "_rank" not in best.yaml_skeleton


class TestAdditivity:
    def test_a_card_overrides_the_aggregation(self):
        """A sum of a non-additive column (a balance) cannot stack."""
        balance = {
            "name": "balance",
            "agg": "sum",
            "card": card("balance", "numeric_continuous", 900, additive=False),
        }
        request = RecommendRequest(
            metrics=[balance],
            dimensions=[DAY, COMPANY_3],
            semantics={"part_of_whole": True},
            context=ALL,
        )
        area = rec(recommend(request), "area")
        assert "stacking a rate or an average sums it, which means nothing" in area.why

    def test_an_average_of_an_additive_column_is_not(self):
        """Fares add up; their average does not, whatever the card says."""
        fare = {
            "name": "fare",
            "agg": "avg",
            "card": card("fare", "numeric_continuous", 900, additive=True),
        }
        request = RecommendRequest(
            metrics=[fare],
            dimensions=[DAY, COMPANY_3],
            semantics={"part_of_whole": True},
            context=ALL,
        )
        area = rec(recommend(request), "area")
        assert "stacking a rate or an average sums it, which means nothing" in area.why


ZONE_40 = card("zone", "categorical", 40)


class TestAChartAskedForByName:
    """Ranges discourage a chart; a user who names one still gets it first,
    with what it costs."""

    def test_a_family_ranks_first_with_its_repairs_and_warnings(self):
        plain = RecommendRequest(metrics=[RIDES], dimensions=[ZONE_40], intent="compare")
        asked = plain.model_copy(update={"requested": "part_of_whole"})

        assert top(plain).family == "bar"
        pie = top(asked)
        assert pie.family == "part_of_whole" and pie.transforms == ["top_n_other"]
        assert "40 zone values exceeds 5; top_n_other brings it to 5" in pie.warnings
        assert pie.why[-1] == "asked for by name, so it ranks first; its warnings are the cost"
        bar = rec(recommend(asked), "bar")
        assert pie.score < bar.score, "the score is not bent; only the order is"

    def test_a_trace_type_draws_its_family_with_that_member(self):
        request = RecommendRequest(
            dimensions=[DISTANCE, BOROUGH], intent="distribution", context={"row_count": 100_000}
        )

        assert top(request).trace_type == "box"
        violin = top(request.model_copy(update={"requested": "violin"}))
        assert violin.family == "distribution" and violin.trace_type == "violin"

    def test_a_member_its_minimum_rejects_gives_way_and_says_so(self):
        request = RecommendRequest(
            dimensions=[DISTANCE, BOROUGH],
            intent="distribution",
            context={"row_count": 120},
            requested="violin",
        )

        box = top(request)
        assert box.trace_type == "box"
        assert (
            "violin was asked for, but needs 100 rows per pickup_borough, has 24; drawn as box"
            in box.warnings
        )

    def test_a_type_several_families_draw_puts_all_of_them_first(self):
        response = recommend(
            RecommendRequest(metrics=[RIDES], dimensions=[DAY], requested="scatter", context=ALL)
        )

        assert families(response)[:2] == ["line", "area"]

    def test_a_hard_gate_still_rejects_and_the_top_says_so(self):
        response = recommend(
            RecommendRequest(metrics=[RIDES], dimensions=[ZONE_40], requested="funnel")
        )

        assert rejected(response, "funnel") == "needs `ordered_stages`"
        assert "funnel was asked for, but funnel: needs `ordered_stages`" in (
            response.recommendations[0].warnings
        )

    def test_a_family_whose_members_all_fail_names_the_asked_one(self):
        response = recommend(
            RecommendRequest(metrics=[RIDES], dimensions=[DISTANCE], requested="violin")
        )

        assert (
            rejected(response, "distribution")
            == "violin takes no metrics; it draws the rows themselves"
        )

    def test_an_unknown_name_is_refused(self):
        from pydantic import ValidationError

        with pytest.raises(ValidationError, match="'pizza' is neither a family nor a trace type"):
            RecommendRequest(metrics=[RIDES], requested="pizza")
        assert RecommendRequest(metrics=[RIDES], requested="table_pivot").requested


class TestWarningsBelongToTheDrawnMember:
    def test_the_pre_bucket_warning_is_the_histograms_alone(self):
        distance = card("trip_distance", "numeric_continuous", 48_000)
        histogram = rec(recommend(RecommendRequest(dimensions=[distance])), "distribution")
        box = rec(
            recommend(RecommendRequest(dimensions=[distance, BOROUGH])),
            "distribution",
        )

        assert histogram.trace_type == "histogram" and box.trace_type == "box"
        assert any("Pre-bucket in SQL" in w for w in histogram.warnings)
        assert not any("Pre-bucket" in w for w in box.warnings)


class TestOneCardListServesEveryTool:
    """score_candidates and recommend_inputs need a card's `model`; refusing it
    here made an agent rebuild its cards between calls."""

    CARD = {"column": "day", "role": "time", "cardinality": 90, "time_grain": "day"}

    def test_a_card_may_carry_its_model_and_names_the_skeletons_model(self):
        request = RecommendRequest(dimensions=[{**self.CARD, "model": "sales"}])
        assert request.dimensions[0].model == "sales"
        assert request.context.model == "sales"

    def test_an_explicit_context_model_wins(self):
        request = RecommendRequest(
            dimensions=[{**self.CARD, "model": "sales"}], context={"model": "orders"}
        )
        assert request.context.model == "orders"

    def test_cards_from_two_models_leave_the_default(self):
        request = RecommendRequest(
            dimensions=[{**self.CARD, "model": "a"}, {**self.CARD, "column": "x", "model": "b"}]
        )
        assert request.context.model == "model"

    def test_a_plain_shape_card_is_accepted(self):
        request = RecommendRequest(dimensions=[ShapeCard(**self.CARD)])
        assert request.dimensions[0].column == "day" and request.dimensions[0].model is None


class TestADefinedMetricIsNotAggregatedAgain:
    """A metric the project defines already aggregates. Wrapping its ref in
    another aggregate (`SUM(${ref(subs).total_mrr})`) nests aggregates, and the
    query fails."""

    def _kpi_value(self, defined):
        response = recommend(
            RecommendRequest(
                metrics=[{"name": "total_mrr", "agg": "sum", "defined": defined}],
                dimensions=[],
                intent="kpi",
                context={"model": "subs"},
            )
        )
        skeleton = yaml.safe_load(rec(response, "kpi").yaml_skeleton)
        return skeleton["insights"][0]["props"]["value"]

    def test_a_model_metric_is_refd_bare(self):
        assert self._kpi_value("model") == "?{ ${ref(subs).total_mrr} }[0]"

    def test_a_project_metric_is_refd_by_its_own_name(self):
        assert self._kpi_value("project") == "?{ ${ref(total_mrr)} }[0]"

    def test_a_column_is_still_aggregated(self):
        assert self._kpi_value(None) == "?{ SUM(${ref(subs).total_mrr}) }[0]"

    def test_a_pivot_values_a_defined_metric_bare(self):
        response = recommend(
            RecommendRequest(
                metrics=[{"name": "revenue", "agg": "sum", "defined": "model"}],
                dimensions=[
                    card("month", "time", 6, time_grain="month", time_span_points=6),
                    card("vendor", "categorical", 4),
                ],
                intent="detail",
                context={"model": "trips_monthly"},
            )
        )
        spec = yaml.safe_load(rec(response, "table_pivot").table_yaml)["tables"][0]
        assert spec["values"] == ["${ref(trips_monthly).revenue}"]

    def test_a_hierarchy_values_a_defined_metric_bare(self):
        response = recommend(
            RecommendRequest(
                metrics=[{"name": "revenue", "agg": "sum", "defined": "model"}],
                dimensions=[card("vendor", "categorical", 4)],
                semantics={"hierarchy": True, "part_of_whole": True},
                requested="treemap",
                context={"model": "trips", "max_results": 25},
            )
        )
        skeleton = yaml.safe_load(rec(response, "hierarchy").yaml_skeleton)
        assert skeleton["insights"][0]["props"]["values"] == "?{ ${ref(trips).revenue} }"
