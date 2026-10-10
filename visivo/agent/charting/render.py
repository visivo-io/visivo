"""Render rule files into the skills that quote them (VIS-1434).

A skill keeps a block between ``<!-- rules:start -->`` and ``<!-- rules:end -->``
that is generated from the YAML, so the prose an agent reads every turn
cannot drift from the numbers the tools enforce. ``python -m
visivo.agent.charting.render`` rewrites the blocks; a test asserts the
committed files equal the rendered ones.
"""

import re
import sys
from pathlib import Path

from visivo.agent.charting.rules import load_interactivity, load_layout

SKILLS_DIR = Path(__file__).parent.parent / "skills"
START, END = "<!-- rules:start -->", "<!-- rules:end -->"
BLOCK = re.compile(re.escape(START) + r".*?" + re.escape(END), re.DOTALL)


def _heights_line(doc):
    by_height = {}
    for family, height in doc.height_by_family.items():
        by_height.setdefault(str(height), []).append(family)
    parts = [f"{', '.join(fams)} → {height}" for height, fams in by_height.items()]
    parts.append("heatmap → grows with its rows")
    parts.append("markdown, inputs → compact (never a chart in a compact row)")
    return "; ".join(parts)


def layout_rules_markdown(doc=None):
    """The layout rules as the design-a-dashboard skill states them."""
    doc = doc or load_layout()
    grid = doc.grid
    order = " → ".join(doc.order)
    widths = ", ".join(
        f"{n}: {doc.rule('kpi').widths_for(n)}" for n in range(1, doc.rule("kpi").max_per_row + 1)
    )
    cluster = doc.kpi_cluster
    return "\n".join(
        [
            f"- **Order:** {order}. A role with nothing in it is dropped.",
            f"- **Caps:** ≤{grid.max_items} charts/tables and ≤{grid.max_content_rows} content rows per "
            f"dashboard (split by `level` above that); ≤{doc.rule('kpi').max_per_row} items per row; "
            f"≤{grid.max_inputs} global inputs in one compact top row; nesting ≤{grid.max_depth}.",
            f"- **Widths** sum to {grid.width_total}: peers split evenly ({widths}); a chart with a side "
            f"panel or its own input is {cluster.widths}.",
            f"- **Heights:** {_heights_line(doc)}. KPI rows are `{doc.rule('kpi').height}` "
            f"(an xsmall row has no plot area); the hero row is `{doc.rule('hero').height}`; "
            f"tables `{doc.rule('detail').height}` unless they have ≤7 rows.",
            f"- **KPI cluster:** up to {cluster.max_kpis} KPIs stack beside the hero chart one per "
            f"sub-row at `{cluster.sub_row_height}`; a nested 2×2 always stacks, never emit one.",
            f"- **Mobile:** below {grid.stack_breakpoint_px} px every item stacks full width at its row "
            "height, so lead each row with its most important item, keep ≤3 inputs, and put tables last.",
        ]
    )


def _card_row(rule):
    match = rule.match
    roles = "/".join(match.role)
    bucket = ", ".join(match.bucket) if match.bucket else "any"
    bounds = ""
    if match.n_min is not None or match.n_max is not None:
        bounds = f" (n {match.n_min or ''}–{match.n_max or ''})".replace(" (n –)", "")
    if rule.input == "none":
        return f"| {roles} | {bucket}{bounds} | — | {rule.why} |"
    return (
        f"| {roles} | {bucket}{bounds} | {rule.input.type} `{rule.input.display}` → "
        f"`{rule.wiring.interaction}` | {rule.why} |"
    )


def interactivity_rules_markdown(doc=None):
    """The interactivity rules as the make-it-interactive skill states them."""
    doc = doc or load_interactivity()
    d = doc.design_rules
    lines = [
        "| column | cardinality | input → interaction | why |",
        "|---|---|---|---|",
        *[_card_row(rule) for rule in doc.card_to_input],
        "",
        f"- **Counts:** {d.max_inputs_per_dashboard} inputs at most, in one `{d.inputs_row.height}` top row "
        f"with a header saying what they control; an input that drives one chart sits {d.chart_local_input}; "
        f"≤{d.max_inputs_mobile_row} survive the mobile stack.",
        f"- **Input vs split:** split a `few` column; from `{d.input_over_split_min_bucket}` up, an input.",
        f"- **Defaults:** every input has one, so the first render is complete. Multi-select defaults are an "
        f"explicit list (never `all` or a query); numeric ranges default to the full span; a time default "
        f"leaves ≥{d.time_default_min_points} points at the column's grain.",
        f"- **Quoting:** string operands as `{d.string_operand_quoting}`, numbers bare. Input names are "
        f"{d.input_name_style} (the viewer substitutes `\\w+` names only).",
        f"- **Order:** write inputs before the insights that reference them. A global filter goes on "
        f"**every** insight that reads the column; `check_input_wiring` finds the ones you missed.",
        f"- **Limits:** chart `layout` props (barmode, axis type) cannot read inputs; {d.table_filtering}; "
        f"an input-driven insight ships its whole model to the browser, so pre-aggregate above "
        f"{d.large_model_warning_rows:,} rows.",
        "- **Patterns** (read `interactions/<name>` before using one): "
        + ", ".join(f"`{p.name}`" for p in doc.patterns)
        + ".",
    ]
    return "\n".join(lines)


def pattern_markdown(pattern):
    """One on-demand skill per interaction pattern."""
    lines = [
        "---",
        f"name: {pattern.name}",
        f"summary: {pattern.trigger[0].upper() + pattern.trigger[1:]}.",
        "---",
        "",
        f"# {pattern.name.replace('_', ' ').title()}",
        "",
        f"**When:** {pattern.trigger}.",
    ]
    if not pattern.supported:
        lines += [
            "",
            "**Not supported today.** " + (pattern.note or ""),
            "",
            f"**Instead:** {pattern.fallback}",
        ]
    else:
        lines += ["", f"**Wiring:** `{pattern.wiring}`"]
        if pattern.snippet_ref:
            lines += ["", f"**Verified against:** `{pattern.snippet_ref}`"]
        if not pattern.verified:
            lines += [
                "",
                "**Unverified end to end:** preview the insight with `input_values` before writing it.",
            ]
        if pattern.note:
            lines += ["", f"**Watch for:** {pattern.note}."]
        if pattern.forbid_paths:
            lines += [
                "",
                "**Never on:** " + ", ".join(f"`{p}`" for p in pattern.forbid_paths) + ".",
            ]
    return "\n".join(lines) + "\n"


INTERACTIONS_DIR = SKILLS_DIR / "interactions"

RENDERERS = {
    "design-a-dashboard.md": layout_rules_markdown,
    "make-it-interactive.md": interactivity_rules_markdown,
}


def rendered_patterns(doc=None):
    """``{filename: text}`` for every pattern's on-demand skill."""
    doc = doc or load_interactivity()
    return {f"{p.name}.md": pattern_markdown(p) for p in doc.patterns}


def rendered(path):
    """The skill file with its rules block regenerated."""
    text = path.read_text()
    body = RENDERERS[path.name]()
    if not BLOCK.search(text):
        raise ValueError(f"{path} has no {START} … {END} block")
    return BLOCK.sub(lambda _: f"{START}\n{body}\n{END}", text)


def main(argv=None, out=sys.stdout):
    for name in RENDERERS:
        path = SKILLS_DIR / name
        path.write_text(rendered(path))
        out.write(f"rendered {path}\n")
    INTERACTIONS_DIR.mkdir(exist_ok=True)
    for name, text in rendered_patterns().items():
        (INTERACTIONS_DIR / name).write_text(text)
        out.write(f"rendered {INTERACTIONS_DIR / name}\n")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
