import re

import pytest
import yaml

from visivo.agent import skills
from visivo.agent.charting import render, rules
from visivo.agent.charting.schema import (
    ColumnStats,
    HeavyTail,
    InsightDesignDoc,
    Reductions,
    ShapeCard,
)

# rules/transforms.yml's names, pinned here until that file is on main.
TRANSFORM_VOCABULARY = {
    "top_n_other",
    "input_filter",
    "small_multiples",
    "regrain",
    "scattergl",
    "clip_p99",
    "dominant_category",
    "bucket",
    "collapse_rare",
}

SKILL = render.SKILLS_DIR / "design-insights.md"


def raw():
    return yaml.safe_load((rules.RULES_DIR / "insight_design.yml").read_text())


def card(role, additive=None, **extra):
    return ShapeCard(column="c", role=role, cardinality=10, additive=additive, **extra)


class TestTheRuleFile:
    def test_it_loads(self):
        doc = rules.load_insight_design()
        assert doc.reductions.top_n_other.n == 5 and doc.reductions.top_n_other.n_max == 7
        assert doc.reductions.regrain.points_max == 600
        assert doc.reductions.collapse_rare.min_share == 0.02
        assert doc.portfolio.slot_for("composition").name == "breakdown"
        assert doc.portfolio.slot_for("detail") is None

    def test_a_broken_file_names_itself(self, tmp_path):
        path = tmp_path / "insight_design.yml"
        path.write_text("metric_by_role: []\n")
        with pytest.raises(ValueError, match=r"insight_design\.yml"):
            rules.load_insight_design(path)
        path.write_text("- list\n")
        with pytest.raises(ValueError, match="mapping"):
            rules.load_insight_design(path)

    def test_primary_metric_words_are_lower_case_words_matched_whole(self):
        words = rules.load_insight_design().primary_metric
        assert words.matches("Fare-Amount total") == ["amount", "fare", "total"]
        assert words.matches("fares_amounted") == []
        for bad in (["Amount"], ["unit price"]):
            data = raw()
            data["primary_metric"]["words"] = bad
            with pytest.raises(ValueError, match="lower-case single words"):
                InsightDesignDoc(**data)

    def test_the_metric_rules_are_keyed_by_role_and_additivity(self):
        doc = rules.load_insight_design()
        assert doc.metric_rule(card("identifier")).aggs == ["count_distinct"]
        assert doc.metric_rule(card("numeric_continuous", additive=True)).aggs == ["sum", "avg"]
        for additive in (False, None):
            assert doc.metric_rule(card("numeric_continuous", additive=additive)).aggs == ["avg"]
        assert doc.metric_rule(card("boolean")).aggs == ["rate"]
        assert doc.metric_rule(card("time")).duration_agg == "avg"
        assert doc.metric_rule(card("text")).aggs == []

    def test_every_role_needs_exactly_one_metric_rule(self):
        broken = raw()
        broken["metric_by_role"] = [
            r for r in broken["metric_by_role"] if r["roles"] != ["boolean"]
        ]
        with pytest.raises(ValueError, match="0 rules for role boolean"):
            InsightDesignDoc(**broken)
        doubled = raw()
        doubled["metric_by_role"].append({"roles": ["boolean"], "aggs": ["count"], "why": "x"})
        with pytest.raises(ValueError, match="2 rules for role boolean"):
            InsightDesignDoc(**doubled)

    @pytest.mark.parametrize(
        "path, value, message",
        [
            (("reductions", "top_n_other", "n_max"), 3, "n_max is below n"),
            (("pairing_limits", "pivot_max_cells"), 100, "pivot_max_cells is below"),
            (("scoring", "seasonality_lags"), {"day": 1}, "at least 2"),
            (("portfolio", "max_candidates"), 3, "more candidates than max_candidates"),
            (("reductions", "collapse_rare", "min_share"), 1.5, "less than 1"),
            (("scoring", "banded_min_r"), 0.6, "banded_min_r is above scatter_min_r"),
            (("portfolio", "min_score"), 0.5, "min_score is above scoring unmeasured"),
        ],
    )
    def test_inconsistent_values_are_refused(self, path, value, message):
        broken = raw()
        target = broken
        for key in path[:-1]:
            target = target[key]
        target[path[-1]] = value
        with pytest.raises(ValueError, match=message):
            InsightDesignDoc(**broken)

    def test_an_intent_may_fill_one_slot_only(self):
        broken = raw()
        broken["portfolio"]["slots"][1]["intents"].append("kpi")
        with pytest.raises(ValueError, match="one portfolio slot only"):
            InsightDesignDoc(**broken)

    def test_reductions_use_the_shared_transform_vocabulary(self):
        assert set(Reductions.model_fields) <= TRANSFORM_VOCABULARY

    def test_the_input_bucket_is_read_not_restated(self):
        text = (rules.RULES_DIR / "insight_design.yml").read_text()
        assert "input_over_split_min_bucket" not in text

    def test_the_trend_minimum_lives_beside_the_regrain_it_bounds(self):
        interactivity = (rules.RULES_DIR / "interactivity.yml").read_text()
        assert "min_points" not in interactivity
        regrain = rules.load_insight_design().reductions.regrain
        assert regrain.points_min < regrain.points_max

    def test_a_regrain_range_must_be_a_range(self):
        broken = raw()
        broken["reductions"]["regrain"]["points_min"] = broken["reductions"]["regrain"][
            "points_max"
        ]
        with pytest.raises(ValueError, match="points_min must be below points_max"):
            InsightDesignDoc(**broken)


class TestHeavyTail:
    TAIL = HeavyTail(skew_over=1, p99_over_median=5)

    def test_skew_or_a_long_p99_is_a_heavy_tail(self):
        assert self.TAIL.holds(ColumnStats(skew=3.2))
        assert self.TAIL.holds(ColumnStats(skew=0.1, p99=60, median=10))
        assert not self.TAIL.holds(ColumnStats(skew=0.5, p99=40, median=10))

    def test_missing_or_degenerate_stats_are_not(self):
        assert not self.TAIL.holds(None)
        assert not self.TAIL.holds(ColumnStats())
        assert not self.TAIL.holds(ColumnStats(p99=60, median=0))


class TestTheSkill:
    def test_the_committed_skill_equals_the_rendered_one(self):
        assert SKILL.read_text() == render.rendered(
            SKILL
        ), "run python -m visivo.agent.charting.render"

    def test_it_names_every_reduction_transform(self):
        body = skills.body("design-insights")
        for name in Reductions.model_fields:
            assert f"`{name}`" in body, name

    def test_it_is_on_demand_attached_to_score_candidates_and_short(self):
        entry = next(s for s in skills.packaged() if s["name"] == "design-insights")
        assert entry["always"] is False and entry["tools"] == ["score_candidates"]
        assert len(SKILL.read_text().splitlines()) <= 50

    def test_the_prose_outside_the_block_states_no_threshold(self):
        prose = render.BLOCK.sub("", SKILL.read_text())
        assert not re.findall(r"\d+(?:\.\d+)?\s*(?:%|×|points|cells|bins)", prose)
        assert not re.findall(r"(?<![\w.])\d{2,}", prose)

    def test_the_numbers_come_from_the_rule_files(self):
        doc = rules.load_insight_design()
        doc.reductions.top_n_other.n = 6
        doc.reductions.regrain.points_max = 333
        interactivity = rules.load_interactivity()
        interactivity.design_rules.input_over_split_min_bucket = "many"
        doc.reductions.regrain.points_min = 9
        text = render.insight_design_markdown(doc, interactivity)
        assert (
            "top 6 hold" in text
            and "9–333 points" in text
            and "up to 20 values, split; 21–100, `top_n_other`" in text
            and "above 100, an input" in text
        )
