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

        (tmp_path / "design-a-dashboard.md").write_text(
            f"---\nname: design-a-dashboard\nsummary: s\n---\n{render.START}\nstale\n{render.END}\n"
        )
        monkeypatch.setattr(render, "SKILLS_DIR", tmp_path)
        out = io.StringIO()

        assert render.main(out=out) == 0
        assert "stale" not in (tmp_path / "design-a-dashboard.md").read_text()
        assert "rendered" in out.getvalue()


class TestTheAlwaysOnTier:
    def test_design_a_dashboard_is_always_on_and_short(self):
        skill = next(s for s in skills.packaged() if s["name"] == "design-a-dashboard")
        assert skill["always"] is True
        assert len(skill["text"].splitlines()) <= 40

    def test_the_tier_still_fits_the_budget(self):
        assert len(skills.always_on_prompt().encode()) <= skills.MAX_ALWAYS_BYTES
