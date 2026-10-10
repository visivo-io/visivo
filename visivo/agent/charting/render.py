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

from visivo.agent.charting.rules import load_families, load_layout, load_tables

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


RENDERERS = {
    "design-a-dashboard.md": layout_rules_markdown,
    "charts/table.md": table_rules_markdown,
}


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
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
