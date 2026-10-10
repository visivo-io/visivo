---
name: make-it-interactive
summary: Give every dashboard the controls its data invites; a static page is a choice you justify.
always: true
---

# Make it interactive

Interactions run in the browser, instantly, with no re-query, so an input
costs clutter, never time. After profiling, call `recommend_inputs` with the
shape cards (each with its model) and the insights you plan (name, model, the
columns each reads, its chart); it returns input YAML, a default, the
interaction to put on **every** insight that shares the column, and
`layout_inputs` for `recommend_layout`. If you ship no input, tell the user why.

<!-- rules:start -->
| column | cardinality | input → interaction | why |
|---|---|---|---|
| categorical/geo_region/boolean/text/numeric_continuous/numeric_discrete/time | one | — | a constant column has nothing to choose |
| boolean | any | single-select `tabs` → `filter` | a toggle has no "all" state, so a boolean filter is three tabs |
| categorical/geo_region | few (n –5) | single-select `tabs` → `filter` | up to five values read as tabs |
| categorical/geo_region | few (n 6–) | single-select `radio` → `filter` | six or seven values fit a radio group |
| categorical/geo_region | some (n –15) | multi-select `chips` → `filter` | a short list to pick several from; the default is the top five, as an explicit list |
| categorical/geo_region | some (n 16–) | multi-select `dropdown` → `filter` | chips crowd past fifteen values |
| categorical/geo_region | many, high | single-select `autocomplete` → `filter` | a searchable list is the only control that scales past twenty values |
| numeric_continuous | any | multi-select `range-slider` → `filter` | a continuous measure is bounded, not listed |
| numeric_discrete | any (n –30) | single-select `slider` → `filter` | a small set of whole numbers reads as a threshold slider |
| numeric_discrete | any (n 31–) | multi-select `range-slider` → `filter` | past thirty values a discrete column behaves like a continuous one |
| time | any | multi-select `date-range` → `filter` | a date window with a default that still leaves a readable trend |
| identifier/geo_point/text | any | — | identifiers are not filter dimensions and no free-text, map-bounds or search input exists |

- **Counts:** 4 inputs at most, in one `compact` top row with a header saying what they control; an input that drives one chart sits beside its chart as [8, 4]; ≤3 survive the mobile stack.
- **Input vs split:** split a `few` column; from `some` up, an input.
- **Defaults:** every input has one, so the first render is complete. Multi-select defaults are an explicit list (never `all` or a query); numeric ranges default to the full span; a time default leaves ≥12 points at the column's grain.
- **Quoting:** string operands as `'${ref(I).value}'`, numbers bare. Input names are snake_case (the viewer substitutes `\w+` names only).
- **Order:** write inputs before the insights that reference them. A global filter goes on **every** insight that reads the column; `check_input_wiring` finds the ones you missed.
- **Limits:** chart `layout` props (barmode, axis type) cannot read inputs; back the table with an insight that carries the interaction (a table on a model ignores inputs); an input-driven insight ships its whole model to the browser, so pre-aggregate above 1,000,000 rows.
- **Patterns** (read `interactions/<name>` before using one): `global_filter`, `split_switcher`, `threshold_highlight`, `metric_switcher`, `prop_driven`, `top_n`, `sort_direction`, `cascading_options`.
<!-- rules:end -->
