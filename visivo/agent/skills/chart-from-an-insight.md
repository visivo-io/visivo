---
name: chart-from-an-insight
summary: Build an insight and its chart in the order that catches mistakes before the user sees them.
---

# Build a chart from an insight

An insight is the query; a chart is how it is drawn. A chart that references
an insight that does not exist yet fails the DAG, so write the insight first.

1. `recommend_charts` with the metric and dimensions you plan to show. It
   returns ranked families, the repairs a long dimension needs and a skeleton.
2. `read_skill('charts/<family>')` for the family you pick. Its gotchas are the
   mistakes that compile cleanly and render wrong.
3. `write_insight`, referring to its model with `${ref(model_name)}`.
4. `preview_insight` and read the rows. Check that every prop has values, that
   categories are what you expect, and that the numbers are plausible. Fix
   the insight here; the preview fails where the dashboard would.
5. `write_chart`, referring to the insight with `${ref(insight_name)}`. Give the
   chart its own name, e.g. `trips_by_day_chart`. Names are unique across the
   project, so a chart named after its insight is refused. Call
   `get_schema('charts')` first if you set layout props you have not used.

## Format every number a reader sees

An unformatted value reads as a bug.

- KPI (`indicator`): `number.valueformat` (`,.0f`, `$,.0f`, `.1%`) and
  `number.prefix` or `number.suffix` for units.
- Axes: `layout.yaxis.tickformat` (`$,.0f`, `.0%`) and an axis title with the unit.
- Rates: compute a share as a fraction and format it with `%`; never print
  `8.000414846174507`.
- Tables: round in SQL (`round(x, 2)`), alias every column with its unit
  (`as "Avg fare ($)"`), and keep year columns as text or integers without
  thousands separators.

## Columns must exist

A chart's props name columns the insight produces. If the model's SQL did not
alias them (see `build-a-model`), the names are not what you expect.
`preview_insight` returns `props_mapping`, which maps each prop to its column.
