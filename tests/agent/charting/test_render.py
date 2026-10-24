"""The design-a-dashboard skill quotes layout.yml through a rendered block
(VIS-1434): committed == rendered, and the always-on tier still fits."""

import pytest

from visivo.agent import skills
from visivo.agent.charting import render
from visivo.agent.charting.rules import load_families


class TestTheRenderedBlock:
    def test_the_committed_skill_equals_the_rendered_one(self):
        path = render.SKILLS_DIR / "design-a-dashboard.md"
        assert path.read_text() == render.rendered(
            path
        ), "run python -m visivo.agent.charting.render"

    def test_the_block_quotes_the_rule_file(self):
        text = render.layout_rules_markdown()
        assert "inputs → header → kpi → hero → breakdown → relationship → detail" in text
        assert "≤12 charts/tables" in text and "[8, 4]" in text and "`small`" in text
        assert (
            "up to 8 of the hero's KPIs beside it at [8, 4], at most 2 per `xsmall` sub-row" in text
        )
        assert "kpi → xsmall" in text and "gauge KPI (`mode` with `gauge`) needs `medium`" in text
        assert "a chart in a compact row gets `small`'s height" in text
        assert "never a chart in a compact row" not in text and "2×2 always stacks" not in text

    def test_a_skill_without_a_block_is_refused(self, tmp_path, monkeypatch):
        path = tmp_path / "design-a-dashboard.md"
        path.write_text("---\nname: design-a-dashboard\nsummary: s\n---\nno block\n")
        with pytest.raises(ValueError, match="no <!-- rules:start"):
            render.rendered(path)

    def test_main_rewrites_every_registered_skill(self, tmp_path, monkeypatch):
        import io

        for name in render.RENDERERS:
            (tmp_path / name).parent.mkdir(exist_ok=True)
            (tmp_path / name).write_text(
                f"---\nname: {name.split('/')[-1][:-3]}\nsummary: s\n---\n{render.START}\nstale\n{render.END}\n"
            )
        monkeypatch.setattr(render, "SKILLS_DIR", tmp_path)
        monkeypatch.setattr(render, "INTERACTIONS_DIR", tmp_path / "interactions")
        monkeypatch.setattr(render, "CHARTS_DIR", tmp_path / "charts")
        out = io.StringIO()

        assert render.main(out=out) == 0
        for name in render.RENDERERS:
            assert "stale" not in (tmp_path / name).read_text()
        assert (tmp_path / "interactions" / "global_filter.md").exists()
        assert (tmp_path / "charts" / "heatmap.md").exists()
        assert "rendered" in out.getvalue()


class TestTheInteractivitySkills:
    def test_make_it_interactive_equals_its_render(self):
        path = render.SKILLS_DIR / "make-it-interactive.md"
        assert path.read_text() == render.rendered(
            path
        ), "run python -m visivo.agent.charting.render"

    def test_every_pattern_has_a_committed_note_equal_to_its_render(self):
        rendered = render.rendered_patterns()
        assert len(rendered) == 8
        for name, text in rendered.items():
            assert (render.INTERACTIONS_DIR / name).read_text() == text, name

    def test_pattern_notes_are_on_demand_skills(self):
        names = {s["name"]: s for s in skills.packaged()}
        assert (
            "interactions/global_filter" in names
            and names["interactions/global_filter"]["always"] is False
        )
        assert "interactions/cascading_options" in names
        assert skills.body("interactions/prop_driven")

    def test_an_unsupported_pattern_says_so_and_a_verified_false_one_warns(self):
        text = render.rendered_patterns()
        assert (
            "Not supported today" in text["cascading_options.md"]
            and "Instead:" in text["cascading_options.md"]
        )
        assert "Unverified end to end" in text["metric_switcher.md"]
        assert "Never on:" in text["prop_driven.md"] and "`layout.*`" in text["prop_driven.md"]

    def test_global_filter_shows_a_multi_select_in_with_parentheses(self):
        """VIS-1635: without the parentheses the whole filter was dropped."""
        text = render.rendered_patterns()
        assert "**Example:** `filter: ?{ ${ref(M).C} IN (${ref(I).values})" in (
            text["global_filter.md"]
        )
        assert "**Example:**" not in text["top_n.md"]

    def test_the_rules_block_quotes_the_file(self):
        text = render.interactivity_rules_markdown()
        assert "| categorical/geo_region | few (n –5) |" in text and "`global_filter`" in text
        assert "4 inputs at most" in text and "snake_case" in text


class TestTheTableSkill:
    def test_charts_table_equals_its_render_and_is_on_demand(self):
        path = render.SKILLS_DIR / "charts" / "table.md"
        assert path.read_text() == render.rendered(
            path
        ), "run python -m visivo.agent.charting.render"
        skill = next(s for s in skills.packaged() if s["name"] == "charts/table")
        assert skill["always"] is False and skill["family"] == "table"
        assert skills.body("charts/table")

    def test_the_block_quotes_both_rule_files(self):
        text = render.table_rules_markdown()
        assert "`table_pivot` when cross cells in (400, 2000]" in text
        assert "`rows_per_page` ∈ [3, 5, 10, 25, 50, 100, 500, 1000]" in text
        assert "#713b57" in text and "≤6 columns may sit beside its chart" in text


class TestTheFamilySkills:
    """VIS-1447: every family's on-demand skill is generated from its trace
    entries, so what the agent reads before write_insight cannot drift from
    the rules recommend_charts applies."""

    def test_every_family_names_a_skill_that_exists_on_demand(self):
        on_demand = {s["name"]: s for s in skills.on_demand()}
        for family in load_families():
            assert family.skill in on_demand, family.name
            assert on_demand[family.skill]["always"] is False

    def test_each_committed_skill_equals_its_render(self):
        rendered = render.rendered_family_skills()
        assert len(rendered) == len(load_families()) - 2  # table and table_pivot share charts/table
        for name, text in rendered.items():
            path = render.CHARTS_DIR / name
            assert path.read_text() == text, f"run python -m visivo.agent.charting.render ({name})"

    def test_a_skill_carries_its_entries_and_its_family_warnings(self):
        heatmap = next(f for f in load_families() if f.name == "heatmap")
        text = render.family_skill_markdown(heatmap)
        assert "Weekday or month names sort alphabetically" in text
        assert heatmap.warnings and heatmap.warnings[0] in text
        assert "type: heatmap" in text and text.count(render.START) == 1

    def test_a_deprecated_trace_is_listed_but_never_the_lead(self):
        geo = next(f for f in load_families() if f.name == "geo_region")
        text = render.family_skill_markdown(geo)
        assert "`choroplethmapbox` (deprecated)" in text
        assert "**Example** (`choroplethmapbox`)" not in text

    def test_shape_ranges_read_as_words(self):
        assert render._range(None, "rows") is None
        from visivo.agent.charting.schema import MinMax

        assert render._range(MinMax(min=1, max=1), "metrics") == "1 metric"
        assert render._range(MinMax(min=3), "cells") == "3+ cells"
        assert render._range(MinMax(min=2, max=9), "rows") == "2–9 rows"


class TestTheAlwaysOnTier:
    def test_design_a_dashboard_is_always_on_and_short(self):
        skill = next(s for s in skills.packaged() if s["name"] == "design-a-dashboard")
        assert skill["always"] is True
        assert len(skill["text"].splitlines()) <= 40

    def test_make_it_interactive_is_always_on_and_short(self):
        skill = next(s for s in skills.packaged() if s["name"] == "make-it-interactive")
        assert skill["always"] is True
        assert len(skill["text"].splitlines()) <= 40

    def test_the_tier_still_fits_the_budget(self):
        assert len(skills.always_on_prompt().encode()) <= skills.MAX_ALWAYS_BYTES


class TestChooseAChart:
    def test_the_committed_skill_equals_its_render(self):
        path = render.SKILLS_DIR / "choose-a-chart.md"
        assert path.read_text() == render.rendered(
            path
        ), "run python -m visivo.agent.charting.render"

    def test_it_is_always_on_and_short(self):
        skill = next(s for s in skills.packaged() if s["name"] == "choose-a-chart")
        assert skill["always"] is True and len(skill["text"].splitlines()) <= 40
        assert "recommend_charts" in skill["text"]

    def test_the_tree_is_read_from_the_rule_files(self):
        text = render.choose_rules_markdown()
        assert "geo → geo_region, geo_point, geo_density" in text
        assert "`ordered_stages` → funnel (required)" in text
        assert "(iso3, country_name, us_state)" in text
        assert "one 1 · few 2–7 · some 8–20 · many 21–100 · high 101+" in text
        assert "from `some` up, an input" in text
        assert "`top_n_other`, `input_filter`" in text and "`clip_p99`" not in text

    def test_a_new_intent_clause_lands_in_the_tree(self):
        from visivo.agent.charting import rules
        from visivo.agent.charting.schema import ScoreAdjustment

        doc = rules.load_family_doc()
        boosted = [
            (
                f.model_copy(
                    update={
                        "score": [
                            *f.score,
                            ScoreAdjustment(when="intent == flow", delta=0.9, reason="r"),
                        ]
                    }
                )
                if f.name == "image"
                else f
            )
            for f in doc.families
        ]
        text = render.choose_rules_markdown(doc.model_copy(update={"families": boosted}))
        assert "flow → image, flow;" in text

    def test_theming_states_the_same_colour_rule(self):
        def rule(name, heading):
            text = (render.SKILLS_DIR / name).read_text()
            return " ".join(text.split(heading)[1].split("\n\n")[1].split())

        choose = rule("choose-a-chart.md", "## Colour")
        assert choose.startswith("Set `marker.color`") and "precedence" in choose
        assert choose == rule(
            "theming-a-project.md", "## Do not restyle a chart to change the palette"
        )
