import ast
import math
import random
from pathlib import Path

import pytest
import yaml

from visivo.agent.charting import rules, scoring
from visivo.agent.charting.schema import ShapeCard

FLAT = [10.0] * 28
LINEAR = [float(i) for i in range(1, 29)]
WEEKLY = [100 + 30 * math.sin(2 * math.pi * i / 7) for i in range(28)]
MONTHLY = [50 + 20 * math.cos(2 * math.pi * i / 12) for i in range(36)]
JUNK = [None, float("nan"), float("inf"), "x", {}, []]


def card(column, role, cardinality, **extra):
    return ShapeCard(column=column, role=role, cardinality=cardinality, **extra)


def tops(*shares):
    return [{"value": f"v{i}", "share": s} for i, s in enumerate(shares)]


class TestKnownAnswers:
    def test_a_flat_series_scores_zero_everywhere(self):
        assert scoring.coefficient_of_variation(FLAT) == 0
        assert scoring.variance_score(FLAT) == 0
        assert scoring.trend(FLAT)["score"] == 0
        assert scoring.concentration(FLAT)["score"] == 0
        assert scoring.seasonality(FLAT, "day")["score"] == 0
        assert scoring.anomalies(FLAT)["count"] == 0

    def test_a_linear_series_is_a_strong_trend_and_not_a_cycle(self):
        result = scoring.trend(LINEAR)
        assert result["r2"] == pytest.approx(1.0)
        assert result["score"] == pytest.approx(1.0)
        assert result["run"] == 1.0 and result["slope"] == pytest.approx(1.0)
        assert scoring.seasonality(LINEAR, "day")["score"] < 0.2

    def test_a_falling_series_is_a_trend_too(self):
        assert scoring.trend(list(reversed(LINEAR)))["score"] == pytest.approx(1.0)
        assert scoring.trend(list(reversed(LINEAR)))["change"] < 0

    def test_noise_is_not_a_trend(self):
        rng = random.Random(7)
        noise = [100 + rng.gauss(0, 5) for _ in range(60)]
        assert scoring.trend(noise)["score"] < 0.1

    def test_one_dominant_category_is_concentrated(self):
        dominant = scoring.concentration([900, 20, 20, 20, 20, 20])
        uniform = scoring.concentration([50, 50, 50, 50, 50, 50])
        assert dominant["score"] > 0.7 and dominant["top_share"] > 0.9
        assert uniform["score"] == 0 and uniform["top_share"] == pytest.approx(0.5)
        assert scoring.gini([0, 0, 0, 10]) == pytest.approx(1.0)

    def test_a_weekly_cycle_is_seasonal_at_lag_seven(self):
        result = scoring.seasonality(WEEKLY, "day")
        assert result["lag"] == 7 and result["score"] > 0.6
        rising = [w + 3 * i for i, w in enumerate(WEEKLY)]
        assert scoring.seasonality(rising, "day")["score"] > 0.6

    def test_a_yearly_cycle_is_seasonal_at_lag_twelve(self):
        assert scoring.seasonality(MONTHLY, "month")["lag"] == 12
        assert scoring.seasonality(MONTHLY, "month")["score"] > 0.5
        assert scoring.seasonality(MONTHLY, "week") == {"lag": None, "acf": 0.0, "score": 0.0}

    def test_a_daily_rhythm_in_hourly_data_is_seasonal_at_lag_twenty_four(self):
        hourly = [100 + 40 * math.sin(2 * math.pi * h / 24) for h in range(24 * 7)]
        result = scoring.seasonality(hourly, "hour")
        assert result["lag"] == 24 and result["score"] > 0.8

    def test_a_short_series_has_no_measurable_cycle(self):
        assert scoring.autocorrelation(WEEKLY[:13], 7) == 0
        assert scoring.autocorrelation(WEEKLY, 0) == 0

    def test_one_spike_is_an_anomaly(self):
        spiked = [10.0 + (i % 3) for i in range(40)]
        spiked[17] = 200
        assert scoring.anomalies(spiked) == {"count": 1, "indexes": [17]}

    def test_a_few_bad_days_in_a_month_are_anomalies(self):
        days = [90_000 + 9_000 * math.sin(i) for i in range(31)] + [2, 3, 5, 40]
        assert scoring.anomalies(days)["indexes"] == [31, 32, 33, 34]

    def test_six_bad_days_cannot_hide_behind_each_other(self):
        rng = random.Random(2)
        days = [2.0, 2.0, 2.0, 5.0] + [120_000 + rng.gauss(0, 15_000) for _ in range(31)]
        days += [760.0, 1.0]
        mean = sum(days) / len(days)
        sd = math.sqrt(sum((d - mean) ** 2 for d in days) / len(days))
        assert max(abs(d - mean) / sd for d in days) < 3
        assert scoring.anomalies(days)["indexes"] == [0, 1, 2, 3, 35, 36]

    def test_with_most_points_equal_the_ordinary_z_score_decides(self):
        weeks = [5.0] * 40 + [4.0]
        assert scoring.anomalies(weeks) == {"count": 1, "indexes": [40]}

    def test_the_borough_spread_outranks_the_payment_type_spread(self):
        borough = [1000, 120, 60, 30, 5]
        payment = [500, 420, 380, 460]
        assert scoring.coefficient_of_variation(borough) > 1.2
        assert scoring.coefficient_of_variation(payment) < 0.2
        assert scoring.variance_score(borough) > scoring.variance_score(payment)

    def test_a_signed_metric_has_no_concentration(self):
        assert scoring.gini([-5, 10, 20]) == 0 and scoring.top_share([-5, 10], 1) == 0
        assert scoring.coefficient_of_variation([-5, 5]) == pytest.approx(1.0)


class TestLevelChange:
    """A price that falls then recovers has no straight-line trend; the
    moving average still sees it move."""

    V = [100 - abs(i - 40) * 0.5 for i in range(81)]
    STEP = [100.0] * 30 + [130.0] * 30

    def test_a_v_shape_is_a_strong_trend_a_line_fit_misses(self):
        result = scoring.trend(self.V, "day")
        assert result["r2"] < 0.01 and result["r2"] * abs(result["change"]) < 0.01
        assert result["shape"] == "level" and result["score"] > 0.9
        assert result["low"] in (0, 80) and result["high"] == 40

    def test_a_regime_shift_registers(self):
        result = scoring.trend(self.STEP)
        assert result["shape"] == "level" and result["score"] > 0.9
        assert result["swing"] == pytest.approx(30 / 115, abs=0.02)

    def test_a_noisy_v_still_outscores_noise(self):
        rng = random.Random(3)
        noisy = [v + rng.gauss(0, 2) for v in self.V]
        noise = [100 + rng.gauss(0, 2) for _ in self.V]
        assert scoring.trend(noisy, "day")["score"] > 0.5
        assert scoring.trend(noise, "day")["score"] < 0.1

    @pytest.mark.parametrize("centre", [100, 0])
    def test_flat_noise_stays_near_zero_whatever_its_level(self, centre):
        rng = random.Random(5)
        for grain in ("day", None):
            noise = [centre + rng.gauss(0, 5) for _ in range(120)]
            width = scoring.smoothing_window(grain, len(noise))
            assert scoring.level_change(noise, width)["strength"] < 0.1
            assert scoring.trend(noise, grain)["score"] < 0.1

    def test_a_weekly_cycle_is_averaged_out_at_day_grain(self):
        assert scoring.level_change(WEEKLY, 7)["strength"] == pytest.approx(0, abs=0.05)
        assert scoring.trend(WEEKLY, "day")["score"] < 0.1

    def test_a_small_swing_counts_in_proportion_to_the_material_change(self):
        wobble = [100 + 2 * math.sin(2 * math.pi * i / 40) for i in range(80)]
        result = scoring.trend(wobble, "day")
        assert result["strength"] > 0.9 and result["swing"] < 0.05
        material = rules.load_insight_design().scoring.material_change
        assert result["score"] == pytest.approx(result["strength"] * result["swing"] / material)
        assert result["score"] < 0.25

    def test_a_rise_under_a_weekly_rhythm_still_counts(self):
        rising = [w + 2 * i for i, w in enumerate(WEEKLY)]
        assert scoring.trend(rising, "day")["strength"] > 0.8
        assert scoring.level_change(rising, 7)["strength"] < 0.5
        assert scoring.trend(rising, "day")["score"] > 0.5

    def test_bad_days_at_the_ends_are_no_level_change(self):
        rng = random.Random(9)
        days = [3.0, 5.0] + [90_000 + rng.gauss(0, 2_000) for _ in range(31)] + [2.0, 40.0]
        assert scoring.anomalies(days)["count"] == 4
        assert scoring.trend(days, "day")["score"] < 0.1

    def test_flagged_points_are_bridged_not_dropped(self):
        spiked = [10.0 + (i % 3) for i in range(40)]
        spiked[17] = 200
        first, bridged = scoring.bridged(spiked)
        assert first == 0 and len(bridged) == 40
        assert bridged[17] == pytest.approx((spiked[16] + spiked[18]) / 2)
        ends = [500.0, 480.0] + [10.0 + (i % 3) for i in range(38)] + [500.0]
        assert scoring.bridged(ends) == (2, ends[2:-1])
        assert scoring.bridged(LINEAR) == (0, LINEAR) and scoring.bridged([]) == (0, [])

    def test_the_low_and_high_are_never_a_flagged_point(self):
        series = [1.0, 1.0] + [100 - abs(i - 40) * 0.5 for i in range(81)] + [9e9]
        result = scoring.trend(series, "day")
        assert result["low"] in (2, 82) and result["high"] == 42 and result["score"] > 0.9

    def test_a_series_shorter_than_two_windows_has_no_level_change(self):
        assert scoring.level_change(self.V[:13], 7) == {
            "strength": 0.0,
            "swing": 0.0,
            "low": None,
            "high": None,
        }
        assert scoring.level_change(FLAT, 7)["strength"] == 0

    def test_the_window_grows_with_the_series_in_whole_cycles(self):
        assert scoring.smoothing_window("week", 4) == scoring.MIN_FIT_POINTS
        assert scoring.smoothing_window("week", 252) == 16
        assert scoring.smoothing_window("day", 31) == 7
        assert scoring.smoothing_window("day", 252) == 21
        assert scoring.smoothing_window("hour", 168) == 24


class TestCorrelation:
    def test_a_line_correlates_perfectly(self):
        xs = list(range(20))
        assert scoring.correlation(xs, [2 * x + 1 for x in xs]) == pytest.approx(1.0)
        assert scoring.correlation(xs, [-x for x in xs]) == pytest.approx(-1.0)

    def test_a_constant_column_correlates_with_nothing(self):
        assert scoring.correlation([1, 2, 3, 4], [5, 5, 5, 5]) == 0

    def test_pairs_with_a_missing_side_are_skipped(self):
        xs = [1, 2, None, 4, 5]
        ys = [2, 4, 6, float("nan"), 10]
        assert scoring.correlation(xs, ys) == pytest.approx(1.0)

    def test_fare_against_total_amount_is_discounted_as_derived(self):
        assert scoring.is_derived(0.98) and scoring.is_derived(-0.97)
        assert scoring.correlation_score(0.98) == pytest.approx(0.98 * 0.2)

    def test_distance_against_fare_is_a_relationship(self):
        assert not scoring.is_derived(0.9)
        assert scoring.correlation_score(-0.9) == pytest.approx(0.9)
        assert scoring.correlation_score(0.6, derived=True) == pytest.approx(0.12)


class TestRobustCorrelation:
    def test_one_extreme_row_flips_pearson_not_spearman(self):
        xs = [float(i) for i in range(50)]
        ys = [2 * x + 1 + (3 if i % 2 else -3) for i, x in enumerate(xs)]
        xs.append(100_000.0)
        ys.append(-1_000.0)
        assert scoring.correlation(xs, ys) < -0.9
        assert scoring.rank_correlation(xs, ys) > 0.8

    def test_ties_share_a_rank(self):
        assert scoring.rank_correlation([1, 1, 2, 3], [5, 5, 6, 7]) == pytest.approx(1.0)
        assert scoring.rank_correlation([1, 2, 3, 4], [4, 3, 2, 1]) == pytest.approx(-1.0)

    def test_it_is_total(self):
        assert scoring.rank_correlation(None, None) == 0
        assert scoring.rank_correlation(JUNK, JUNK) == 0
        assert scoring.rank_correlation([1, 2, 3], [4, 4, 4]) == 0


def grid(rows, cols, value):
    return [(a, b, value(a, b)) for a in rows for b in cols]


class TestInteraction:
    BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "Bronx"]
    SHARES = {"Manhattan": 0.9, "Brooklyn": 0.05, "Queens": 0.04, "Bronx": 0.01}

    def test_a_dominant_category_alone_is_no_interaction(self):
        payments = {"card": 0.7, "cash": 0.2, "other": 0.1}
        cells = grid(self.BOROUGHS, payments, lambda a, b: 1e6 * self.SHARES[a] * payments[b])
        result = scoring.interaction(cells)
        assert result["v"] == pytest.approx(0, abs=1e-9) and result["score"] == pytest.approx(0)
        assert not result["dependent"]

    def test_a_weekend_shift_in_the_hourly_shape_is_an_interaction(self):
        def trips(hour, day):
            weekend = day in (0, 6)
            peak = 2 if weekend else 8
            return 100 + 80 * math.exp(-((hour - peak) ** 2) / 8)

        result = scoring.interaction(grid(range(24), range(7), trips))
        assert 0.05 < result["v"] < 0.6 and result["score"] == result["v"]
        assert result["dependence"] < 0.8

    def test_a_column_that_determines_the_other_is_penalised(self):
        zones = {f"z{i}": self.BOROUGHS[i % 4] for i in range(20)}
        cells = [(z, b, 10 + i) for i, (z, b) in enumerate(zones.items())]
        result = scoring.interaction(cells)
        assert result["v"] == pytest.approx(1.0) and result["dependence"] == pytest.approx(1.0)
        assert result["dependent"] and result["score"] == 0
        diagonal = [(c, c, 5) for c in "abcdefghij"]
        assert scoring.interaction(diagonal)["dependent"]

    def test_the_dependence_cut_and_penalty_come_from_the_yaml(self):
        zones = [(f"z{i}", self.BOROUGHS[i % 4], 10) for i in range(20)]
        doc = rules.load_insight_design().scoring
        doc.dependent_lambda = 1.0
        doc.penalties.dependent_pair = 0.5
        assert scoring.interaction(zones, doc)["score"] == pytest.approx(0.5)
        doc.dependent_lambda = 0.99
        partial = zones + [("z0", "Queens", 10)]
        assert not scoring.interaction(partial, doc)["dependent"]

    def test_null_keys_are_missing_data_not_a_category(self):
        cells = grid(["a", "b"], ["x", "y"], lambda a, b: 10)
        cells += [(None, "x", 500), ("a", None, 500)]
        assert scoring.cramers_v(cells) == pytest.approx(0)

    def test_it_is_total(self):
        for cells in (None, [], JUNK, [("a", "x", -1), ("b", "y", 2)], [("a", "x", 3)]):
            assert scoring.interaction(cells)["score"] == 0
            assert scoring.dependence(cells) == 0
        assert scoring.cramers_v([("a", "x", 0), ("b", "y", 0)]) == 0
        one_row = [("a", "x", 1), ("a", "y", 2)]
        assert scoring.cramers_v(one_row) == 0 and scoring.dependence(one_row) == 0
        assert scoring.cramers_v([("a", "x", "n/a"), ("a", "y", 2), ("b", "x", 1)]) >= 0


class TestPenalties:
    def test_a_mostly_null_column_halves_the_score(self):
        factor, why = scoring.penalty([card("tip", "numeric_continuous", 50, null_pct=0.4)])
        assert factor == 0.5 and "40% null" in why[0]
        assert scoring.penalty([card("tip", "numeric_continuous", 50, null_pct=0.3)])[0] == 1

    def test_a_constant_metric_and_a_single_value_zero_it(self):
        assert scoring.penalty([], values=[3, 3, 3])[0] == 0
        assert scoring.penalty([card("k", "categorical", 1)])[0] == 0
        assert scoring.penalty([], values=[3, 4])[0] == 1
        assert scoring.penalty(None, values=[3])[0] == 1


class TestTagging:
    def test_split_below_the_input_bucket_and_input_above_it(self):
        assert scoring.tag_dimension(card("borough", "categorical", 5)) == (
            "split_candidate",
            None,
        )
        assert scoring.tag_dimension(card("zone", "categorical", 263)) == (
            "input_candidate",
            None,
        )
        assert scoring.tag_dimension(card("zone", "geo_region", 60)) == ("input_candidate", None)

    def test_a_concentrated_some_column_stays_a_split_through_top_n_other(self):
        company = card("company", "categorical", 20, top_n=tops(0.3, 0.2, 0.15, 0.1, 0.07, 0.03))
        assert scoring.tag_dimension(company) == ("split_candidate", "top_n_other")
        assert scoring.top_n_keep(company) == 5

    def test_a_flat_some_column_becomes_an_input(self):
        flat = card("company", "categorical", 20, top_n=tops(*[0.05] * 10))
        assert scoring.tag_dimension(flat) == ("input_candidate", None)
        assert scoring.top_n_keep(flat) is None

    def test_top_n_grows_to_its_maximum_before_giving_up(self):
        six = card("c", "categorical", 15, top_n=tops(0.25, 0.2, 0.15, 0.1, 0.08, 0.05, 0.04))
        assert scoring.top_n_keep(six) == 6

    def test_a_flat_column_of_nine_or_ten_values_is_an_input_not_a_top_seven(self):
        for k in (9, 10):
            flat = card("quarter", "categorical", k, top_n=tops(*[1 / k] * k))
            assert scoring.tag_dimension(flat) == ("input_candidate", None)

    def test_roles_that_never_split(self):
        assert scoring.tag_dimension(card("at", "time", 730)) == ("axis", None)
        assert scoring.tag_dimension(card("trip_id", "identifier", 10_000)) == ("key", None)
        assert scoring.tag_dimension(card("note", "text", 5000))[0] == "dropped"
        assert scoring.tag_dimension(card("lat", "geo_point", 5000))[0] == "dropped"
        assert scoring.tag_dimension(card("k", "categorical", 1))[0] == "dropped"
        assert scoring.tag_dimension(card("fare", "numeric_continuous", 900))[0] == "measure"

    def test_the_input_bucket_comes_from_interactivity_yml(self):
        moved = rules.load_interactivity()
        moved.design_rules.input_over_split_min_bucket = "many"
        tagged = scoring.tag_dimension(card("c", "categorical", 15), interactivity=moved)
        assert tagged == ("split_candidate", None)


class TestTotality:
    @pytest.mark.parametrize(
        "fn",
        [
            scoring.coefficient_of_variation,
            scoring.variance_score,
            scoring.longest_monotonic_run,
            scoring.gini,
        ],
    )
    @pytest.mark.parametrize("values", [[], None, JUNK, [5.0]])
    def test_scalar_signals_are_zero_on_nothing(self, fn, values):
        assert fn(values) == 0

    @pytest.mark.parametrize("skew", [None, float("nan"), "x", 0])
    def test_skew_score_is_zero_without_a_skew(self, skew):
        assert scoring.skew_score(skew) == 0

    @pytest.mark.parametrize("values", [[], None, JUNK, [5.0]])
    def test_compound_signals_are_neutral_on_nothing(self, values):
        assert scoring.trend(values)["score"] == 0
        assert scoring.concentration(values)["score"] == 0
        assert scoring.seasonality(values, "day")["score"] == 0
        assert scoring.anomalies(values) == {"count": 0, "indexes": []}
        assert scoring.correlation(values, values) == 0
        assert scoring.correlation_score(None) == 0
        assert scoring.top_share(values, 3) in (0, 1)
        assert scoring.is_constant(values) is False
        assert not scoring.is_derived("x")

    def test_booleans_count_as_numbers(self):
        assert scoring.numbers([True, False, "3", None]) == [1.0, 0.0, 3.0]

    def test_ranges_hold_on_random_series(self):
        rng = random.Random(11)
        for _ in range(200):
            n = rng.randint(0, 60)
            values = [rng.choice([rng.gauss(0, 100), None, float("nan")]) for _ in range(n)]
            assert 0 <= scoring.variance_score(values) < 1
            assert 0 <= scoring.trend(values)["score"] <= 1
            assert 0 <= scoring.trend(values)["r2"] <= 1
            assert 0 <= scoring.longest_monotonic_run(values) <= 1
            assert 0 <= scoring.gini([abs(v) for v in scoring.numbers(values)]) <= 1
            assert -1 <= scoring.autocorrelation(values, 7) <= 1
            assert 0 <= scoring.seasonality(values, "day")["score"] <= 1
            assert -1 <= scoring.correlation(values, values[::-1]) <= 1
            assert -1 <= scoring.rank_correlation(values, values[::-1]) <= 1
            assert 0 <= scoring.trend(values, "day")["strength"] <= 1
            assert 0 <= scoring.skew_score(rng.gauss(0, 3)) < 1


def _yaml_numbers(node):
    if isinstance(node, dict):
        for value in node.values():
            yield from _yaml_numbers(value)
    elif isinstance(node, list):
        for value in node:
            yield from _yaml_numbers(value)
    elif isinstance(node, (int, float)) and not isinstance(node, bool):
        yield node


def test_scoring_hard_codes_no_threshold_that_lives_in_the_yaml():
    doc = yaml.safe_load((rules.RULES_DIR / "insight_design.yml").read_text())
    thresholds = {n for n in _yaml_numbers(doc) if n not in (0, 1, 2)}
    tree = ast.parse(Path(scoring.__file__).read_text())
    floors = {"MIN_FIT_POINTS", "MIN_CYCLES"}
    for node in list(tree.body):
        if isinstance(node, ast.Assign) and {getattr(t, "id", None) for t in node.targets} & floors:
            tree.body.remove(node)
    literals = {
        node.value
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant)
        and isinstance(node.value, (int, float))
        and not isinstance(node.value, bool)
    }
    assert not (literals & thresholds), sorted(literals & thresholds)
