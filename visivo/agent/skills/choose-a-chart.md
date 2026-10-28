---
name: choose-a-chart
summary: Pick the chart family for an insight, and set its colour only when the colour is data.
always: true
---

# Choose a chart

Call `recommend_charts` before writing any chart. Pass the metrics (name,
agg, unit), the dimensions as shape cards from `profile_columns`, the intent
if the user has one, and the semantics the question carries (it cannot infer
them). Write the top skeleton or say why you passed it over, apply the
repairs it lists, add the pairings it names, and read the family's skill
before editing. Gates are structural (an ordered axis, a role, a required
semantic); sizes only rank and warn, so a chart the user names is never
refused, only repaired.

<!-- rules:start -->
- **Intent → family**, strongest first: kpi → kpi; trend → line, financial; compare → bar, table_pivot, polar, heatmap; rank → bar; composition → area, bar, hierarchy, part_of_whole; distribution → distribution, density2d, heatmap; relationship → xy, density2d, multivariate; flow → flow; change → line, financial, waterfall; geo → geo_region, geo_point, geo_density; detail → table_pivot, table.
- **Semantics → family:** `part_of_whole` → area, part_of_whole, ternary_smith, table_pivot; `cumulative` → area; `ordered_stages` → funnel (required); `signed_contributions` → waterfall (required); `hierarchy` → hierarchy; `exact_values` → table, table_pivot; `totals_required` → table_pivot.
- **Maps:** geo_region needs a region Plotly knows (iso3, country_name, us_state) or `boundaries_available`.
- **Cardinality** is the card's distinct-value count: split a column of up to 7 values; from 8 values up, an input. An identifier, or a lookup list of 101 or more values, is a table; a chart over a list of 21 or more values pairs with `detail_table_below`.
- **Repairs**, each entry trying its own in order: `top_n_other`, `input_filter`, `small_multiples`, `regrain`, `scattergl`, `dominant_category`, `bucket`, `collapse_rare`, `sample`, `grid_bucket`, `aggregate_to_centroid`.
<!-- rules:end -->

## Colour

Set `marker.color` (or `line.color`) on an insight only when the colour
encodes data: a CASE that pins a value to its colour (a line needs the `[0]`
slice, `"?{ CASE ... END }[0]"`), or a measure on a colorscale. Insight colour
takes precedence over the chart's `layout.colorway` and the theme by design
(Plotly's precedence), so a constant colour takes that chart out of the
palette and out of light/dark; change the palette with the theme's `colorway`.
