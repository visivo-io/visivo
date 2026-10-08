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

    def test_line_is_rejected_for_want_of_time(self):
        response = recommend(RecommendRequest(metrics=[RIDES], dimensions=[BOROUGH, COMPANY_3]))

        assert {"family": "line", "reason": "needs a time dimension"} in [
            r.model_dump() for r in response.rejected
        ]


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

    def test_a_time_axis_keeps_bars_out(self):
        response = recommend(RecommendRequest(metrics=[RIDES], dimensions=[DAY, COMPANY_3]))

        assert "bar" in {r.family for r in response.rejected}

    def test_too_few_points_is_not_a_trend(self):
        two_days = card("pickup_day", "time", 2, time_span_points=2)
        response = recommend(RecommendRequest(metrics=[RIDES], dimensions=[two_days]))

        assert any(r.family == "line" and "time points" in r.reason for r in response.rejected)


class TestGoldenC_TripDistance:
    """One numeric column and a distribution intent: a histogram, with the
    row-count warning carried through."""

    def test_histogram_wins(self):
        best = top(RecommendRequest(dimensions=[DISTANCE], intent="distribution"))

        assert best.family == "histogram"
        assert any("Pre-bucket" in w for w in best.warnings)

    def test_without_the_intent_the_histogram_is_gated_out(self):
        response = recommend(RecommendRequest(dimensions=[DISTANCE]))

        assert any(r.family == "histogram" and "intents" in r.reason for r in response.rejected)


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
