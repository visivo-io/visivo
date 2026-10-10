---
name: table
summary: When a table or a pivot beats a chart, and how to author one that reads.
family: table
---

# Tables and pivots

A table is for looking a value up; a chart is for seeing a shape. `recommend_charts`
returns `table` or `table_pivot` with a `table_yaml` skeleton when one of the gates
below fires, and adds `detail_table_below` to any chart over a long list. Every
exploratory dashboard ends with one detail table.

<!-- rules:start -->
**When a table wins**
- `table` when identifier or high cardinality: identifier-level detail is for looking up, not charting.
- `table` when intent == detail: exact values were asked for.
- `table` when exact_values: the figures must be read exactly.
- `table` when metrics >= 4 and dimensions small: four or more measures per row read as columns, not grouped bars.
- `table` when mixed units per row: rows mix units no single axis can hold.
- `table` when cross cells > 400: too many cells for a heatmap; a paged table with an input filter reads them.
- `table_pivot` when cross cells in (400, 2000]: too many cells for a heatmap, few enough to scan as a cross-tab.
- `table_pivot` when time columns <= 12 and intent in (detail, compare): exact figures per period read across a row.
- `table_pivot` when part_of_whole and totals_required: a composition with totals is a cross-tab (totals built in SQL).
- `table_pivot` when exact_values: the figures must be read exactly.

**Authoring**
- `rows_per_page` ∈ [3, 5, 15, 25, 50, 100, 500, 1000]: smallest enum value >= expected rows when rows <= 50, so no pager appears; 50 for long tables; smallest enum value >= pivot row count, because the gradient is computed per page.
- Pivot: rows = the higher-cardinality dimension (scrolls; sticky left); columns = the lower-cardinality dimension; row fields + values x its cardinality must fit the column budget; ≤3 `values` as `agg(${ref(model).field})` with sum, avg, count, min, max, median; source = a row-grain model; an aggregated insight only with sum over additive pre-aggregates.
- Period labels lexicographically sortable (YYYY-MM, YYYY-Qn); pivots have no ORDER BY. Totals: not rendered by the table; build them as a category in SQL (GROUPING SETS).
- `format_cells.scope`: `column` to compare rows within each column (vendors within a month); `row` to follow one entity across columns (one vendor across months); `table` to only when every value column shares one unit and scale. Colours `#e8d5df` → `#713b57` (hex only). Never for signed or diverging metrics, non-hex colours, scope table with mixed units.

**Valid but wrong**
- Alias every `columns` entry (`${ref(x).col} as "Label"`); an unaliased header is the raw, or on an insight the hashed, column name.
- `rows_per_page` has no 10: the enum is 3, 5, 15, 25, 50, 100, 500, 1000.
- `data` excludes `columns`/`rows`/`values`; a `data:` table over an insight shows prop paths (X, Y) as headers.
- `rows` needs `values` and `columns`; every `values` entry must be `agg(...)` or the browser query fails after a clean compile.
- Pivoting an already aggregated insight re-aggregates silently (avg, count, median come out wrong); point pivots at a row-grain model.
- On an insight, `${ref(insight).field}` names a prop (x, y, text), not a SQL column.
- Only the first referenced source is queried; never mix sources in one table.
- Gradients are computed over the current page, treat null as 0 and colour numeric id/year columns too; set rows_per_page >= the pivot's rows.
- A `columns` or pivot table ignores inputs; an input-filtered table needs `data: ${ref(insight)}` with the interaction on the insight.

**Placement**
- Detail tables last, full width; height by rows ≤3 → `small`, ≤7 → `medium`, else `large` (never xlarge; paging handles length).
- A pivot with ≤6 columns may sit beside its chart (`[8, 4]` up to 4 columns, else `[6, 6]`); a ≤3×3 table may replace a KPI strip at `small`.
- At most 1 table per row; under the section header, after its charts; stacks full width below 1024 px; the chart before the table.
<!-- rules:end -->
