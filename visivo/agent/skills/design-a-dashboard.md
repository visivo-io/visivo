---
name: design-a-dashboard
summary: Arrange charts, tables and inputs into a page that reads top to bottom.
always: true
---

# Design a dashboard

A dashboard is read, not browsed: headline numbers, then the main picture,
then the breakdowns, then the detail. Call `recommend_layout` with **every**
chart, table and input you mean to place (name, kind, family, and `hints` for
importance, table row counts, heatmap rows, related KPIs) and write the rows
it returns; edit the markdown headers it leaves for you so each section says
what to look for.

<!-- rules:start -->
- **Order:** inputs → header → kpi → hero → breakdown → relationship → detail. A role with nothing in it is dropped.
- **Caps:** ≤12 charts/tables and ≤8 content rows per dashboard (split by `level` above that); ≤4 items per row; ≤4 global inputs in one compact top row; nesting ≤1.
- **Widths** sum to 12: peers split evenly (1: [12], 2: [6, 6], 3: [4, 4, 4], 4: [3, 3, 3, 3]); a chart with a side panel or its own input is [8, 4].
- **Heights:** kpi → small; line, area, xy, bar, part_of_whole, distribution, density2d, funnel, waterfall, polar, heatmap → medium; hierarchy, flow, geo_region, geo_point, geo_density, financial, multivariate, table → large; heatmap → grows with its rows; markdown, inputs → compact (never a chart in a compact row). KPI rows are `small` (an xsmall row has no plot area); the hero row is `large`; tables `large` unless they have ≤7 rows.
- **KPI cluster:** up to 3 KPIs stack beside the hero chart one per sub-row at `small`; a nested 2×2 always stacks, never emit one.
- **Mobile:** below 1024 px every item stacks full width at its row height, so lead each row with its most important item, keep ≤3 inputs, and put tables last.
<!-- rules:end -->

Two things it cannot know: which chart matters most (set `hints.importance`),
and which KPIs belong to the hero chart (`hints.related_kpis`). Pass an
`intent` when the user has one; it picks the hero, never the order.
