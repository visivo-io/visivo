import math
import shutil
from pathlib import Path

import pytest
import yaml
from sqlglot import exp

from tests.factories.model_factories import DefaultsFactory, DuckdbSourceFactory
from visivo.agent import skills, tools
from visivo.agent.actions import attributed_to
from visivo.agent.charting import rules
from visivo.agent.charting.candidates import (
    METRICS,
    Candidate,
    CandidatesError,
    Stats,
    _agg_node,
    col,
    identifier,
    _Builder,
    _grain_for,
    _Layer,
    _Model,
    _propose_metrics,
    choose,
    score_candidates,
    top_n_other,
)
from visivo.agent.charting.inputs import InputCard
from visivo.agent.charting.schema import Aggregation, RecommendRequest, ShapeCard
from visivo.models.dimension import Dimension
from visivo.models.metric import Metric
from visivo.models.relation import Relation
from visivo.server.services.profiling_service import ProfilingService

INTEGRATION = Path(__file__).parents[3] / "test-projects" / "integration"


def tops(*pairs):
    return [{"value": v, "share": s} for v, s in pairs]


def card(column, role, cardinality, model="trips", **extra):
    return {"model": model, "column": column, "role": role, "cardinality": cardinality, **extra}


def shape(raw):
    return ShapeCard(**{k: v for k, v in raw.items() if k != "model"})


COMPANY_SHARES = [0.3, 0.2, 0.15, 0.1, 0.07, 0.03, 0.02, 0.02, 0.02, 0.02]
COMPANY_SHARES += [0.01] * 6 + [0.005, 0.005, 0.0, 0.0]

TRIP_ID = card("trip_id", "identifier", 100_000)
PICKUP = card(
    "pickup_at",
    "time",
    730,
    time_grain="day",
    time_span_points=730,
    stats={"min": "2023-01-01", "max": "2024-12-31"},
)
BOROUGH = card(
    "borough",
    "geo_region",
    5,
    geo_kind="custom",
    top_n=tops(
        ("Manhattan", 0.6), ("Brooklyn", 0.2), ("Queens", 0.12), ("Bronx", 0.06), ("SI", 0.02)
    ),
)
PAYMENT = card(
    "payment_type",
    "categorical",
    4,
    top_n=tops(("card", 0.26), ("cash", 0.25), ("dispute", 0.25), ("free", 0.24)),
)
COMPANY = card(
    "company",
    "categorical",
    20,
    top_n=[{"value": chr(65 + i), "share": s} for i, s in enumerate(COMPANY_SHARES)],
)
ZONE = card("pickup_zone", "categorical", 263)
AIRPORT = card("is_airport", "boolean", 2, top_n=tops((False, 0.9), (True, 0.1)))
FARE = card(
    "fare_amount",
    "numeric_continuous",
    5000,
    additive=True,
    stats={"min": 0, "max": 500, "mean": 15, "median": 11, "stddev": 12, "skew": 3.2, "p99": 70},
)
TOTAL = card(
    "total_amount",
    "numeric_continuous",
    6000,
    additive=True,
    stats={"min": 0, "max": 600, "mean": 19, "median": 14, "stddev": 14, "skew": 2.9, "p99": 85},
)
DISTANCE = card(
    "trip_distance",
    "numeric_continuous",
    3000,
    additive=True,
    stats={"min": 0, "max": 60, "mean": 3, "median": 2.8, "stddev": 4, "skew": 0.4, "p99": 12},
)
TAXI = [TRIP_ID, PICKUP, BOROUGH, PAYMENT, COMPANY, ZONE, AIRPORT, FARE, TOTAL, DISTANCE]

DAILY = [[f"2024-01-{d:02d}", 100 + 30 * math.sin(2 * math.pi * d / 7) + d] for d in range(1, 29)]
STATS = {
    "groups": [
        {
            "by": "borough",
            "metric": "total_fare_amount",
            "rows": [
                ["Manhattan", 1000],
                ["Brooklyn", 120],
                ["Queens", 60],
                ["Bronx", 30],
                ["SI", 5],
            ],
        },
        {
            "by": "payment_type",
            "metric": "total_fare_amount",
            "rows": [["card", 500], ["cash", 420], ["dispute", 380], ["free", 460]],
        },
        {"by": "pickup_at", "metric": "trips_count", "grain": "day", "rows": DAILY},
    ],
    "correlations": [
        {"columns": ["fare_amount", "total_amount"], "r": 0.98},
        {"columns": ["trip_distance", "fare_amount"], "r": 0.9},
    ],
}


def names(result, key):
    return {p["name"]: p for p in result["semantic_layer"][key]}


def by_intent(result, intent):
    return [c for c in result["candidates"] if c["intent"] == intent]


def dims_read(result):
    return {d for c in result["candidates"] for d in c["dimensions"]}


class TestTheSemanticLayer:
    def test_a_heavy_tailed_amount_is_summed_and_medianed_never_averaged(self):
        metrics = names(score_candidates(TAXI), "metrics")
        assert metrics["total_fare_amount"]["expression"] == "SUM(fare_amount)"
        assert metrics["median_fare_amount"]["expression"] == "MEDIAN(fare_amount)"
        assert "avg_fare_amount" not in metrics

    def test_a_boolean_is_a_rate(self):
        metrics = names(score_candidates(TAXI), "metrics")
        assert (
            metrics["airport_rate"]["expression"] == "AVG(CASE WHEN is_airport THEN 1 ELSE 0 END)"
        )

    def test_every_proposal_validates_against_the_project_models(self):
        result = score_candidates(TAXI, STATS)
        for proposal in result["semantic_layer"]["metrics"]:
            Metric(**{k: v for k, v in proposal.items() if k != "model"})
        for proposal in result["semantic_layer"]["dimensions"]:
            Dimension(**{k: v for k, v in proposal.items() if k != "model"})
        assert result["semantic_layer"]["dimensions"]

    def test_an_identifier_is_counted_distinct_and_never_a_dimension(self):

        doc = rules.load_insight_design()

        cards = [shape(c) for c in TAXI]
        proposed = _propose_metrics("trips", cards, doc, _Layer("duckdb", {}), [])
        assert any(
            p.expression == "COUNT(DISTINCT trip_id)" and p.name == "trip_count" for p in proposed
        )
        result = score_candidates(TAXI, STATS)
        assert "trip_id" not in dims_read(result)
        assert result["detail_table"]["key"] == "trip_id"

    def test_two_time_columns_give_a_duration(self):

        cards = [
            ShapeCard(
                column="pickup_at",
                role="time",
                cardinality=900,
                time_grain="minute",
                stats={"min": "2024-01-01 00:00"},
            ),
            ShapeCard(
                column="dropoff_at",
                role="time",
                cardinality=900,
                time_grain="minute",
                stats={"min": "2024-01-01 00:09"},
            ),
        ]
        proposed = _propose_metrics(
            "trips", cards, rules.load_insight_design(), _Layer("duckdb", {}), []
        )
        duration = next(p for p in proposed if p.agg == "avg")
        assert duration.expression == "AVG(DATE_DIFF('MINUTE', pickup_at, dropoff_at))"
        Metric(name=duration.name, expression=duration.expression)

    def test_expressions_follow_the_dialect(self):
        result = score_candidates(TAXI, dialect="postgres")
        metrics = names(result, "metrics")
        assert "PERCENTILE_CONT(0.5)" in metrics["median_fare_amount"]["expression"]

    def test_names_never_collide_with_a_column_or_across_models(self):
        cards = [
            card("total_revenue", "numeric_continuous", 100, model="a", additive=False),
            card("avg_total_revenue", "numeric_continuous", 100, model="a", additive=False),
            card("units", "numeric_continuous", 100, model="b", additive=True),
            card("units", "numeric_continuous", 100, model="c", additive=True),
        ]

        layer = _Layer("duckdb", {"a": {"total_revenue", "avg_total_revenue"}})
        doc = rules.load_insight_design()
        a = _propose_metrics(
            "a",
            [shape(c) for c in cards[:2]],
            doc,
            layer,
            [],
        )
        b = _propose_metrics(
            "b",
            [ShapeCard(column="units", role="numeric_continuous", cardinality=100, additive=True)],
            doc,
            layer,
            [],
        )
        c = _propose_metrics(
            "c",
            [ShapeCard(column="units", role="numeric_continuous", cardinality=100, additive=True)],
            doc,
            layer,
            [],
        )
        assert "avg_total_revenue_metric" in {p.name for p in a}
        assert "total_units" in {p.name for p in b} and "c_total_units" in {p.name for p in c}

    def test_unknown_additivity_is_called_out(self):
        result = score_candidates([card("value", "numeric_continuous", 50)])
        assert any("additivity unknown for value" in w for w in result["warnings"])

    def test_a_shared_key_proposes_a_relation(self):
        cards = [
            card("order_id", "identifier", 500, model="orders"),
            card("users_id", "numeric_discrete", 20, model="orders"),
            card("id", "identifier", 300, model="users"),
            card("order_id", "identifier", 500, model="refunds"),
        ]
        relations = score_candidates(cards)["semantic_layer"]["relations"]
        conditions = {r["condition"] for r in relations}
        assert "${ref(orders).users_id} = ${ref(users).id}" in conditions
        assert "${ref(orders).order_id} = ${ref(refunds).order_id}" in conditions
        for relation in relations:
            Relation(**relation)


class TestGoldenCases:
    def test_a_concentrated_twenty_value_column_becomes_a_top_five_dimension(self):
        result = score_candidates(TAXI)
        dims = names(result, "dimensions")
        assert "top5_company" in dims and "'Other'" in dims["top5_company"]["expression"]
        company = [c for c in result["candidates"] if "top5_company" in c["dimensions"]]
        assert company and company[0]["transforms"] == ["top_n_other"]
        assert all("company" not in c["input_candidates"] for c in result["candidates"])

    def test_a_263_value_zone_is_an_input_and_a_detail_column_never_a_split(self):
        result = score_candidates(TAXI)
        assert "pickup_zone" not in dims_read(result)
        charts = [c for c in result["candidates"] if c["intent"] != "kpi"]
        assert all("pickup_zone" in c["input_candidates"] for c in charts)
        assert "pickup_zone" in result["detail_table"]["columns"]

    def test_two_years_of_days_trend_by_week(self):
        trend = by_intent(score_candidates(TAXI), "trend")[0]
        assert trend["transforms"] == ["regrain"] and trend["dimensions"] == ["pickup_at_week"]
        card_ = trend["request"]["dimensions"][0]
        assert card_["time_grain"] == "week" and 12 <= card_["time_span_points"] <= 400

    def test_a_weekly_rhythm_yields_a_weekday_candidate(self):
        result = score_candidates(TAXI, STATS)
        weekday = [c for c in result["candidates"] if "pickup_at_weekday" in c["dimensions"]]
        assert weekday and weekday[0]["signals"]["lag"] == 7 and weekday[0]["score"] > 0.6
        assert (
            names(result, "dimensions")["pickup_at_weekday"]["expression"] == "DAYOFWEEK(pickup_at)"
        )

    def test_fare_against_total_is_derived_so_no_scatter(self):
        result = score_candidates(TAXI, STATS)
        scatters = by_intent(result, "relationship")
        assert all(set(s["dimensions"]) != {"fare_amount", "total_amount"} for s in scatters)
        assert any("likely computed" in w for w in result["warnings"])

    def test_distance_against_fare_is_a_relationship(self):
        scatter = by_intent(score_candidates(TAXI, STATS), "relationship")
        assert scatter and scatter[0]["dimensions"] == ["trip_distance", "fare_amount"]
        assert scatter[0]["signals"]["r"] == 0.9

    def test_a_loose_relationship_is_compared_across_bands(self):
        stats = {"correlations": [{"columns": ["trip_distance", "total_amount"], "r": 0.3}]}
        result = score_candidates([DISTANCE, TOTAL], stats, intent="compare")
        banded = [c for c in result["candidates"] if c["transforms"] == ["bucket"]]
        assert banded and banded[0]["dimensions"] == ["trip_distance_bucket"]
        assert names(result, "dimensions")["trip_distance_bucket"]["expression"].startswith(
            "FLOOR("
        )

    def test_a_weak_relationship_is_not_compared_across_bands(self):
        stats = {"correlations": [{"columns": ["trip_distance", "total_amount"], "r": 0.2}]}
        result = score_candidates([DISTANCE, TOTAL], stats, intent="compare")
        assert all(c["transforms"] != ["bucket"] for c in result["candidates"])

    def test_the_borough_spread_ranks_above_the_payment_type_spread(self):
        result = score_candidates(TAXI, STATS)
        read = [d for c in result["candidates"] for d in c["dimensions"]]
        assert "borough" in read
        assert "payment_type" not in read

    def test_the_portfolio_has_a_kpi_trend_two_breakdowns_a_spread_and_a_table(self):
        result = score_candidates(TAXI, STATS)
        intents = [c["intent"] for c in result["candidates"]]
        assert intents[0] == "kpi" and "trend" in intents
        breakdowns = [
            c
            for c in result["candidates"]
            if c["intent"] in ("compare", "composition", "geo", "rank")
        ]
        assert len(breakdowns) >= 2
        assert len({tuple(b["dimensions"]) for b in breakdowns}) == len(breakdowns)
        assert {"distribution", "relationship"} & set(intents)
        assert result["detail_table"] is not None
        assert len(result["candidates"]) + 1 <= rules.load_insight_design().portfolio.max_candidates
        families = [c["family"] for c in result["candidates"]]
        assert families.count("bar") <= 2

    def test_build_something_interesting_never_yields_five_bars(self):
        cards = [
            card(f"c{i}", "categorical", 5, top_n=tops(*[(v, 0.2) for v in "abcde"]))
            for i in range(6)
        ]
        cards += [FARE, PICKUP]
        families = [c["family"] for c in score_candidates(cards)["candidates"]]
        assert families.count("bar") < 5 and len(set(families)) >= 4

    def test_the_kpi_set_holds_one_metric_of_each_kind(self):
        kpi = by_intent(score_candidates(TAXI), "kpi")[0]
        assert kpi["metrics"] == [
            "trips_count",
            "total_fare_amount",
            "airport_rate",
            "median_fare_amount",
        ]
        assert kpi["delta_by"] == "pickup_at"

    def test_the_trend_is_the_hero_unless_the_user_asked_for_something(self):
        result = score_candidates(TAXI)
        assert [c["intent"] for c in result["candidates"] if c.get("hero")] == ["trend"]
        asked = score_candidates(TAXI, STATS, intent="distribution")
        hero = [c for c in asked["candidates"] if c.get("hero")]
        assert hero[0]["intent"] == "distribution"
        assert asked["candidates"][1]["intent"] == "distribution"
        kpi = score_candidates(TAXI, intent="kpi")
        assert [c["intent"] for c in kpi["candidates"] if c.get("hero")] == ["kpi"]

    def test_an_intent_nothing_fits_is_warned_about(self):
        result = score_candidates([card("region", "categorical", 4)], intent="relationship")
        assert any("no candidate fits intent 'relationship'" in w for w in result["warnings"])

    def test_composition_collapses_rare_values(self):
        shares = tops(("a", 0.5), ("b", 0.3), ("c", 0.15), ("d", 0.04), ("e", 0.005), ("f", 0.005))
        cards = [card("segment", "categorical", 6, top_n=shares)]
        result = score_candidates(cards, intent="composition")
        pie = by_intent(result, "composition")[0]
        assert pie["transforms"] == ["collapse_rare"] and pie["dimensions"] == ["segment_grouped"]
        assert pie["request"]["semantics"] == {"part_of_whole": True}
        expression = names(result, "dimensions")["segment_grouped"]["expression"]
        assert "'e'" not in expression and "'d'" in expression

    def test_a_short_history_is_a_kpi_delta_not_a_trend(self):
        short = card("day", "time", 9, time_grain="day", time_span_points=9)
        result = score_candidates([short, FARE])
        assert not by_intent(result, "trend")
        assert any("fewer than a trend needs (12)" in w for w in result["warnings"])

    def test_constant_and_text_columns_are_dropped_with_a_reason(self):
        cards = [
            card("k", "categorical", 1),
            card("note", "text", 5000),
            card("lat", "geo_point", 900),
            FARE,
        ]
        dropped = {d["column"]: d["why"] for d in score_candidates(cards)["dropped"]}
        assert set(dropped) == {"k", "note", "lat"}

    def test_lat_and_lon_make_a_point_map(self):
        cards = [card("pickup_lat", "geo_point", 900), card("pickup_lon", "geo_point", 900)]
        result = score_candidates(cards, intent="geo")
        assert by_intent(result, "geo")[0]["dimensions"] == ["pickup_lat", "pickup_lon"]

    def test_many_regions_make_a_map_and_an_input(self):
        result = score_candidates([card("state", "geo_region", 50, geo_kind="us_state"), FARE])
        maps = [c for c in result["candidates"] if c["family"] == "geo_region"]
        assert maps and maps[0]["dimensions"] == ["state"]

    def test_a_flat_metric_is_not_a_candidate(self):
        stats = {
            "groups": [
                {"by": "payment_type", "metric": "trips_count", "rows": [["a", 5], ["b", 5]]}
            ]
        }
        result = score_candidates([PAYMENT], stats)
        assert all("payment_type" not in c["dimensions"] for c in result["candidates"])

    def test_two_categoricals_pair_as_a_heatmap_or_a_pivot(self):
        cards = [
            card("a", "categorical", 7),
            card("b", "categorical", 6),
            card("z", "categorical", 90),
        ]

        doc = rules.load_insight_design()

        layer = _Layer("duckdb", {})
        parsed = [shape(c) for c in cards]
        m = _Model("t", parsed, doc, rules.load_interactivity(), layer, [])
        families = {c.name: c.family for c in _Builder(doc, Stats(), layer).cross_tabs(m)}
        assert families["t_count_by_a_and_b"] == "heatmap"
        assert families["t_count_by_a_and_z"] == "table_pivot"


class TestRequests:
    def test_every_candidate_carries_a_valid_recommend_request(self):
        result = score_candidates(TAXI, STATS)
        for cand in result["candidates"]:
            request = RecommendRequest(**cand["request"])
            assert request.intent == cand["intent"]
            assert [m.name for m in request.metrics] == cand["metrics"]
            assert request.context.model == "trips"
        RecommendRequest(**result["detail_table"]["request"])

    def test_requests_trim_long_top_value_lists(self):
        result = score_candidates(TAXI)
        for cand in result["candidates"]:
            for dim in cand["request"].get("dimensions", []):
                assert len(dim.get("top_n", [])) <= 7

    def test_stats_wanted_name_the_queries_to_run_and_skip_what_was_given(self):
        wanted = score_candidates(TAXI)["stats_wanted"]
        assert {
            "model": "trips",
            "metric": "total_fare_amount",
            "expression": "SUM(fare_amount)",
            "by": "pickup_at",
            "grain": "week",
            "by_expression": "DATE_TRUNC('WEEK', pickup_at)",
        } in wanted
        assert any(w.get("correlation") == ["fare_amount", "total_amount"] for w in wanted)
        again = score_candidates(TAXI, STATS)["stats_wanted"]
        given = {("borough", "total_fare_amount"), ("payment_type", "total_fare_amount")}
        given.add(("pickup_at", "trips_count"))
        asked = {(w["by"], w["metric"]) for w in again if isinstance(w.get("by"), str)}
        assert not asked & given
        assert all(w.get("correlation") != ["fare_amount", "total_amount"] for w in again)

    def test_a_stat_for_another_model_does_not_satisfy_this_one(self):
        rows = [["card", 1], ["cash", 2]]
        other = {"groups": [{"model": "fares", "by": "payment_type", "metric": "m", "rows": rows}]}
        wanted = score_candidates([PAYMENT], other)["stats_wanted"]
        assert any(w.get("by") == "payment_type" for w in wanted)

    def test_a_trend_stat_is_asked_for_at_a_grain_the_query_cap_allows(self):
        wanted = score_candidates([PICKUP, FARE], max_rows=200)["stats_wanted"]
        assert next(w for w in wanted if w.get("by") == "pickup_at")["grain"] == "week"
        daily = card("at", "time", 150, time_grain="day", time_span_points=150)
        assert (
            next(w for w in score_candidates([daily], max_rows=200)["stats_wanted"])["grain"]
            == "day"
        )

    def test_a_sparse_axis_is_regrained_by_its_span_not_its_distinct_values(self):
        sparse = card(
            "pickup_at",
            "time",
            97_000,
            time_grain="second",
            time_span_points=97_000,
            stats={"min": "2024-01-01 00:00:05", "max": "2024-01-31 23:59:50"},
        )
        result = score_candidates([sparse, FARE], max_rows=200)
        assert (
            next(w for w in result["stats_wanted"] if w.get("by") == "pickup_at")["grain"] == "day"
        )
        assert "pickup_at_day" in names(result, "dimensions")

    def test_query_source_rows_are_accepted_as_dicts(self):
        stats = {
            "groups": [
                {
                    "by": "borough",
                    "metric": "trips_count",
                    "rows": [{"borough": "M", "n": 900}, {"borough": "B", "n": 100}, "junk"],
                }
            ]
        }
        result = score_candidates([BOROUGH], stats)
        cand = next(
            c
            for c in result["candidates"]
            if c["dimensions"] == ["borough"] and c["intent"] == "geo"
        )
        assert cand["signals"]["cov"] == pytest.approx(0.8)

    def test_pairs_without_r_are_correlated_here(self):
        pairs = [[x, 2 * x + (4 if x % 2 else -4)] for x in range(10)]
        stats = {"correlations": [{"columns": ["trip_distance", "fare_amount"], "pairs": pairs}]}
        result = score_candidates([DISTANCE, FARE], stats, intent="relationship")
        scatter = by_intent(result, "relationship")
        assert 0.5 < scatter[0]["signals"]["r"] < 0.95

    def test_a_trend_with_stats_is_measured_and_split_by_its_best_few_column(self):
        rising = [[f"2024-{m:02d}-01", 100 * m] for m in range(1, 13)]
        rising[5][1] = 5000
        monthly = card("month", "time", 24, time_grain="month", time_span_points=24)
        region = card(
            "region", "categorical", 4, top_n=tops(("n", 0.7), ("s", 0.1), ("e", 0.1), ("w", 0.1))
        )
        stats = {"groups": [{"by": "month", "metric": "trips_count", "rows": rising}]}
        result = score_candidates([monthly, region], stats, intent="trend")
        trend = by_intent(result, "trend")[0]
        assert trend["dimensions"] == ["month"] and trend["signals"]["r2"] == pytest.approx(1)
        assert trend["signals"]["anomalies"] == 1 and "outliers worth a highlight" in trend["why"]
        doc, layer = rules.load_insight_design(), _Layer("duckdb", {})
        m = _Model(
            "trips", [shape(monthly), shape(region)], doc, rules.load_interactivity(), layer, []
        )
        pool = _Builder(doc, Stats(**stats), layer).trends(m)
        split = next(c for c in pool if [d.raw.column for d in c.dims] == ["month", "region"])
        assert split.why.endswith("split by region") and split.score <= trend["score"]


class TestTheIntegrationProject:
    @pytest.fixture
    def cards(self, tmp_path):
        shutil.copy(INTEGRATION / "test.duckdb", tmp_path / "test.duckdb")
        source = DuckdbSourceFactory(database=str(tmp_path / "test.duckdb"))
        models = {
            m["name"]: m
            for m in yaml.safe_load((INTEGRATION / "models.visivo.yml").read_text())["models"]
        }
        service = ProfilingService(str(tmp_path))
        out = []
        for name in ("sales_data", "table_dates", "daily_metrics"):
            profile = service.profile_query(source, models[name]["sql"])
            out += [{"model": name, **c} for c in service.shape_cards(profile)]
        return out

    def test_its_portfolio_spans_four_or_more_intents_and_families(self, cards):
        result = score_candidates(cards)
        assert len({c["intent"] for c in result["candidates"]}) >= 4
        assert len({c["family"] for c in result["candidates"]}) >= 4

    def test_its_identifier_yields_the_detail_table(self, cards):
        detail = score_candidates(cards)["detail_table"]
        assert detail["model"] == "table_dates" and detail["key"] == "n"
        assert detail["columns"][0] == "n"

    def test_its_proposals_validate(self, cards):
        result = score_candidates(cards)
        for proposal in result["semantic_layer"]["metrics"]:
            Metric(**{k: v for k, v in proposal.items() if k != "model"})
        for proposal in result["semantic_layer"]["dimensions"]:
            Dimension(**{k: v for k, v in proposal.items() if k != "model"})


class TestBounds:
    def test_cards_must_be_a_list_of_modelled_cards(self):
        with pytest.raises(CandidatesError, match="non-empty list"):
            score_candidates([])
        with pytest.raises(CandidatesError, match="model"):
            score_candidates([{"column": "x", "role": "time", "cardinality": 3}])
        with pytest.raises(CandidatesError, match="more than 80"):
            score_candidates([card(f"c{i}", "categorical", 3) for i in range(81)])

    def test_oversized_stats_are_refused_readably(self):
        big = {"groups": [{"by": "b", "metric": "m", "rows": [[i, i] for i in range(201)]}]}
        with pytest.raises(CandidatesError, match="201 rows, more than 200"):
            score_candidates([PAYMENT], big, max_rows=200)
        many = {"groups": [{"by": "b", "metric": "m"}] * 41}
        with pytest.raises(CandidatesError, match="41 stat groups"):
            score_candidates([PAYMENT], many)
        corr = {"correlations": [{"columns": ["a", "b"]}] * 21}
        with pytest.raises(CandidatesError, match="21 correlations"):
            score_candidates([PAYMENT], corr)
        pairs = {"correlations": [{"columns": ["a", "b"], "pairs": [[1, 2]] * 201}]}
        with pytest.raises(CandidatesError, match="pass r"):
            score_candidates([PAYMENT], pairs, max_rows=200)
        with pytest.raises(CandidatesError, match="must be an object"):
            score_candidates([PAYMENT], ["x"])

    def test_already_parsed_inputs_are_accepted(self):

        result = score_candidates([InputCard(**PAYMENT)], Stats())
        assert result["candidates"][0]["intent"] == "kpi"

    def test_choose_respects_its_room(self):
        result = score_candidates(TAXI)
        assert len(result["candidates"]) <= 6
        assert choose([], None, rules.load_insight_design(), room=0) == ([], None)


class TestTheTool:
    def test_it_is_registered_and_bounded(self, integration_app):
        assert "score_candidates" in tools.TOOLS
        result = tools.call(integration_app, "score_candidates", {"cards": TAXI, "stats": STATS})
        assert result["candidates"][0]["intent"] == "kpi"
        assert any("DuckDB SQL" in w for w in result["warnings"])
        with pytest.raises(tools.ToolError, match="non-empty list"):
            tools.call(integration_app, "score_candidates", {"cards": []})
        big = {"groups": [{"by": "b", "metric": "m", "rows": [[i, i] for i in range(201)]}]}
        with pytest.raises(tools.ToolError, match="more than 200"):
            tools.call(integration_app, "score_candidates", {"cards": [PAYMENT], "stats": big})
        with pytest.raises(tools.ToolError, match=r"score_candidates: groups\.0\.by"):
            tools.call(
                integration_app, "score_candidates", {"cards": [PAYMENT], "stats": {"groups": [{}]}}
            )

    def test_models_are_profiled_into_cards(self, integration_app):
        sqlite = integration_app.project.sources[0].name
        sql = "select 'cash' as payment_type, 12.5 as fare_amount union all select 'card', 20.0"
        config = {"name": "trips", "sql": sql, "source": f"ref({sqlite})"}
        tools.call(integration_app, "write_model", {"config": config})

        result = tools.call(integration_app, "score_candidates", {"models": ["trips"]})

        assert result["candidates"]
        assert {m["model"] for m in result["semantic_layer"]["metrics"]} == {"trips"}
        assert not any("DuckDB SQL" in w for w in result["warnings"])

    def test_models_and_cards_are_checked(self, integration_app):
        with pytest.raises(tools.ToolError, match="Pass 'models'"):
            tools.call(integration_app, "score_candidates", {})
        with pytest.raises(tools.ToolError, match="list of model names"):
            tools.call(integration_app, "score_candidates", {"models": "trips"})
        with pytest.raises(tools.ToolError, match="list of shape cards"):
            tools.call(integration_app, "score_candidates", {"models": [], "cards": PAYMENT})
        with pytest.raises(tools.ToolError, match="No model named 'ghost'"):
            tools.call(integration_app, "score_candidates", {"models": ["ghost"]})

    def test_a_source_sets_the_dialect(self, integration_app):
        name = integration_app.project.sources[0].name
        result = tools.call(integration_app, "score_candidates", {"cards": TAXI, "source": name})
        assert not any("DuckDB SQL" in w for w in result["warnings"])
        metrics = names(result, "metrics")
        assert "median_fare_amount" not in metrics and "avg_fare_amount" in metrics
        assert any("sqlite has no median" in w for w in result["warnings"])
        with pytest.raises(tools.ToolError, match="No source named"):
            tools.call(integration_app, "score_candidates", {"cards": TAXI, "source": "nope"})

    def test_each_model_uses_its_own_sources_dialect(self, integration_app):
        sqlite = integration_app.project.sources[0].name
        tools.call(
            integration_app,
            "write_source",
            {"config": {"name": "warehouse", "type": "duckdb", "database": "w.duckdb"}},
        )
        for model, source in (("trips", sqlite), ("rides", "warehouse")):
            config = {"name": model, "sql": "select 1 as x", "source": f"ref({source})"}
            tools.call(integration_app, "write_model", {"config": config})
        cards = [PICKUP, FARE] + [{**c, "model": "rides"} for c in (PICKUP, FARE)]
        weekly = [[f"2024-W{w:02d}", 100 + 10 * w] for w in range(1, 30)]
        groups = [
            {"model": m, "by": "pickup_at", "metric": metric, "rows": weekly}
            for m, metric in (("trips", "total_fare_amount"), ("rides", "rides_total_fare_amount"))
        ]
        result = tools.call(
            integration_app, "score_candidates", {"cards": cards, "stats": {"groups": groups}}
        )
        weeks = {
            d["model"]: d["expression"]
            for d in result["semantic_layer"]["dimensions"]
            if "pickup_at" in d["expression"]
        }
        assert weeks == {
            "trips": "DATE(pickup_at, 'weekday 0', '-6 days')",
            "rides": "DATE_TRUNC('WEEK', pickup_at)",
        }
        assert not any("DuckDB SQL" in w for w in result["warnings"])

    def test_a_model_without_a_source_uses_the_default_sources_dialect(self, integration_app):
        integration_app.project.defaults = DefaultsFactory(
            source_name=integration_app.project.sources[0].name
        )
        config = {"name": "trips", "sql": "select 1 as x"}
        tools.call(integration_app, "write_model", {"config": config})
        result = tools.call(integration_app, "score_candidates", {"cards": TAXI})
        metrics = names(result, "metrics")
        assert metrics["avg_fare_amount"]["expression"] == "AVG(fare_amount)"
        assert "median_fare_amount" not in metrics
        assert not any("DuckDB SQL" in w for w in result["warnings"])

    def test_the_design_insights_skill_rides_along_once(self, integration_app):
        tools.reset_attachments()
        try:
            with attributed_to("agent", "s1"):
                first = tools.call(integration_app, "score_candidates", {"cards": [PAYMENT]})
                second = tools.call(integration_app, "score_candidates", {"cards": [PAYMENT]})
        finally:
            tools.reset_attachments()
        assert [s["name"] for s in first["skills_attached"]] == ["design-insights"]
        assert "skills_attached" not in second

    def test_every_skill_tool_trigger_names_a_real_tool(self):
        for skill in skills.packaged():
            for tool in skill["tools"]:
                assert tool in tools.TOOLS, f"{skill['name']} attaches to unknown tool {tool}"


class TestEdges:
    def test_an_hourly_series_with_a_daily_rhythm_is_an_hour_by_weekday_grid(self):
        hourly = card("at", "time", 2000, time_grain="hour", time_span_points=2000)
        stats = {"groups": [{"by": "at", "metric": "trips_count", "grain": "day", "rows": DAILY}]}
        result = score_candidates([hourly], stats)
        grid = [c for c in result["candidates"] if c["family"] == "heatmap"]
        assert grid and grid[0]["dimensions"] == ["at_hour", "at_weekday"]
        assert names(result, "dimensions")["at_hour"]["expression"] == 'EXTRACT(HOUR FROM "at")'

    def test_a_monthly_rhythm_is_a_month_of_year_breakdown(self):
        monthly = card("month", "time", 36, time_grain="month", time_span_points=36)
        rows = [
            [f"{2021 + i // 12}-{i % 12 + 1:02d}", 50 + 20 * math.cos(2 * math.pi * i / 12)]
            for i in range(36)
        ]
        stats = {"groups": [{"by": "month", "metric": "trips_count", "rows": rows}]}
        result = score_candidates([monthly], stats)
        assert any(c["dimensions"] == ["month_month"] for c in result["candidates"])

    @pytest.mark.parametrize("a, b", [(90, 80), (229, 12), (1200, 9)])
    def test_cross_tabs_past_the_pivot_limits_are_not_proposed(self, a, b):
        doc = rules.load_insight_design()
        parsed = [
            ShapeCard(column="a", role="categorical", cardinality=a),
            ShapeCard(column="b", role="categorical", cardinality=b),
        ]
        layer = _Layer("duckdb", {})
        m = _Model("t", parsed, doc, rules.load_interactivity(), layer, [])
        assert _Builder(doc, Stats(), layer).cross_tabs(m) == []

    def test_a_long_cross_tab_with_few_columns_is_a_pivot(self):
        doc = rules.load_insight_design()
        parsed = [
            ShapeCard(column="zone", role="categorical", cardinality=229),
            ShapeCard(column="borough", role="categorical", cardinality=11),
        ]
        layer = _Layer("duckdb", {})
        m = _Model("t", parsed, doc, rules.load_interactivity(), layer, [])
        assert [c.family for c in _Builder(doc, Stats(), layer).cross_tabs(m)] == ["table_pivot"]

    def test_correlations_for_another_model_or_unknown_columns_are_ignored(self):
        stats = {
            "correlations": [
                {"model": "other", "columns": ["trip_distance", "fare_amount"], "r": 0.9},
                {"columns": ["trip_distance", "nope"], "r": 0.9},
            ]
        }
        result = score_candidates([DISTANCE, FARE], stats, intent="relationship")
        assert not by_intent(result, "relationship")

    def test_a_loose_relationship_without_bounds_or_a_metric_is_skipped(self):
        bare = card("x", "numeric_continuous", 900, additive=True)
        label = card("y", "categorical", 5)
        stats = {"correlations": [{"columns": ["x", "y"], "r": 0.4}]}
        result = score_candidates([bare, label], stats)
        assert all("bucket" not in c["transforms"] for c in result["candidates"])
        stats = {"correlations": [{"columns": ["trip_distance", "y"], "r": 0.4}]}
        result = score_candidates([DISTANCE, label], stats)
        assert all("bucket" not in c["transforms"] for c in result["candidates"])

    def test_spread_without_positive_values_is_phrased_as_a_cov(self):
        stats = {
            "groups": [
                {"by": "payment_type", "metric": "trips_count", "rows": [["a", -5], ["b", 5]]}
            ]
        }
        result = score_candidates([PAYMENT], stats, intent="compare")
        assert "CoV" in by_intent(result, "compare")[0]["why"]

    def test_a_century_of_seconds_regrains_to_years(self):

        huge = ShapeCard(column="t", role="time", cardinality=10**10, time_grain="second")
        assert _grain_for(huge, 50) == "year"

    def test_every_aggregation_has_a_name_a_description_and_a_node(self):

        for agg in Aggregation.__args__:
            namer, _ = METRICS[agg]
            Metric(name=namer("x"), expression=_agg_node(agg, "x").sql("duckdb"))

    def test_proposals_are_made_once(self):

        layer = _Layer("duckdb", {})
        company = shape(COMPANY)
        first = top_n_other(layer, "trips", company, 5)
        assert top_n_other(layer, "trips", company, 5) is first
        node = exp.Count(this=exp.Star())
        assert layer.metric("trips", "n", node, "d", agg="count") is layer.metric(
            "trips", "n", node, "d", agg="count"
        )


class TestChoose:
    def pool(self, *specs):

        return [
            Candidate(name=n, model="t", intent=i, family=f, reads=[d], score=s)
            for n, i, f, d, s in specs
        ]

    def test_a_family_already_chosen_loses_to_a_fresh_one(self):
        pool = self.pool(
            ("bar_a", "compare", "bar", "a", 0.9),
            ("bar_b", "compare", "bar", "b", 0.85),
            ("grid_c", "compare", "heatmap", "c", 0.6),
        )
        chosen, hero = choose(pool, None, rules.load_insight_design(), room=2)
        assert [c.name for c in chosen] == ["bar_a", "grid_c"] and hero.name == "bar_a"

    def test_a_dimension_already_used_loses_to_a_fresh_one(self):
        pool = self.pool(
            ("bar_a", "compare", "bar", "a", 0.9),
            ("pie_a", "composition", "part_of_whole", "a", 0.8),
            ("grid_c", "compare", "heatmap", "c", 0.6),
        )
        chosen, _ = choose(pool, None, rules.load_insight_design(), room=2)
        assert [c.name for c in chosen] == ["bar_a", "grid_c"]

    def test_a_zero_score_is_never_chosen(self):
        pool = self.pool(("flat", "compare", "bar", "a", 0.0))
        assert choose(pool, None, rules.load_insight_design()) == ([], None)

    def test_three_values_or_a_boolean_are_no_composition(self):
        channel = card("channel", "categorical", 3, top_n=tops(("a", 0.7), ("b", 0.2), ("c", 0.1)))
        result = score_candidates([channel, AIRPORT], intent="composition")
        assert not by_intent(result, "composition")

    def test_a_measured_candidate_under_the_floor_is_left_out(self):
        region = card("region", "categorical", 4)
        flat = [["n", 100], ["s", 101], ["e", 99], ["w", 102]]
        stats = {"groups": [{"by": "region", "metric": "trips_count", "rows": flat}]}
        result = score_candidates([region], stats)
        assert [c["intent"] for c in result["candidates"]] == ["kpi"]
        doc = rules.load_insight_design()
        doc.portfolio.min_score = 0
        result = score_candidates([region], stats, rules=doc)
        assert "trips_count_by_region" in [c["name"] for c in result["candidates"]]

    def test_a_measured_dimension_is_not_outranked_by_an_unmeasured_metric_on_it(self):
        units = card("units", "numeric_continuous", 40, additive=True)
        region = card("region", "categorical", 4)
        modest = [["n", 100], ["s", 150], ["e", 60], ["w", 120]]
        stats = {"groups": [{"by": "region", "metric": "total_units", "rows": modest}]}
        result = score_candidates([region, units, FARE], stats)
        on_region = [c for c in result["candidates"] if "region" in c["dimensions"]]
        assert on_region and all("not measured" not in c["why"] for c in on_region)


TRADE_DATE = card(
    "trade_date",
    "time",
    252,
    time_grain="day",
    time_span_points=252,
    stats={"min": "2023-06-06", "max": "2024-06-05"},
)
CLOSE = card(
    "close",
    "numeric_continuous",
    244,
    stats={"min": 165, "max": 198, "mean": 182, "median": 183, "skew": -0.14, "p99": 197},
)
VOLUME = card(
    "volume",
    "numeric_continuous",
    252,
    additive=True,
    stats={"min": 2e7, "max": 2.4e8, "mean": 6e7, "median": 5.5e7, "skew": 0.77, "p99": 1.4e8},
)


def days(n, start="2023-06-06"):
    import datetime as dt

    first = dt.date.fromisoformat(start)
    return [(first + dt.timedelta(days=i)).isoformat() for i in range(n)]


class TestALevelSeries:
    """A year of a stock: the close falls a sixth and recovers, so a line
    fits R² ≈ 0, and the volume is noise."""

    def stats(self):
        import random

        rng = random.Random(1)
        dates = days(252)
        close = [190 - 30 * math.sin(math.pi * i / 251) + rng.gauss(0, 1.5) for i in range(252)]
        volume = [6e7 + rng.gauss(0, 1.5e7) for _ in range(252)]
        return {
            "groups": [
                {
                    "by": "trade_date",
                    "metric": "avg_close",
                    "grain": "day",
                    "rows": list(zip(dates, close)),
                },
                {
                    "by": "trade_date",
                    "metric": "total_volume",
                    "grain": "day",
                    "rows": list(zip(dates, volume)),
                },
            ]
        }

    def test_the_close_trend_is_asked_for_not_only_the_primary_metric(self):
        wanted = score_candidates([TRADE_DATE, CLOSE, VOLUME])["stats_wanted"]
        over = {w["metric"] for w in wanted if w.get("by") == "trade_date"}
        assert {"total_volume", "avg_close"} <= over

    def test_a_v_shaped_close_is_the_trend(self):
        result = score_candidates([TRADE_DATE, CLOSE, VOLUME], self.stats())
        trend = by_intent(result, "trend")[0]
        assert trend["metrics"] == ["avg_close"] and trend["score"] > 0.5
        assert trend["signals"]["r2"] < 0.1 and "lowest around 2023-" in trend["why"]

    def test_one_trend_is_asked_for_per_column(self):
        wanted = score_candidates([TRADE_DATE, CLOSE, VOLUME])["stats_wanted"]
        over = [w["metric"] for w in wanted if w.get("by") == "trade_date"]
        assert over == ["total_volume", "trips_count", "avg_close"]

    def test_a_split_cannot_lift_a_trend_under_the_floor(self):
        rng = __import__("random").Random(4)
        flat = [[d, 100 + rng.gauss(0, 1)] for d in days(60)]
        region = card("region", "categorical", 3, top_n=tops(("n", 0.8), ("s", 0.15), ("e", 0.05)))
        daily = card("day", "time", 60, time_grain="day", time_span_points=60)
        stats = {
            "groups": [
                {"by": "day", "metric": "trips_count", "grain": "day", "rows": flat},
                {
                    "by": "region",
                    "metric": "trips_count",
                    "rows": [["n", 800], ["s", 150], ["e", 50]],
                },
            ]
        }
        doc, layer = rules.load_insight_design(), _Layer("duckdb", {})
        m = _Model(
            "trips", [shape(daily), shape(region)], doc, rules.load_interactivity(), layer, []
        )
        base, *_, split = _Builder(doc, Stats(**stats), layer).trends(m)
        assert base.score < doc.portfolio.min_score and split.score == base.score

    def test_the_stats_ask_stays_within_what_the_next_call_accepts(self):
        many = [card(f"m{i}", "numeric_continuous", 900, additive=True) for i in range(9)]
        cards = [TRADE_DATE, *many]
        wanted = score_candidates(cards)["stats_wanted"]
        assert len(wanted) == 12 and any("correlation" in w for w in wanted)
        full = {"correlations": [{"columns": [f"m{i}", f"m{i + 1}"], "r": 0.1} for i in range(8)]}
        full["correlations"] += [{"columns": [f"m0", f"m{i}"], "r": 0.1} for i in range(2, 9)]
        full["correlations"] += [{"columns": [f"m1", f"m{i}"], "r": 0.1} for i in range(3, 8)]
        assert len(full["correlations"]) == 20
        again = score_candidates(cards, full)["stats_wanted"]
        assert not any("correlation" in w for w in again)


class TestRobustCorrelations:
    def test_the_correlation_asked_for_clips_both_columns_at_p99(self):
        wanted = score_candidates([DISTANCE, FARE])["stats_wanted"]
        corr = next(w for w in wanted if "correlation" in w)
        assert corr["method"] == "pearson_p99"
        assert corr["expression"] == (
            "CORR(CASE WHEN trip_distance > 12.0 THEN 12.0 ELSE trip_distance END, "
            "CASE WHEN fare_amount > 70.0 THEN 70.0 ELSE fare_amount END)"
        )

    def test_without_corr_the_dialect_is_asked_for_pairs_ranked_here(self):
        wanted = score_candidates([DISTANCE, FARE], dialect="sqlite", max_rows=200)["stats_wanted"]
        corr = next(w for w in wanted if "correlation" in w)
        assert corr == {
            "model": "trips",
            "correlation": ["trip_distance", "fare_amount"],
            "pairs": 200,
            "method": "spearman",
        }

    def test_the_why_says_which_correlation(self):
        clipped = {
            "correlations": [
                {"columns": ["trip_distance", "fare_amount"], "r": 0.86, "method": "pearson_p99"}
            ]
        }
        scatter = by_intent(score_candidates([DISTANCE, FARE], clipped), "relationship")[0]
        assert "clipped at their 99th percentile" in scatter["why"]
        pairs = [[x, 3 * x] for x in range(30)] + [[100_000, 0]]
        ranked = {"correlations": [{"columns": ["trip_distance", "fare_amount"], "pairs": pairs}]}
        scatter = by_intent(score_candidates([DISTANCE, FARE], ranked), "relationship")[0]
        assert "Spearman" in scatter["why"] and scatter["signals"]["r"] > 0.8


MANHATTAN = card(
    "pickup_borough",
    "categorical",
    4,
    top_n=tops(("Manhattan", 0.9), ("Queens", 0.05), ("Brooklyn", 0.04), ("Bronx", 0.01)),
)
PASSENGERS = card(
    "passengers",
    "categorical",
    4,
    top_n=tops(("1", 0.75), ("2", 0.15), ("3", 0.06), ("4", 0.04)),
)
HOUR = card("hour", "categorical", 24, ordered=True)
WEEKDAY = card("weekday", "categorical", 7, top_n=tops(*[(str(d), 1 / 7) for d in range(7)]))
ZONE_OF = {f"z{i}": ["Manhattan", "Queens", "Brooklyn", "Bronx"][i % 4] for i in range(20)}
ZONE = card("zone", "categorical", 20, top_n=[{"value": z, "share": 0.05} for z in ZONE_OF])


def cells(by, rows):
    return {"by": by, "metric": "trips_count", "rows": rows}


class TestCrossTabsScoreTheirInteraction:
    def stats(self):
        borough = {"Manhattan": 0.9, "Queens": 0.05, "Brooklyn": 0.04, "Bronx": 0.01}
        party = {"1": 0.75, "2": 0.15, "3": 0.06, "4": 0.04}
        independent = [[b, p, 1e6 * borough[b] * party[p]] for b in borough for p in party]

        def trips(hour, day):
            peak = 2 if day in ("0", "6") else 8
            return 20 + 200 * math.exp(-((hour - peak) ** 2) / 8)

        grid = [[h, d, trips(h, d)] for h in range(24) for d in map(str, range(7))]
        nested = [[z, b, 1000 + i] for i, (z, b) in enumerate(ZONE_OF.items())]
        return {
            "groups": [
                cells(["pickup_borough", "passengers"], independent),
                cells(["hour", "weekday"], grid),
                cells(["zone", "pickup_borough"], nested),
            ]
        }

    def test_a_dominant_category_no_longer_ranks_a_junk_pair(self):
        result = score_candidates([MANHATTAN, PASSENGERS, HOUR, WEEKDAY, ZONE], self.stats())
        names_ = [c["name"] for c in result["candidates"]]
        assert "trips_count_by_weekday_and_hour" in names_
        assert "trips_count_by_pickup_borough_and_passengers" not in names_
        grid = next(
            c for c in result["candidates"] if c["name"] == "trips_count_by_weekday_and_hour"
        )
        assert "Cramér's V" in grid["why"] and grid["score"] == grid["signals"]["cramers_v"]

    def test_a_column_determining_the_other_is_no_cross_tab(self):
        result = score_candidates([MANHATTAN, ZONE], self.stats(), intent="compare")
        assert all(set(c["dimensions"]) != {"zone", "pickup_borough"} for c in result["candidates"])
        assert any("pickup_borough and zone (λ 1.00)" in w for w in result["warnings"])

    def test_cells_are_asked_for_when_the_cross_tab_fits_the_query_cap(self):
        wanted = score_candidates([MANHATTAN, PASSENGERS, ZONE], max_rows=60)["stats_wanted"]
        crosses = [w["by"] for w in wanted if isinstance(w.get("by"), list)]
        assert ["pickup_borough", "passengers"] in crosses
        assert ["zone", "pickup_borough"] not in crosses and ["passengers", "zone"] not in crosses
        given = score_candidates([MANHATTAN, PASSENGERS], self.stats())["stats_wanted"]
        assert not any(isinstance(w.get("by"), list) for w in given)

    def test_cells_arrive_in_either_order_and_as_dicts(self):
        rows = [
            {"passengers": p, "pickup_borough": b, "n": 10 + 5 * (p == "1") * (b == "Queens")}
            for b in ("Manhattan", "Queens")
            for p in ("1", "2")
        ]
        stats = {"groups": [cells(["passengers", "pickup_borough"], rows)]}
        doc = rules.load_insight_design()
        doc.portfolio.min_score = 0
        result = score_candidates([MANHATTAN, PASSENGERS], stats, rules=doc)
        grid = next(c for c in result["candidates"] if c["family"] == "heatmap")
        assert grid["signals"]["cramers_v"] > 0.05

    def test_a_cross_tab_names_one_or_two_columns(self):
        with pytest.raises(Exception, match="one column or a list of two"):
            Stats(groups=[{"by": ["a", "b", "c"], "metric": "m"}])


class TestSmallerFixes:
    def test_the_kpi_delta_uses_the_trend_grain_not_the_profile_grain(self):
        seconds = card(
            "pickup_at",
            "time",
            97_000,
            time_grain="second",
            time_span_points=97_000,
            stats={"min": "2024-01-01 00:00:05", "max": "2024-01-31 23:59:50"},
        )
        kpi = by_intent(score_candidates([seconds, FARE]), "kpi")[0]
        assert "against the previous day;" in kpi["why"]
        two_days = card(
            "at",
            "time",
            9000,
            time_grain="second",
            time_span_points=9000,
            stats={"min": "2024-01-01 00:00:00", "max": "2024-01-02 23:00:00"},
        )
        kpi = by_intent(score_candidates([two_days, FARE]), "kpi")[0]
        assert "against the previous hour;" in kpi["why"]

    def test_a_constant_column_gets_no_metric(self):
        constant = card(
            "total_kg_all_countries",
            "numeric_discrete",
            1,
            additive=True,
            stats={"min": 2.7e10, "max": 2.7e10, "median": 2.7e10},
        )
        layer = _Layer("duckdb", {})
        doc = rules.load_insight_design()
        proposed = _propose_metrics("t", [shape(constant), shape(FARE)], doc, layer, [])
        assert [p.column for p in proposed if p.column] == ["fare_amount", "fare_amount"]

    def test_a_median_that_half_the_rows_hold_falls_back_to_the_average(self):
        passengers = card(
            "passenger_count",
            "numeric_continuous",
            900,
            additive=True,
            top_n=tops((1, 0.78), (2, 0.14)),
            stats={"min": 0, "max": 9, "mean": 1.34, "median": 1, "skew": 1.2, "p99": 6},
        )
        memory = card(
            "mem_pct",
            "numeric_continuous",
            900,
            stats={"min": 0, "max": 3.7, "median": 0, "skew": 1.13, "p99": 1.5, "zeros_pct": 0.61},
        )
        cards = [shape(c) for c in (passengers, memory, FARE)]
        layer = _Layer("duckdb", {})
        aggs = {
            p.name for p in _propose_metrics("trips", cards, rules.load_insight_design(), layer, [])
        }
        assert {"avg_passenger_count", "avg_mem_pct", "median_fare_amount"} <= aggs
        assert "median_passenger_count" not in aggs and "median_mem_pct" not in aggs

    def test_an_hourly_series_with_a_daily_rhythm_is_an_hour_of_day_breakdown(self):
        hourly = card(
            "at",
            "time",
            168,
            time_grain="hour",
            time_span_points=168,
            stats={"min": "2024-01-01 00:00", "max": "2024-01-07 23:00"},
        )
        rows = [
            [
                f"2024-01-{1 + h // 24:02d} {h % 24:02d}:00",
                100 + 50 * math.sin(2 * math.pi * h / 24),
            ]
            for h in range(168)
        ]
        stats = {"groups": [{"by": "at", "metric": "trips_count", "grain": "hour", "rows": rows}]}
        result = score_candidates([hourly], stats)
        daily = next(c for c in result["candidates"] if c["dimensions"] == ["at_hour"])
        assert daily["signals"]["lag"] == 24 and daily["family"] == "bar"
        two_weeks = hourly | {"cardinality": 336, "time_span_points": 336}
        two_weeks["stats"] = {"min": "2024-01-01 00:00", "max": "2024-01-14 23:00"}
        rows = rows + [
            [f"2024-01-{8 + h // 24:02d} {h % 24:02d}:00", v] for h, (_, v) in enumerate(rows)
        ]
        stats["groups"][0]["rows"] = rows
        grid = [
            c
            for c in score_candidates([two_weeks], stats)["candidates"]
            if c["family"] == "heatmap"
        ]
        assert grid and grid[0]["dimensions"] == ["at_hour", "at_weekday"]


class TestTheSqlRuns:
    """Every expression the tool writes, run on a real SQLite and DuckDB."""

    COLUMNS = ("ordered_at", "done_at", "amount", "units", "region", "member")

    def cards(self):
        at, done, amount, units, region, member = self.COLUMNS
        shares = (("n", 0.5), ("s", 0.3), ("e", 0.15), ("w", 0.04), ("x", 0.006), ("y", 0.004))
        return {
            "at": card(
                at,
                "time",
                2000,
                time_grain="hour",
                time_span_points=2000,
                stats={"min": "2024-01-01 00:00:00", "max": "2024-03-24 07:00:00"},
            ),
            "done": card(
                done, "time", 2000, time_grain="minute", stats={"min": "2024-01-01 00:20"}
            ),
            "amount": card(
                amount,
                "numeric_continuous",
                2000,
                additive=True,
                stats={"min": 0, "max": 900, "mean": 30, "median": 9, "skew": 3, "p99": 400},
            ),
            "units": card(units, "numeric_continuous", 40, stats={"min": 1, "max": 40, "p99": 39}),
            "region": card(region, "categorical", 6, top_n=tops(*shares)),
            "member": card(member, "boolean", 2, top_n=tops((True, 0.6), (False, 0.4))),
        }

    def rows(self):
        import datetime as dt

        start = dt.datetime(2024, 1, 1)
        out = []
        for i in range(2000):
            at = start + dt.timedelta(hours=i, minutes=7 * (i % 3))
            done = at + dt.timedelta(minutes=5 + i % 50)
            region = "nsewxy"[i % 6]
            out.append((at, done, float((i * 37) % 900), 1 + i % 40, region, i % 5 < 3))
        return out

    def connect(self, dialect):
        import sqlite3

        import duckdb

        types = ("{t}", "{t}", "DOUBLE", "INTEGER", "TEXT", "{b}")
        schema = ", ".join(f'"{c}" {t}' for c, t in zip(self.COLUMNS, types))
        if dialect == "sqlite":
            con = sqlite3.connect(":memory:")
            con.execute(f"CREATE TABLE t ({schema.format(t='TEXT', b='INTEGER')})")
            rows = [(a.isoformat(" "), d.isoformat(" "), *rest) for a, d, *rest in self.rows()]
            con.executemany("INSERT INTO t VALUES (?, ?, ?, ?, ?, ?)", rows)
            return con
        con = duckdb.connect()
        con.execute(f"CREATE TABLE t ({schema.format(t='TIMESTAMP', b='BOOLEAN')})")
        con.executemany("INSERT INTO t VALUES (?, ?, ?, ?, ?, ?)", self.rows())
        return con

    def expressions(self, dialect):
        from visivo.agent.charting.candidates import (
            GRAIN_ORDER,
            PART_SIZES,
            bucket,
            clip_p99,
            collapse_rare,
            part_of,
            regrain,
        )

        doc = rules.load_insight_design()
        layer = _Layer(dialect, {})
        raw = self.cards()
        at, amount, region = shape(raw["at"]), shape(raw["amount"]), shape(raw["region"])
        cards = [shape(c) for c in raw.values()]
        metrics = [p.expression for p in _propose_metrics("t", cards, doc, layer, [])]
        dims = {f"regrain_{g}": regrain(layer, "t", at, g).expression for g in GRAIN_ORDER}
        dims.update({u: part_of(layer, "t", at, u).expression for u in PART_SIZES})
        dims["bucket"] = bucket(layer, "t", amount, 10).expression
        dims["clip"] = clip_p99(layer, "t", amount).expression
        dims["top"] = top_n_other(layer, "t", region, 3).expression
        dims["rare"] = collapse_rare(layer, "t", region, 0.02).expression
        wanted = score_candidates(list(raw.values()), dialect=dialect, max_rows=200)
        wanted = wanted["stats_wanted"]
        corr = [w["expression"] for w in wanted if "correlation" in w and "expression" in w]
        dims.update(
            {f"by_{w['grain']}": w["by_expression"] for w in wanted if "by_expression" in w}
        )
        metrics += [w["expression"] for w in wanted if "metric" in w]
        return metrics, dims, corr

    @pytest.mark.parametrize("dialect", ["sqlite", "duckdb"])
    def test_every_metric_dimension_and_stat_query_runs(self, dialect):
        import sqlglot

        con = self.connect(dialect)
        metrics, dims, corr = self.expressions(dialect)
        assert {"by_day", "by_hour", "regrain_quarter", "weekday", "hour", "bucket", "rare"} <= set(
            dims
        )
        assert corr if dialect == "duckdb" else not corr
        for expression in [*metrics, *dims.values(), *corr]:
            again = sqlglot.parse_one(expression, read=dialect).sql(dialect=dialect)
            for sql in {expression, again}:
                if expression in dims.values():
                    query = f"SELECT {sql} AS k, COUNT(*) FROM t GROUP BY 1"
                else:
                    query = f"SELECT {sql} FROM t"
                assert con.execute(query).fetchall(), query
        if dialect == "sqlite":
            assert not any("PERCENTILE_CONT" in m or "MEDIAN" in m for m in metrics)

    def test_both_engines_group_the_same_rows_together(self):
        def groups(dialect):
            con = self.connect(dialect)
            _, dims, _ = self.expressions(dialect)
            out = {}
            for name, expression in dims.items():
                query = f"SELECT COUNT(*) FROM t GROUP BY {expression} ORDER BY 1"
                out[name] = [r[0] for r in con.execute(query).fetchall()]
            return out

        sqlite, duck = groups("sqlite"), groups("duckdb")
        assert sqlite.keys() == duck.keys()
        for name in sqlite:
            if name != "weekday":
                assert sqlite[name] == duck[name], name
        assert sorted(sqlite["weekday"]) == sorted(duck["weekday"])

    def test_postgres_reads_the_weekday_with_extract(self):
        layer = _Layer("postgres", {})
        from visivo.agent.charting.candidates import part_of

        expression = part_of(layer, "t", shape(self.cards()["at"]), "weekday").expression
        assert expression == "EXTRACT(DOW FROM ordered_at)"

    DURATIONS = {
        "duckdb": "AVG(DATE_DIFF('MINUTE', ordered_at, done_at))",
        "sqlite": "AVG(CAST(CAST((STRFTIME('%s', done_at) - STRFTIME('%s', ordered_at)) AS REAL) "
        "/ 60 AS INTEGER))",
        "postgres": "AVG(CAST(EXTRACT(epoch FROM CAST(done_at AS TIMESTAMP) - "
        "CAST(ordered_at AS TIMESTAMP)) / 60 AS BIGINT))",
        "mysql": "AVG(TIMESTAMPDIFF(MINUTE, ordered_at, done_at))",
        "bigquery": "AVG(TIMESTAMP_DIFF(done_at, ordered_at, MINUTE))",
        "snowflake": "AVG(DATEDIFF(MINUTE, ordered_at, done_at))",
        "redshift": "AVG(DATEDIFF(MINUTE, ordered_at, done_at))",
    }

    def duration(self, dialect):
        cards = [shape(self.cards()[k]) for k in ("at", "done")]
        doc = rules.load_insight_design()
        proposals = _propose_metrics("t", cards, doc, _Layer(dialect, {}), [])
        return next(p for p in proposals if "->" in (p.column or "")).expression

    @pytest.mark.parametrize("dialect", sorted(DURATIONS))
    def test_the_duration_counts_minutes_in_every_dialect(self, dialect):
        assert self.duration(dialect) == self.DURATIONS[dialect]

    @pytest.mark.parametrize("dialect", ["sqlite", "duckdb"])
    def test_the_duration_is_the_minutes_between_the_two(self, dialect):
        minutes = self.connect(dialect).execute(f"SELECT {self.duration(dialect)} FROM t")
        assert minutes.fetchone()[0] == 29.5


class TestAwkwardColumnNames(TestTheSqlRuns):
    """Reserved words, a space and mixed case, quoted only where the dialect needs it."""

    COLUMNS = ("at", "order", "TripAmount", "Trip Distance", "group", "select")

    def test_postgres_reads_the_weekday_with_extract(self):
        from visivo.agent.charting.candidates import part_of

        expression = part_of(_Layer("postgres", {}), "t", shape(self.cards()["at"]), "weekday")
        assert expression.expression == 'EXTRACT(DOW FROM "at")'

    DURATIONS = {
        "duckdb": """AVG(DATE_DIFF('MINUTE', "at", "order"))""",
        "sqlite": """AVG(CAST(CAST((STRFTIME('%s', "order") - STRFTIME('%s', "at")) AS REAL) """
        "/ 60 AS INTEGER))",
        "postgres": 'AVG(CAST(EXTRACT(epoch FROM CAST("order" AS TIMESTAMP) - '
        'CAST("at" AS TIMESTAMP)) / 60 AS BIGINT))',
        "mysql": "AVG(TIMESTAMPDIFF(MINUTE, `at`, `order`))",
        "bigquery": "AVG(TIMESTAMP_DIFF(`order`, `at`, MINUTE))",
        "snowflake": 'AVG(DATEDIFF(MINUTE, "AT", "ORDER"))',
        "redshift": 'AVG(DATEDIFF(MINUTE, "at", "order"))',
    }

    @pytest.mark.parametrize(
        "dialect, expected",
        [
            ("duckdb", "SUM(TripAmount)"),
            ("sqlite", "SUM(TripAmount)"),
            ("postgres", 'SUM("TripAmount")'),
            ("snowflake", 'SUM("TripAmount")'),
            ("mysql", "SUM(`TripAmount`)"),
        ],
    )
    def test_case_is_quoted_only_where_the_dialect_folds_it(self, dialect, expected):
        doc = rules.load_insight_design()
        cards = [shape(self.cards()["amount"])]
        proposals = _propose_metrics("t", cards, doc, _Layer(dialect, {}), [])
        assert expected in [p.expression for p in proposals]

    def test_a_plain_lower_case_name_stays_bare_even_where_case_folds(self):
        for dialect in ("postgres", "snowflake", "duckdb"):
            assert _Layer(dialect, {}).sql("t", exp.Sum(this=col("trip_amount"))) == (
                "SUM(trip_amount)"
            )
        assert _Layer("snowflake", {}).sql("t", exp.Sum(this=col("date"))) == 'SUM("DATE")'
        spaced = identifier("trip distance", "snowflake")
        assert spaced.quoted and spaced.name == "trip distance"


PASSENGER_COUNT = card(
    "passenger_count",
    "numeric_discrete",
    8,
    additive=True,
    stats={"min": 0, "max": 9, "mean": 1.4, "median": 1, "skew": 0.4, "p99": 5},
)


def lead_of(cards, stats=None):
    doc, inter = rules.load_insight_design(), rules.load_interactivity()
    m = _Model("trips", [shape(c) for c in cards], doc, inter, _Layer("duckdb", {}), [])
    m.weigh(Stats(**(stats or {})))
    return m


class TestThePrimaryMetric:
    NYC = [PICKUP, PASSENGER_COUNT, BOROUGH, PAYMENT, DISTANCE, FARE, TOTAL]

    def test_a_money_total_leads_although_a_count_column_comes_first(self):
        result = score_candidates(self.NYC)
        asked = {w["metric"] for w in result["stats_wanted"] if isinstance(w.get("by"), list)}
        asked |= {w["metric"] for w in result["stats_wanted"] if w.get("by") == "borough"}
        assert asked == {"total_fare_amount"}
        kpi = by_intent(result, "kpi")[0]
        assert kpi["metrics"][:2] == ["trips_count", "total_fare_amount"]
        assert "total_fare_amount leads: its name says money or volume (amount, fare)" in kpi["why"]

    def test_a_table_whose_only_total_is_a_count_keeps_it(self):
        price = card("fare_amount", "numeric_continuous", 500, additive=False)
        m = lead_of([PICKUP, PASSENGER_COUNT, BOROUGH, price])
        assert m.primary().name == "total_passenger_count"
        assert m.lead_why == "total_passenger_count leads: the only total"

    def test_without_a_total_the_row_count_leads(self):
        m = lead_of([PICKUP, BOROUGH])
        assert m.primary().name == "trips_count"
        assert m.lead_why.endswith("no column adds up")

    def test_two_unnamed_totals_keep_column_order_and_say_so(self):
        a = card("widgets", "numeric_continuous", 50, additive=True)
        b = card("gadgets", "numeric_continuous", 50, additive=True)
        m = lead_of([BOROUGH, a, b])
        assert m.primary().name == "total_widgets"
        assert m.lead_why.endswith("the first total; no name says money or volume")
        stats = {
            "groups": [
                self.borough("total_widgets", [10, 10, 11, 10, 10]),
                self.borough("total_gadgets", [90, 4, 2, 1, 1]),
            ]
        }
        m = lead_of([BOROUGH, a, b], stats)
        assert m.primary().name == "total_gadgets"
        assert (
            m.lead_why == "total_gadgets leads: of the totals, the strongest signal across borough"
        )

    def borough(self, metric, values):
        rows = [[k, v] for k, v in zip(["Manhattan", "Brooklyn", "Queens", "Bronx", "SI"], values)]
        return {"by": "borough", "metric": metric, "rows": rows}

    def test_the_signal_ranks_the_totals_the_name_cannot_separate(self):
        stats = {
            "groups": [
                self.borough("total_fare_amount", [100, 98, 102, 99, 101]),
                self.borough("sum_total_amount", [900, 40, 20, 8, 1]),
            ]
        }
        m = lead_of(self.NYC, stats)
        assert m.primary().name == "sum_total_amount"
        assert m.lead_why == (
            "sum_total_amount leads: its name says money or volume (amount, total); of the "
            "totals named so, the strongest signal across borough"
        )
        sums = [x.name for x in m.chartable() if x.agg == "sum"]
        assert sums[:2] == ["sum_total_amount", "total_fare_amount"]
        cross = score_candidates(self.NYC, stats)["stats_wanted"]
        assert {w["metric"] for w in cross if isinstance(w.get("by"), list)} == {"sum_total_amount"}

    def test_a_signal_never_overrules_the_name(self):
        tip = card("tip_amount", "numeric_continuous", 900, additive=True)
        stats = {
            "groups": [
                self.borough("total_fare_amount", [100, 98, 102, 99, 101]),
                self.borough("total_passenger_count", [900, 40, 20, 8, 1]),
                self.borough("total_tip_amount", [900, 40, 20, 8, 0]),
            ]
        }
        assert lead_of([*self.NYC, tip], stats).primary().name == "total_fare_amount"

    def test_one_measured_total_does_not_overrule_column_order(self):
        stats = {"groups": [self.borough("sum_total_amount", [900, 40, 20, 8, 1])]}
        assert lead_of(self.NYC, stats).primary().name == "total_fare_amount"

    def test_totals_measured_on_different_dimensions_are_not_compared(self):
        stats = {
            "groups": [
                self.borough("sum_total_amount", [900, 40, 20, 8, 1]),
                {"by": "payment_type", "metric": "total_fare_amount", "rows": [["card", 5]]},
                {"by": "pickup_at", "metric": "total_fare_amount", "grain": "day", "rows": DAILY},
                {"model": "other", "by": "borough", "metric": "total_fare_amount", "rows": []},
                {"by": ["borough", "payment_type"], "metric": "total_fare_amount", "rows": []},
            ]
        }
        m = lead_of(self.NYC, stats)
        assert m.primary().name == "total_fare_amount"
        assert m.lead_why.endswith("money or volume (amount, fare)")

    def test_a_trend_key_is_scored_as_a_trend(self):
        noisy = [[d, 50 if i % 2 else 150] for i, (d, _) in enumerate(DAILY)]
        rising = [[d, 100 + i] for i, (d, _) in enumerate(DAILY)]
        stats = {
            "groups": [
                {"by": "pickup_at", "metric": "total_fare_amount", "grain": "day", "rows": noisy},
                {"by": "pickup_at", "metric": "sum_total_amount", "grain": "day", "rows": rising},
            ]
        }
        m = lead_of(self.NYC, stats)
        assert m.primary().name == "sum_total_amount"
        assert m.lead_why.endswith("the strongest signal across pickup_at")

    def test_the_why_of_a_cross_tab_says_why_its_metric_leads(self):
        cand = _Builder(rules.load_insight_design(), Stats(), _Layer("duckdb", {}))
        crosses = cand.cross_tabs(lead_of(self.NYC))
        assert crosses and all(
            c.metrics[0].name == "total_fare_amount" and "leads: its name says money" in c.why
            for c in crosses
        )
