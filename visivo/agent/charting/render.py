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

from visivo.agent.charting.rules import (
    load_families,
    load_interactivity,
    load_layout,
    load_tables,
)

SKILLS_DIR = Path(__file__).parent.parent / "skills"
START, END = "<!-- rules:start -->", "<!-- rules:end -->"
BLOCK = re.compile(re.escape(START) + r".*?" + re.escape(END), re.DOTALL)


def _heights_line(doc):
    by_height = {}
    for family, height in doc.height_by_family.items():
        by_height.setdefault(str(height), []).append(family)
    parts = [f"{', '.join(fams)} → {height}" for height, fams in by_height.items()]
    parts.append("heatmap → grows with its rows")
    parts.append(
        "markdown, inputs → compact (wraps to content; a chart in a compact row gets "
        "`small`'s height, so name the height a chart needs)"
    )
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
            f"- **Heights:** {_heights_line(doc)}. A gauge KPI (`mode` with `gauge`) needs "
            f"`{doc.gauge_height}`, so pass `hints.gauge`; "
            f"the hero row is `{doc.rule('hero').height}`; tables `{doc.rule('detail').height}` "
            "unless they have ≤7 rows.",
            f"- **KPI cluster:** up to {cluster.max_kpis} of the hero's KPIs beside it at "
            f"{cluster.widths}, at most {cluster.max_per_sub_row} per `{cluster.sub_row_height}` "
            "sub-row; one or two KPIs get a sub-row each, and with an odd count the first gets a "
            "sub-row alone. Never three across: that slot stacks them inside their sub-row.",
            f"- **Mobile:** below {grid.stack_breakpoint_px} px every item stacks full width and "
            "shares its row's height, so lead each row with its most important item, keep ≤3 inputs, "
            "and put tables last.",
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


def table_rules_markdown(doc=None, families=None):
    """The table rules as the charts/table skill states them."""
    doc = doc or load_tables()
    families = families or load_families()
    gates = []
    for family in families:
        if family.name in ("table", "table_pivot"):
            for adj in family.score:
                if adj.delta > 0:
                    gates.append(f"- `{family.name}` when {adj.when}: {adj.reason}.")
    rpp = doc.rows_per_page
    pivot = doc.pivot_rules
    place = doc.placement
    lines = [
        "**When a table wins**",
        *gates,
        "",
        "**Authoring**",
        f"- `rows_per_page` ∈ {rpp.enum}: {rpp.lookup}; {rpp.long} for long tables; {rpp.with_format_cells}.",
        f"- Pivot: rows = {pivot.rows}; columns = {pivot.columns}; ≤{pivot.values.max} `values` as `{pivot.values.form}` "
        f"with {', '.join(pivot.values.aggs)}; source = {pivot.source}.",
        f"- Period labels {pivot.period_labels}. Totals: {pivot.totals}.",
        "- `format_cells.scope`: "
        + "; ".join(f"`{k}` to {v}" for k, v in pivot.format_cells.scope.items())
        + f". Colours `{pivot.format_cells.colors['min']}` → `{pivot.format_cells.colors['max']}` (hex only). "
        + "Never for "
        + ", ".join(pivot.format_cells.forbid)
        + ".",
        "",
        "**Valid but wrong**",
        *[f"- {g}" for g in doc.gotchas],
        "",
        "**Placement**",
        f"- Detail tables {place.detail.position}, full width; height by rows "
        + ", ".join(f"≤{n} → `{h}`" for n, h in sorted(place.detail.height_by_rows.items()))
        + f", else `{place.detail.default_height}` (never {', '.join(place.detail.never)}; paging handles length).",
        f"- A pivot with ≤{place.pivot_beside_chart.max_columns} columns may sit beside its chart "
        f"(`[8, 4]` up to {place.pivot_beside_chart.two_to_one_up_to} columns, else `[6, 6]`); "
        f"a ≤{place.kpi_table.max_rows}×{place.kpi_table.max_cols} table may replace a KPI strip at `{place.kpi_table.height}`.",
        f"- At most {place.max_tables_per_row} table per row; {place.section}; {place.mobile}.",
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
    "charts/table.md": table_rules_markdown,
}


def rendered_patterns(doc=None):
    """``{filename: text}`` for every pattern's on-demand skill."""
    doc = doc or load_interactivity()
    return {f"{p.name}.md": pattern_markdown(p) for p in doc.patterns}


def rendered(path):
    """The skill file with its rules block regenerated."""
    text = path.read_text()
    key = path.relative_to(SKILLS_DIR).as_posix() if SKILLS_DIR in path.parents else path.name
    body = RENDERERS[key]()
    if not BLOCK.search(text):
        raise ValueError(f"{path} has no {START} … {END} block")
    return BLOCK.sub(lambda _: f"{START}\n{body}\n{END}", text)


def main(argv=None, out=sys.stdout):
    for name in RENDERERS:
        path = SKILLS_DIR / name
        path.parent.mkdir(exist_ok=True)
        path.write_text(rendered(path))
        out.write(f"rendered {path}\n")
    INTERACTIONS_DIR.mkdir(exist_ok=True)
    for name, text in rendered_patterns().items():
        (INTERACTIONS_DIR / name).write_text(text)
        out.write(f"rendered {INTERACTIONS_DIR / name}\n")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
