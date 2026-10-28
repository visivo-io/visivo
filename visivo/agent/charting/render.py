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
    load_family_doc,
    load_insight_design,
    load_interactivity,
    load_layout,
    load_tables,
    load_transforms,
)
from visivo.agent.charting.schema import Intent, Semantics, bucket_bounds

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


def _values(low, high):
    """A distinct-value range as the skills state it: ``2–7``, ``≤30``, ``21+``."""
    low = low if low and low > 1 else None
    if low is None and high is None:
        return "any"
    if low is None:
        return "1" if high <= 1 else f"≤{high}"
    if high is None:
        return f"{low}+"
    return f"{low}–{high}"


def _split_line(min_bucket):
    first_input, _ = bucket_bounds(min_bucket)
    return (
        f"split a column of up to {first_input - 1} values; from {first_input} values up, an input"
    )


def _card_row(rule):
    match = rule.match
    roles = "/".join(match.role)
    values = _values(match.n_min, match.n_max)
    if rule.input == "none":
        return f"| {roles} | {values} | — | {rule.why} |"
    return (
        f"| {roles} | {values} | {rule.input.type} `{rule.input.display}` → "
        f"`{rule.wiring.interaction}` | {rule.why} |"
    )


def interactivity_rules_markdown(doc=None, insight_design=None):
    """The interactivity rules as the make-it-interactive skill states them."""
    doc = doc or load_interactivity()
    min_points = (insight_design or load_insight_design()).reductions.regrain.points_min
    d = doc.design_rules
    lines = [
        "| column | distinct values | input → interaction | why |",
        "|---|---|---|---|",
        *[_card_row(rule) for rule in doc.card_to_input],
        "",
        f"- **Counts:** {d.max_inputs_per_dashboard} inputs at most, in one `{d.inputs_row.height}` top row "
        f"with a header saying what they control; an input that drives one chart sits {d.chart_local_input}; "
        f"≤{d.max_inputs_mobile_row} survive the mobile stack.",
        f"- **Input vs split:** {_split_line(d.input_over_split_min_bucket)}.",
        f"- **Defaults:** every input has one, so the first render is complete. Multi-select defaults are an "
        f"explicit list (never `all` or a query); numeric ranges default to the full span; a time default "
        f"leaves ≥{min_points} points at the column's grain.",
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


def _lifts(rule):
    """``({intent: delta}, [flag])`` a family's positive score clauses name."""
    intents, flags = {}, []
    for adjustment in rule.score:
        if adjustment.delta <= 0:
            continue
        for part in adjustment.when.split(" and "):
            named = []
            if part.startswith("intent == "):
                named = [part[len("intent == ") :]]
            elif part.startswith("intent in ("):
                named = part[len("intent in (") : -1].split(", ")
            elif part in Semantics.model_fields:
                flags.append(part)
            for intent in named:
                intents[intent] = max(intents.get(intent, 0), adjustment.delta)
    return intents, flags


def choose_rules_markdown(doc=None, interactivity=None):
    """The decision tree the choose-a-chart skill states: intent and
    semantics to family, the boundaries a map needs, cardinality buckets,
    and the repair vocabulary."""
    doc = doc or load_family_doc()
    interactivity = interactivity or load_interactivity()
    by_intent, by_flag = {}, {}
    for rule in doc.families:
        intents, flags = _lifts(rule)
        for intent, delta in intents.items():
            by_intent.setdefault(intent, []).append((-delta, rule.name))
        required = [f for f in rule.hard_gates.requires if f in Semantics.model_fields]
        for flag in dict.fromkeys(flags + required):
            name = f"{rule.name} (required)" if flag in required else rule.name
            by_flag.setdefault(flag, []).append(name)
    intents = "; ".join(
        f"{intent} → {', '.join(name for _, name in sorted(by_intent[intent]))}"
        for intent in Intent.__args__
        if intent in by_intent
    )
    flags = "; ".join(
        f"`{flag}` → {', '.join(by_flag[flag])}"
        for flag in Semantics.model_fields
        if flag in by_flag
    )
    mapped = [rule.name for rule in doc.families if "region boundaries" in rule.hard_gates.requires]
    repairs = ", ".join(f"`{t.name}`" for t in load_transforms().transforms if t.fixes)
    split = _split_line(interactivity.design_rules.input_over_split_min_bucket)
    many, _ = bucket_bounds("many")
    high, _ = bucket_bounds("high")
    return "\n".join(
        [
            f"- **Intent → family**, strongest first: {intents}.",
            f"- **Semantics → family:** {flags}.",
            f"- **Maps:** {', '.join(mapped)} {'needs' if len(mapped) == 1 else 'need'} a region Plotly knows "
            f"({', '.join(doc.builtin_boundaries)}) or `boundaries_available`.",
            f"- **Cardinality** is the card's distinct-value count: {split}. An identifier, or a "
            f"lookup list of {high} or more values, is a table; a chart over a list of {many} or "
            "more values pairs with `detail_table_below`.",
            f"- **Repairs**, each entry trying its own in order: {repairs}.",
        ]
    )


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


def _range(bound, unit):
    if bound is None or (bound.min is None and bound.max is None):
        return None
    if bound.max == 1 and bound.min in (None, 1) and unit.endswith("s"):
        unit = unit[:-1]
    if bound.max is None:
        return f"{bound.min}+ {unit}"
    if bound.min is None or bound.min == bound.max:
        return f"{'up to ' if bound.min is None else ''}{bound.max} {unit}"
    return f"{bound.min}–{bound.max} {unit}"


def _shape_line(shape):
    parts = [
        _range(shape.metrics, "metrics"),
        _range(shape.dimensions, "dimensions"),
        _range(shape.cardinality, "values on the main dimension"),
        _range(shape.axis_points, "points on the axis"),
        _range(shape.cells, "cells"),
        _range(shape.rows, "rows"),
    ]
    roles = f" ({', '.join(shape.dimension_roles)})" if shape.dimension_roles else ""
    return "; ".join(p for p in parts if p) + roles


def _unique(items):
    seen, out = set(), []
    for item in items:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def family_skill_markdown(family):
    """One on-demand skill per chart family, generated whole from its entries:
    what to read between ``recommend_charts`` naming the family and
    ``write_insight``."""
    members = [m for m in family.members if m.status != "deprecated"]
    lead = members[0] if members else family.members[0]
    title = family.name.replace("_", " ")
    lines = [
        "---",
        f"name: {family.name}",
        f"summary: {lead.one_liner}",
        f"family: {family.name}",
        "---",
        "",
        f"# {title[0].upper() + title[1:]} charts",
        "",
        "Read this after `recommend_charts` names the family and before `write_insight`. "
        "Generated from the trace rules; do not edit by hand.",
        "",
        START,
        "**Traces**",
        *[f"- `{m.type}` ({m.status}): {m.one_liner}" for m in family.members],
        "",
        "**Use when**",
        *[f"- {u}" for u in _unique(u for m in members for u in m.use_when)],
        "",
        "**Avoid when**",
        *[f"- {a}" for a in _unique(a for m in members for a in m.avoid_when)],
        "",
        f"**Data shape:** {_shape_line(lead.data_shape)}.",
    ]
    limits = lead.limits
    if limits.series_ideal or limits.series_max or limits.repair:
        series = (
            f"{limits.series_ideal} series ideal, {limits.series_max} at most"
            if limits.series_max
            else ""
        )
        repair = (
            f"over the limit, repair with {', '.join(f'`{r}`' for r in limits.repair)}"
            if limits.repair
            else ""
        )
        lines += ["", "**Limits:** " + "; ".join(x for x in (series, repair) if x) + "."]
    gotchas = _unique([*family.warnings, *(g for m in members for g in m.gotchas)])
    if gotchas:
        lines += ["", "**Gotchas**", *[f"- {g}" for g in gotchas]]
    variations = [v for m in members[:1] for v in m.variations]
    if variations:
        lines += ["", "**Variations**", *[f"- When {v.when}: {v.then}." for v in variations]]
    if lead.other_uses:
        lines += ["", "**Other uses**", *[f"- {o.use} {o.how}" for o in lead.other_uses]]
    layout = family.layout_hint()
    placement = f"`{layout.height}` height, {round(layout.width_share * 12)} of 12 columns, as a `{layout.row_role}`"
    if lead.pairings:
        placement += "; pair with " + ", ".join(f"`{p}`" for p in lead.pairings)
    lines += ["", f"**Placement:** {placement}."]
    if lead.mobile:
        lines += [f"**Mobile:** {lead.mobile}"]
    lines += ["", f"**Example** (`{lead.type}`)", "", "```yaml", lead.example.rstrip(), "```", END]
    return "\n".join(lines) + "\n"


def rendered_family_skills(families=None):
    """``{filename: text}`` for every family whose skill is its own
    ``charts/<family>``; the table families share the hand-written one."""
    families = families or load_families()
    return {
        f"{f.name}.md": family_skill_markdown(f)
        for f in families
        if f.skill == f"charts/{f.name}" and f.name != "table"
    }


def _pct(share):
    return f"{share * 100:g} %"


def _metric_row(rule):
    additivity = ""
    if rule.additive:
        additivity = " (additive)" if rule.additive == [True] else " (not additive, or unknown)"
    aggs = [f"`{agg}`" for agg in rule.aggs]
    if rule.heavy_tail_agg:
        aggs.append(f"`{rule.heavy_tail_agg}` for `avg` on a heavy tail")
    if rule.duration_agg:
        aggs.append(f"`{rule.duration_agg}` of the time between two of them")
    return f"| {', '.join(rule.roles)}{additivity} | {'; '.join(aggs) or '—'} | {rule.why} |"


def insight_design_markdown(doc=None, interactivity=None):
    """The insight-design rules as the design-insights skill states them."""
    doc = doc or load_insight_design()
    interactivity = interactivity or load_interactivity()
    d = interactivity.design_rules
    pairing, red, sc, pf = doc.pairing_limits, doc.reductions, doc.scoring, doc.portfolio
    tail = doc.heavy_tail
    slots = ", ".join(f"≤{s.max} {s.name} ({'/'.join(s.intents)})" for s in pf.slots)
    lags = ", ".join(f"lag {lag} at {grain}" for grain, lag in sc.seasonality_lags.items())
    at_low, at_high = bucket_bounds(d.input_over_split_min_bucket)
    return "\n".join(
        [
            "| column | metrics | why |",
            "|---|---|---|",
            *[_metric_row(rule) for rule in doc.metric_by_role],
            "",
            "Every model also gets `count(*)`. A heavy tail is skew above "
            f"{tail.skew_over:g} or p99 above {tail.p99_over_median:g}× the median. "
            "The lead total (cross-tabs, maps, the first queries) has the strongest "
            "measured signal; before stats it is the first whose column names money or "
            f"volume ({', '.join(doc.primary_metric.words)}); with no total, the row count.",
            f"- **Pairing:** time with ≤{pairing.categoricals_with_time} categorical; two "
            f"categoricals up to {pairing.chart_max_cells} cells chart, up to "
            f"{pairing.pivot_max_cells} pivot when the smaller has at most "
            f"{load_tables().column_budget.full_width - 1} values, past that the larger "
            "becomes an input; an "
            "identifier is never a dimension, only the detail table's key.",
            f"- **Split vs input:** up to {at_low - 1} values, split; {_values(at_low, at_high)}, "
            f"`top_n_other` when the top {red.top_n_other.n} "
            f"hold ≥{_pct(doc.split_vs_input.top_n_min_share)} of rows, else an input; above "
            f"{at_high}, an input or the table. Time never splits.",
            "- **Reductions** (each is a proposed dimension, written once):",
            f"  - `top_n_other` (top {red.top_n_other.n}, at most {red.top_n_other.n_max}, "
            f"+ Other): {red.top_n_other.when};",
            f"  - `bucket` ({red.bucket.bins} bins): {red.bucket.when};",
            f"  - `regrain` ({red.regrain.points_min}–{red.regrain.points_max} points): "
            f"{red.regrain.when};",
            f"  - `collapse_rare` (under {_pct(red.collapse_rare.min_share)} → Other): "
            f"{red.collapse_rare.when};",
            f"  - `clip_p99`: {red.clip_p99.when}.",
            "- **Signals:** variance (CoV); trend, the better of a line (|slope| × R²) and a "
            "level change (a V, U or step: moving-average strength × swing, full at "
            f"{_pct(sc.material_change)} of the mean); concentration (Gini, "
            f"top-{sc.top_share_of} share); correlation (|r| on values clipped at p99, or "
            f"Spearman on pairs; a scatter from {sc.scatter_min_r:g}, a comparison across "
            f"bands from {sc.banded_min_r:g}, ×{sc.penalties.derived_correlation:g} from "
            f"{sc.derived_r:g} as one column is likely computed from the other); cross-tabs "
            f"(Cramér's V, ×{sc.penalties.dependent_pair:g} when one column predicts the other, "
            f"λ ≥ {sc.dependent_lambda:g}); seasonality ({lags}); anomalies (|z| > {sc.anomaly_z:g}). "
            f"Nulls over {_pct(sc.high_nulls)} ×{sc.penalties.high_nulls:g}; a constant metric "
            f"×{sc.penalties.constant_metric:g}.",
            f"- **Portfolio:** ≤{pf.max_candidates} with the detail table, each scoring at least "
            f"{pf.min_score:g}: {slots}; the KPI set "
            f"holds {pf.kpi_metrics.min}–{pf.kpi_metrics.max} metrics. A family already chosen "
            f"scores ×{pf.repeat_family:g}, a dimension already used ×{pf.repeat_dimension:g}.",
        ]
    )


INTERACTIONS_DIR = SKILLS_DIR / "interactions"
CHARTS_DIR = SKILLS_DIR / "charts"

RENDERERS = {
    "choose-a-chart.md": choose_rules_markdown,
    "design-a-dashboard.md": layout_rules_markdown,
    "make-it-interactive.md": interactivity_rules_markdown,
    "charts/table.md": table_rules_markdown,
    "design-insights.md": insight_design_markdown,
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
    CHARTS_DIR.mkdir(exist_ok=True)
    for name, text in rendered_family_skills().items():
        (CHARTS_DIR / name).write_text(text)
        out.write(f"rendered {CHARTS_DIR / name}\n")
    INTERACTIONS_DIR.mkdir(exist_ok=True)
    for name, text in rendered_patterns().items():
        (INTERACTIONS_DIR / name).write_text(text)
        out.write(f"rendered {INTERACTIONS_DIR / name}\n")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
