"""recommend_inputs and check_wiring (VIS-1441): the golden table from
specs/chart-selection/05-interactivity.md §6, defaults from stats, and the
half-wired check."""

import pytest
import yaml

from visivo.agent.charting import rules
from visivo.agent.charting.inputs import (
    InputsError,
    check_wiring,
    recommend_inputs,
    snake,
)
from visivo.models.inputs.types.multi_select import MultiSelectInput
from visivo.models.inputs.types.single_select import SingleSelectInput


def card(column, role, cardinality, **extra):
    return {"model": "sales", "column": column, "role": role, "cardinality": cardinality, **extra}


def tops(*values):
    share = round(1 / len(values), 3)
    return [{"value": v, "share": share} for v in values]


REGION = card("region", "categorical", 4, top_n=tops("North", "South", "East", "West"))
INSIGHTS = [
    {
        "name": "revenue-by-category",
        "model": "sales",
        "columns": ["category", "region", "amount"],
        "chart": "c1",
        "family": "bar",
        "measure": "sum(amount)",
    },
    {
        "name": "revenue-trend",
        "model": "sales",
        "columns": ["month", "region", "amount"],
        "chart": "c2",
        "family": "line",
    },
    {
        "name": "orders-kpi",
        "model": "sales",
        "columns": ["region", "id"],
        "chart": "c3",
        "family": "kpi",
    },
]


def one(cards, insights=INSIGHTS, **kw):
    result = recommend_inputs(cards, insights, **kw)
    assert len(result["inputs"]) == 1, result
    return result["inputs"][0]


def validates(entry):
    cls = SingleSelectInput if entry["input"]["type"] == "single-select" else MultiSelectInput
    cls(**yaml.safe_load(entry["input_yaml"])["inputs"][0])
    return True


class TestTheRuleFile:
    def test_it_loads_and_the_first_match_wins(self):
        doc = rules.load_interactivity()
        assert [p.name for p in doc.patterns][:2] == ["global_filter", "split_switcher"]
        from visivo.agent.charting.schema import ShapeCard

        assert (
            doc.rule_for(ShapeCard(column="x", role="categorical", cardinality=1)).input == "none"
        )
        assert (
            doc.rule_for(ShapeCard(column="x", role="categorical", cardinality=5)).input.display
            == "tabs"
        )

    def test_a_broken_file_names_itself(self, tmp_path):
        path = tmp_path / "interactivity.yml"
        path.write_text("card_to_input: []\n")
        with pytest.raises(ValueError, match=r"interactivity\.yml"):
            rules.load_interactivity(path)
        path.write_text("- list\n")
        with pytest.raises(ValueError, match="mapping"):
            rules.load_interactivity(path)

    def test_the_schema_refuses_half_rules(self):
        from pydantic import ValidationError

        from visivo.agent.charting.schema import CardToInput, InputShape, InteractivityDoc

        with pytest.raises(ValidationError, match="needs a wiring and a default"):
            CardToInput(
                match={"role": ["time"]},
                input={"type": "single-select", "display": "tabs", "options": "from_top_n"},
                why="w",
            )
        with pytest.raises(ValidationError, match="static_options"):
            InputShape(type="single-select", display="tabs", options="static")
        with pytest.raises(ValidationError, match="unique"):
            InteractivityDoc(
                card_to_input=[{"match": {"role": ["time"]}, "input": "none", "why": "w"}],
                patterns=[{"name": "a", "trigger": "t"}, {"name": "a", "trigger": "t"}],
            )


class TestGoldenCards:
    """G1–G12 from the research doc, one assertion group per card shape."""

    def test_g1_a_few_categorical_becomes_tabs_wired_to_every_insight(self):
        entry = one([REGION])
        assert entry["display"] == "tabs" and entry["default"] == {"value": "North"}
        assert entry["input"]["options"] == ["North", "South", "East", "West"]
        assert [w["insight"] for w in entry["wiring"]] == [i["name"] for i in INSIGHTS]
        assert all(w["interaction"] == "filter" for w in entry["wiring"])
        assert entry["wiring"][0]["expression"] == "${ref(sales).region} = '${ref(region).value}'"
        assert entry["pattern"] == "global_filter" and validates(entry)

    def test_g2_an_insight_without_the_column_is_warned_about_not_wired(self):
        insights = INSIGHTS + [{"name": "other", "model": "sales", "columns": ["amount"]}]
        entry = one([REGION], insights)
        assert len(entry["wiring"]) == 3
        assert any("other reads sales but not region" in w for w in entry["warnings"])

    def test_g3_a_some_categorical_becomes_chips_with_an_explicit_top_five(self):
        entry = one(
            [card("category", "categorical", 12, top_n=tops(*[f"c{i}" for i in range(12)]))]
        )
        assert entry["display"] == "chips"
        assert entry["default"] == {"values": ["c0", "c1", "c2", "c3", "c4"]}
        assert entry["input"]["options"] == "?{ SELECT DISTINCT category FROM ${ref(sales)} }"
        assert (
            entry["wiring"][0]["expression"]
            == "${ref(sales).category} IN (${ref(category).values})"
        )
        assert validates(entry)

    def test_g4_past_fifteen_values_chips_become_a_dropdown(self):
        entry = one([card("category", "categorical", 18, top_n=tops("a", "b"))])
        assert entry["display"] == "dropdown" and entry["input"]["type"] == "multi-select"

    def test_g5_a_many_categorical_becomes_an_autocomplete_over_a_query(self):
        entry = one([card("category", "categorical", 80, top_n=tops("Acme", "Bolt"))])
        assert entry["display"] == "autocomplete" and entry["default"] == {"value": "Acme"}
        assert entry["input"]["options"].startswith("?{ SELECT DISTINCT")

    def test_g6_a_high_categorical_warns_about_option_counts(self):
        entry = one([card("category", "categorical", 250_000, top_n=tops("x", "y"))])
        assert entry["display"] == "autocomplete"
        assert any("100,000" in w for w in entry["warnings"])

    def test_g7_identifiers_get_no_input(self):
        result = recommend_inputs([card("id", "identifier", 10_000)], INSIGHTS)
        assert result["inputs"] == []
        assert "identifiers are not filter dimensions" in result["dropped"][0]["why"]

    def test_g8_a_boolean_is_three_tabs_with_an_all_sentinel_not_a_toggle(self):
        insights = [{"name": "a", "model": "sales", "columns": ["is_returning"]}]
        entry = one([card("is_returning", "boolean", 2)], insights)
        assert entry["display"] == "tabs" and entry["input"]["options"] == ["All", "true", "false"]
        assert entry["default"] == {"value": "All"}
        assert "'${ref(is_returning).value}' = 'All' OR" in entry["wiring"][0]["expression"]
        assert validates(entry)

    def test_g9_a_continuous_number_is_a_range_slider_over_the_full_span(self):
        insights = [{"name": "a", "model": "sales", "columns": ["price"]}]
        entry = one(
            [card("price", "numeric_continuous", 900, stats={"min": 0, "max": 1000})], insights
        )
        assert entry["display"] == "range-slider"
        assert entry["input"]["range"] == {"start": "0", "end": "1000", "step": "20"}
        assert entry["default"] == {"start": "0", "end": "1000"}
        assert entry["wiring"][0]["expression"] == (
            "${ref(sales).price} >= ${ref(price).min} AND ${ref(sales).price} <= ${ref(price).max}"
        )
        assert validates(entry)

    def test_g10_a_small_discrete_number_is_a_threshold_slider_at_the_median(self):
        insights = [{"name": "a", "model": "sales", "columns": ["days_late"]}]
        entry = one(
            [
                card(
                    "days_late",
                    "numeric_discrete",
                    5,
                    stats={"median": 2.4},
                    top_n=tops(4, 1, 0, 3, 2),
                )
            ],
            insights,
        )
        assert entry["display"] == "slider"
        assert entry["input"]["options"] == ["0", "1", "2", "3", "4"]
        assert entry["default"] == {"value": "2"}
        assert (
            entry["wiring"][0]["expression"] == "${ref(sales).days_late} <= ${ref(days_late).value}"
        )
        assert validates(entry)

    def test_g10b_without_a_median_the_middle_option_is_the_default(self):
        insights = [{"name": "a", "model": "sales", "columns": ["n"]}]
        entry = one([card("n", "numeric_discrete", 3, top_n=tops(1, 2, 3))], insights)
        assert entry["default"] == {"value": "2"}

    def test_g10c_past_thirty_values_a_discrete_number_becomes_a_range(self):
        insights = [{"name": "a", "model": "sales", "columns": ["n"]}]
        entry = one([card("n", "numeric_discrete", 40, stats={"min": 1, "max": 40})], insights)
        assert entry["display"] == "range-slider"

    def test_g11_a_time_column_is_a_date_range_defaulting_to_a_recent_window(self):
        insights = [{"name": "a", "model": "sales", "columns": ["order_date"]}]
        entry = one(
            [
                card(
                    "order_date",
                    "time",
                    730,
                    time_grain="day",
                    stats={"min": "2024-01-01", "max": "2025-12-31"},
                )
            ],
            insights,
        )
        assert entry["display"] == "date-range"
        assert entry["input"]["range"] == {
            "start": "2024-01-01",
            "end": "2025-12-31",
            "step": "1 day",
        }
        assert entry["default"] == {
            "start": "2025-12-19",
            "end": "2025-12-31",
        }, "≥12 points at day grain"
        assert (
            "BETWEEN '${ref(order_date).min}'::date AND '${ref(order_date).max}'::date"
            in entry["wiring"][0]["expression"]
        )
        assert validates(entry)

    def test_g11b_a_monthly_grain_keeps_twelve_months(self):
        insights = [{"name": "a", "model": "sales", "columns": ["month"]}]
        entry = one(
            [
                card(
                    "month",
                    "time",
                    36,
                    time_grain="month",
                    stats={"min": "2023-01-01", "max": "2025-12-01"},
                )
            ],
            insights,
        )
        assert entry["default"] == {
            "start": "2024-12-06",
            "end": "2025-12-01",
        }, "12 months x 30 days"

    def test_g11c_a_short_history_defaults_to_its_whole_span(self):
        insights = [{"name": "a", "model": "sales", "columns": ["d"]}]
        entry = one(
            [
                card(
                    "d",
                    "time",
                    5,
                    time_grain="day",
                    stats={"min": "2025-12-27", "max": "2025-12-31"},
                )
            ],
            insights,
        )
        assert entry["default"] == {"start": "2025-12-27", "end": "2025-12-31"}

    def test_g12_a_trend_intent_adds_a_grain_switcher_in_x(self):
        insights = [
            {
                "name": "trend",
                "model": "sales",
                "columns": ["order_date"],
                "chart": "c",
                "family": "line",
            }
        ]
        result = recommend_inputs(
            [
                card(
                    "order_date",
                    "time",
                    730,
                    time_grain="day",
                    stats={"min": "2024-01-01", "max": "2025-12-31"},
                )
            ],
            insights,
            intent="trend",
        )
        grain = result["inputs"][0]
        assert grain["name"] == "grain" and grain["input"]["options"] == ["day", "week", "month"]
        assert grain["wiring"] == [
            {
                "insight": "trend",
                "interaction": "prop",
                "path": "x",
                "expression": "date_trunc('${ref(grain).value}', ${ref(sales).order_date})",
            }
        ]
        assert any("unverified" in w for w in grain["warnings"])
        assert validates(grain)

    def test_g13_a_weekly_grain_offers_week_and_month_only(self):
        insights = [
            {"name": "trend", "model": "sales", "columns": ["w"], "chart": "c", "family": "line"}
        ]
        result = recommend_inputs(
            [
                card(
                    "w",
                    "time",
                    100,
                    time_grain="week",
                    stats={"min": "2024-01-01", "max": "2025-12-31"},
                )
            ],
            insights,
            intent="trend",
        )
        assert result["inputs"][0]["input"]["options"] == ["week", "month"]

    def test_g14_a_rank_intent_adds_a_sort_direction_switch_on_ranked_bars(self):
        result = recommend_inputs([REGION], INSIGHTS, intent="rank")
        sort = result["inputs"][0]
        assert sort["name"] == "sort_direction" and sort["input"]["options"] == ["DESC", "ASC"]
        assert sort["wiring"] == [
            {
                "insight": "revenue-by-category",
                "interaction": "sort",
                "expression": "sum(amount) ${ref(sort_direction).value}",
            }
        ]
        assert validates(sort)

    def test_g15_a_constant_column_and_a_text_column_get_nothing(self):
        result = recommend_inputs(
            [card("tenant", "categorical", 1), card("notes", "text", 500)], INSIGHTS
        )
        assert result["inputs"] == [] and len(result["dropped"]) == 2

    def test_g16_geo_regions_behave_like_categoricals(self):
        insights = [{"name": "a", "model": "sales", "columns": ["state"]}]
        entry = one(
            [card("state", "geo_region", 50, geo_kind="us_state", top_n=tops("NY", "CA"))], insights
        )
        assert entry["display"] == "autocomplete"


class TestRankingAndCaps:
    def test_six_candidates_keep_four_ranked_time_then_categorical(self):
        cards = [
            card("price", "numeric_continuous", 900, stats={"min": 0, "max": 100}),
            card("region", "categorical", 4, top_n=tops("N", "S")),
            card(
                "order_date",
                "time",
                365,
                time_grain="day",
                stats={"min": "2025-01-01", "max": "2025-12-31"},
            ),
            card("category", "categorical", 12, top_n=tops("a", "b")),
            card("days_late", "numeric_discrete", 3, top_n=tops(1, 2, 3)),
            card("is_vip", "boolean", 2),
        ]
        insights = [{"name": "a", "model": "sales", "columns": [c["column"] for c in cards]}]
        result = recommend_inputs(cards, insights)
        assert [i["name"] for i in result["inputs"]] == [
            "order_date",
            "region",
            "category",
            "is_vip",
        ]
        assert {d["column"] for d in result["dropped"]} == {"days_late", "price"}
        assert any("kept the 4" in w for w in result["warnings"])

    def test_the_cap_can_be_lowered(self):
        result = recommend_inputs(
            [REGION, card("is_vip", "boolean", 2)],
            [{"name": "a", "model": "sales", "columns": ["region", "is_vip"]}],
            max_inputs=1,
        )
        assert len(result["inputs"]) == 1

    def test_an_input_nothing_reads_is_dropped(self):
        result = recommend_inputs(
            [REGION], [{"name": "a", "model": "sales", "columns": ["amount"]}]
        )
        assert result["inputs"] == [] and "control nothing" in result["dropped"][0]["why"]

    def test_without_candidate_insights_the_input_is_still_proposed(self):
        result = recommend_inputs([REGION])
        assert result["inputs"][0]["wiring"] == [] and result["inputs"][0]["pattern"] == "unwired"

    def test_a_dashboard_with_nothing_to_control_is_called_out(self):
        result = recommend_inputs([card("id", "identifier", 5)], INSIGHTS)
        assert any("static dashboard" in w for w in result["warnings"])

    def test_layout_inputs_mark_single_chart_controls_as_local(self):
        insights = [
            {"name": "a", "model": "sales", "columns": ["region", "price"], "chart": "c1"},
            {"name": "b", "model": "sales", "columns": ["region"], "chart": "c2"},
        ]
        result = recommend_inputs(
            [REGION, card("price", "numeric_continuous", 50, stats={"min": 0, "max": 10})], insights
        )
        by_name = {l["name"]: l["hints"] for l in result["layout_inputs"]}
        assert by_name["region"] == {} and by_name["price"] == {"chart": "c1"}


class TestNamesAndRefusals:
    def test_names_are_snake_case(self):
        assert snake("Order Region") == "order_region" and snake("pickup-at") == "pickup_at"
        assert snake("2024 cohort") == "in_2024_cohort"
        with pytest.raises(InputsError):
            snake("---")

    def test_two_columns_mapping_to_one_name_are_refused(self):
        insights = [{"name": "a", "model": "sales", "columns": ["Region", "region"]}]
        with pytest.raises(InputsError, match="same input name"):
            recommend_inputs([{**REGION, "column": "Region"}, REGION], insights)

    def test_a_card_without_a_model_is_refused(self):
        with pytest.raises(InputsError, match="model"):
            recommend_inputs([{"column": "x", "role": "time", "cardinality": 3}])

    def test_missing_statistics_drop_the_card_with_a_reason(self):
        insights = [{"name": "a", "model": "sales", "columns": ["price", "d", "cat"]}]
        result = recommend_inputs(
            [
                card("price", "numeric_continuous", 10),
                card("d", "time", 10),
                card("cat", "categorical", 3),
            ],
            insights,
        )
        assert result["inputs"] == []
        assert all("not enough statistics" in d["why"] for d in result["dropped"])

    def test_a_default_that_cannot_be_derived_drops_the_card(self):
        insights = [{"name": "a", "model": "sales", "columns": ["cat"]}]
        result = recommend_inputs(
            [card("cat", "categorical", 12, top_n=[{"value": None, "share": 1}])], insights
        )
        assert "no default" in result["dropped"][0]["why"]


class TestCheckWiring:
    INPUTS = [{"name": "region", "model": "sales", "column": "region"}]

    def test_a_fully_wired_dashboard_has_no_gaps(self):
        insights = [
            {
                "name": "a",
                "model": "sales",
                "columns": ["region"],
                "interactions": ["filter: ?{ ${ref(sales).region} = '${ref(region).value}' }"],
            },
            {"name": "b", "model": "other", "columns": ["region"], "interactions": []},
        ]
        assert check_wiring(self.INPUTS, insights) == []

    def test_a_half_wired_filter_is_flagged(self):
        insights = [
            {
                "name": "a",
                "model": "sales",
                "columns": ["region"],
                "interactions": ["${ref(region).value}"],
            },
            {"name": "b", "model": "sales", "columns": ["region", "amount"], "interactions": []},
            {"name": "c", "model": "sales", "columns": ["amount"]},
        ]
        gaps = check_wiring(self.INPUTS, insights)
        assert [g["insight"] for g in gaps] == ["b"] and "unfiltered" in gaps[0]["reason"]

    def test_pattern_inputs_without_a_column_are_skipped(self):
        assert (
            check_wiring(
                [{"name": "sort_direction"}], [{"name": "a", "model": "sales", "columns": ["x"]}]
            )
            == []
        )


class TestTheTools:
    def test_recommend_inputs_is_registered(self, integration_app):
        from visivo.agent.tools import TOOLS, ToolError, call

        assert {"recommend_inputs", "check_input_wiring"} <= set(TOOLS)
        result = call(
            integration_app, "recommend_inputs", {"cards": [REGION], "insights": INSIGHTS}
        )
        assert result["inputs"][0]["name"] == "region"
        with pytest.raises(ToolError, match="non-empty list"):
            call(integration_app, "recommend_inputs", {"cards": []})
        with pytest.raises(ToolError, match="model"):
            call(integration_app, "recommend_inputs", {"cards": [{"column": "x"}]})
        with pytest.raises(ToolError, match="Could not derive"):
            call(
                integration_app,
                "recommend_inputs",
                {"cards": [{"model": "m", "column": "x", "role": "nope", "cardinality": 1}]},
            )

    def test_check_input_wiring_is_registered(self, integration_app):
        from visivo.agent.tools import ToolError, call

        result = call(
            integration_app,
            "check_input_wiring",
            {
                "inputs": self_inputs(),
                "insights": [
                    {"name": "a", "model": "sales", "columns": ["region"], "interactions": []}
                ],
            },
        )
        assert result["complete"] is False and result["gaps"][0]["insight"] == "a"
        with pytest.raises(ToolError, match="lists"):
            call(integration_app, "check_input_wiring", {"inputs": {}, "insights": []})


def self_inputs():
    return [{"name": "region", "model": "sales", "column": "region"}]


class TestHelpers:
    def test_number_and_date_parsing_tolerate_junk(self):
        from visivo.agent.charting.inputs import _date, _nice_step, _num

        assert _num("abc") is None and _num("3.5") == 3.5
        assert _date("not a date") is None and str(_date("2025-01-02T10:00:00")) == "2025-01-02"
        assert _nice_step(0) == 1 and _nice_step(1000) == 20 and _nice_step(1) == 0.02

    def test_an_autocomplete_without_top_values_has_no_default_and_is_dropped(self):
        insights = [{"name": "a", "model": "sales", "columns": ["cat"]}]
        result = recommend_inputs([card("cat", "categorical", 80)], insights)
        assert "no default" in result["dropped"][0]["why"]

    def test_already_parsed_cards_and_insights_are_accepted(self):
        from visivo.agent.charting.inputs import CandidateInsight, InputCard

        parsed_card = InputCard(**REGION)
        parsed_insight = CandidateInsight(**INSIGHTS[0])
        result = recommend_inputs([parsed_card], [parsed_insight])
        assert result["inputs"][0]["wiring"][0]["insight"] == "revenue-by-category"

    def test_input_match_checks_bucket_before_counts(self):
        from visivo.agent.charting.schema import InputMatch, ShapeCard

        match = InputMatch(role=["categorical"], bucket=["few"], n_max=5)
        assert match.admits(ShapeCard(column="c", role="categorical", cardinality=4))
        assert not match.admits(ShapeCard(column="c", role="categorical", cardinality=12))
        assert not match.admits(ShapeCard(column="c", role="time", cardinality=4))
