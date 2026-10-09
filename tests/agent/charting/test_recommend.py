"""The golden table (VIS-1407 scaffold). Three NYC-taxi cases pin the engine's
shape; VIS-1429 grows this to forty. Every rule edit must keep it green."""

import pytest

from visivo.agent.charting import rules
from visivo.agent.charting.recommend import recommend
from visivo.agent.charting.schema import RecommendRequest, ShapeCard


def card(column, role, cardinality, **extra):
    return ShapeCard(column=column, role=role, cardinality=cardinality, **extra)


BOROUGH = card("pickup_borough", "categorical", 5)
COMPANY_3 = card("company", "categorical", 3)
COMPANY_20 = card("company", "categorical", 20)
DAY = card("pickup_day", "time", 365, time_grain="day", time_span_points=365)
DISTANCE = card("trip_distance", "numeric_continuous", 48_000)
ZONE = card("zone_id", "identifier", 263)
RIDES = {"name": "rides", "agg": "count"}


def top(request):
    return recommend(request).recommendations[0]


class TestTheRuleFileLoads:
    def test_five_obvious_families(self):
        assert [r.name for r in rules.load_families()] == [
            "kpi",
            "line",
            "bar",
            "histogram",
            "table",
        ]

    def test_a_duplicate_family_is_refused(self, tmp_path):
        path = tmp_path / "families.yml"
        path.write_text("families:\n  - {name: bar}\n  - {name: bar}\n")

        with pytest.raises(ValueError, match="duplicate"):
            rules.load_families(path)

    def test_an_empty_file_is_refused(self, tmp_path):
        path = tmp_path / "families.yml"
        path.write_text("families: []\n")

        with pytest.raises(ValueError, match="non-empty"):
            rules.load_families(path)

    def test_an_invalid_entry_names_the_field(self, tmp_path):
        path = tmp_path / "families.yml"
        path.write_text("families:\n  - {name: bar, trace_types: [sparkline]}\n")

        with pytest.raises(Exception, match="sparkline"):
            rules.load_families(path)


class TestGoldenA_BoroughByCompany:
    """Two small categoricals, no time: a bar carries both; a line cannot."""

    def test_bar_wins(self):
        request = RecommendRequest(
            metrics=[RIDES], dimensions=[BOROUGH, COMPANY_3], intent="compare"
        )

        best = top(request)
        assert best.family == "bar" and best.trace_type == "bar"
        assert "second_dimension" in best.encodings

    def test_line_is_rejected_for_want_of_an_ordered_axis(self):
        response = recommend(RecommendRequest(metrics=[RIDES], dimensions=[BOROUGH, COMPANY_3]))

        assert any(r.family == "line" and "ordered axis" in r.reason for r in response.rejected)

    def test_a_zero_max_window_is_printed_as_zero(self):
        """`max: 0` must not read as unbounded."""
        response = recommend(RecommendRequest(metrics=[RIDES], dimensions=[BOROUGH]))

        assert any(
            r.family == "histogram" and r.reason == "takes 0–0 metrics" for r in response.rejected
        )


class TestGoldenB_RidesPerDayByCompany:
    """A time axis plus a categorical: a line at cardinality 3, a repaired
    line at cardinality 20."""

    def test_three_companies_is_a_plain_line(self):
        best = top(RecommendRequest(metrics=[RIDES], dimensions=[DAY, COMPANY_3], intent="trend"))

        assert best.family == "line" and best.transforms == []
        assert "indicator_total_overlay" in best.pairings
        assert "few enough series to follow" in best.why

    def test_twenty_companies_is_repaired_first(self):
        response = recommend(
            RecommendRequest(metrics=[RIDES], dimensions=[DAY, COMPANY_20], intent="trend")
        )

        best = response.recommendations[0]
        assert best.family == "line" and best.transforms == ["top_n_other"]
        assert response.transforms_suggested == ["top_n_other"]
        assert any("exceeds 12" in w for w in best.warnings)

    def test_a_year_of_days_ranks_the_line_above_the_bar(self):
        """Bars are admitted on a time axis but penalised at this many
        periods, so the line wins without any intent being stated."""
        response = recommend(RecommendRequest(metrics=[RIDES], dimensions=[DAY, COMPANY_3]))

        families = [r.family for r in response.recommendations]
        assert families.index("line") < families.index("bar")
        bar = next(r for r in response.recommendations if r.family == "bar")
        assert "too many periods for columns" in " ".join(bar.why)

    def test_too_few_points_is_not_a_trend(self):
        two_days = card("pickup_day", "time", 2, time_span_points=2)
        response = recommend(RecommendRequest(metrics=[RIDES], dimensions=[two_days]))

        assert any(r.family == "line" and "axis points" in r.reason for r in response.rejected)


class TestGoldenC_TripDistance:
    """One numeric column and a distribution intent: a histogram, with the
    row-count warning carried through."""

    def test_histogram_wins(self):
        best = top(RecommendRequest(dimensions=[DISTANCE], intent="distribution"))

        assert best.family == "histogram"
        assert any("Pre-bucket" in w for w in best.warnings)

    def test_without_an_intent_the_histogram_still_ranks(self):
        """Intent is a preference, not a gate: the agent often omits it."""
        assert top(RecommendRequest(dimensions=[DISTANCE])).family == "histogram"

    def test_a_small_split_overlays_the_histogram(self):
        best = top(RecommendRequest(dimensions=[DISTANCE, BOROUGH], intent="distribution"))

        assert best.family == "histogram" and best.transforms == []

    def test_a_large_split_is_repaired_first(self):
        best = top(RecommendRequest(dimensions=[DISTANCE, COMPANY_20], intent="distribution"))

        assert best.family == "histogram" and best.transforms == ["top_n_other"]


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

    def test_every_recommendation_explains_itself(self):
        for request in (
            RecommendRequest(metrics=[RIDES], dimensions=[BOROUGH]),
            RecommendRequest(metrics=[RIDES], dimensions=[DAY, COMPANY_20]),
            RecommendRequest(dimensions=[DISTANCE], intent="distribution"),
        ):
            for rec in recommend(request).recommendations:
                assert rec.why and rec.skill

    def test_it_is_deterministic(self):
        request = RecommendRequest(metrics=[RIDES], dimensions=[BOROUGH, COMPANY_3])

        assert recommend(request) == recommend(request)

    def test_max_results_is_honoured(self):
        request = RecommendRequest(
            metrics=[RIDES], dimensions=[BOROUGH], context={"max_results": 1}
        )

        assert len(recommend(request).recommendations) == 1

    def test_a_plain_dict_request_is_accepted(self):
        response = recommend({"metrics": [RIDES], "intent": "kpi"})

        assert response.recommendations[0].family == "kpi"

    def test_a_family_nothing_repairs_is_rejected_with_the_reason(self):
        strict = [
            r.model_copy(update={"limits": r.limits.model_copy(update={"repair": []})})
            for r in rules.load_families()
        ]
        response = recommend(
            RecommendRequest(metrics=[RIDES], dimensions=[DAY, COMPANY_20]), rules=strict
        )

        assert any(
            r.family == "line" and "nothing repairs it" in r.reason for r in response.rejected
        )


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
        assert "time_dimension" in response.recommendations[0].encodings

    def test_but_not_over_a_category(self):
        response = recommend(RecommendRequest(metrics=[RIDES], dimensions=[BOROUGH], intent="kpi"))

        assert any(
            r.family == "kpi" and "cannot be the axis" in r.reason for r in response.rejected
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
    """families.yml is a Phase 0 scaffold: five families so the engine has a
    shape. P2a writes an entry for all 48 trace types and P2b lifts them into
    ~22 families. Until then this is expected to fail; when it passes, drop
    the marker. Strict, so it cannot pass by accident and go unnoticed."""

    @pytest.mark.xfail(strict=True, reason="P2a/P2b (VIS-1419..1429) cover the remaining 43 types")
    def test_every_prop_type_is_claimed_by_exactly_one_family(self):
        from visivo.agent.charting.schema import TABLE_TYPES
        from visivo.models.props.types import PropType

        claimed = [t for r in rules.load_families() for t in r.trace_types]

        assert sorted(set(claimed)) == sorted({p.value for p in PropType} | set(TABLE_TYPES))
        assert len(claimed) == len(set(claimed)), "a type may belong to one family only"
