"""The design-a-dashboard skill quotes layout.yml through a rendered block
(VIS-1434): committed == rendered, and the always-on tier still fits."""

import pytest

from visivo.agent import skills
from visivo.agent.charting import render


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

    def test_a_skill_without_a_block_is_refused(self, tmp_path, monkeypatch):
        path = tmp_path / "design-a-dashboard.md"
        path.write_text("---\nname: design-a-dashboard\nsummary: s\n---\nno block\n")
        with pytest.raises(ValueError, match="no <!-- rules:start"):
            render.rendered(path)

    def test_main_rewrites_every_registered_skill(self, tmp_path, monkeypatch):
        import io

        for name in render.RENDERERS:
            (tmp_path / name).write_text(
                f"---\nname: {name[:-3]}\nsummary: s\n---\n{render.START}\nstale\n{render.END}\n"
            )
        monkeypatch.setattr(render, "SKILLS_DIR", tmp_path)
        monkeypatch.setattr(render, "INTERACTIONS_DIR", tmp_path / "interactions")
        out = io.StringIO()

        assert render.main(out=out) == 0
        for name in render.RENDERERS:
            assert "stale" not in (tmp_path / name).read_text()
        assert (tmp_path / "interactions" / "global_filter.md").exists()
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

    def test_the_rules_block_quotes_the_file(self):
        text = render.interactivity_rules_markdown()
        assert "| categorical/geo_region | few (n –5) |" in text and "`global_filter`" in text
        assert "4 inputs at most" in text and "snake_case" in text


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
