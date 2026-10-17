---
name: ternary_smith
summary: Points in a triangle for three parts that sum to a whole, one point per entity; needs explicit intent.
family: ternary_smith
---

# Ternary smith charts

Read this after `recommend_charts` names the family and before `write_insight`. Generated from the trace rules; do not edit by hand.

<!-- rules:start -->
**Traces**
- `scatterternary` (niche): Points in a triangle for three parts that sum to a whole, one point per entity; needs explicit intent.
- `scattersmith` (niche): Smith chart of normalized complex impedance for RF engineering; essentially never right for BI data.

**Use when**
- Exactly three additive parts of a whole per entity (card, cash and other share of trips per pickup zone) across many entities.
- The question is where entities cluster in the mix (card-heavy against cash-heavy zones), not the size of any one part.
- RF or network-analyzer data only: normalized complex impedance or reflection (real and imaginary parts divided by Z0) swept over frequency, and the user asked for a Smith chart.

**Avoid when**
- Too few entities to form clusters; a 100% stacked bar per entity is readable and needs no triangle literacy.
- Other than three parts: a single share is a bar or histogram; with more parts pick three, or use a heatmap of entity × part.
- Parts that are not additive or can be negative; ternary coordinates are normalized to the sum, so the point means nothing.
- Any general audience without an explicit request; most readers cannot read ternary gridlines.
- Any business metric; no BI shape maps to impedance, so never propose it without an explicit request.
- Two arbitrary numbers per row; that is an x/y scatter, and the Smith grid would distort them non-linearly.
- Impedance not normalized to the reference impedance (usually 50 Ω); the points land in the wrong place.

**Data shape:** 3 metrics; 1–2 dimensions; 15–2000 rows (categorical, identifier, geo_region).

**Limits:** 3 series ideal, 6 at most; over the limit, repair with `collapse_rare`, `input_filter`, `bar`.

**Gotchas**
- Pass all three of `a`, `b` and `c` as raw counts and Plotly normalizes each point. With only two, the third is `sum` minus them (default 1), so raw counts land off the triangle.
- Without `layout.ternary.aaxis.title` (and `baxis`, `caxis`) the corners are unlabeled and the chart is unreadable; set them explicitly.
- Tiny entities sit on the corners (1 trip is 100% cash); filter them with HAVING or size markers by volume.
- `text` is the grouping column (one point per zone); it is not an aggregate, so it defines the GROUP BY.
- `real` and `imag` are normalized impedance: divide by Z0 in SQL; raw ohms put every point at the rim.
- Sort by frequency or the sweep zig-zags (the same rule as scatter lines).
- Write every column as `${ref(model).col}`; a bare `?{ real }` collides with `real`, which is also a SQL type keyword.

**Variations**
- When entities differ a lot in volume: `marker.size: ?{ sqrt(count(*)) }` so a 3-trip zone does not look as certain as a 30k-trip one.
- When a grouping with a few values, such as borough: `split`, one color per borough.
- When more entities than the triangle can hold: drop small entities with HAVING before plotting.

**Placement:** `large` height, 6 of 12 columns, as a `relationship`; pair with `detail_table_below`, `chart_beside(bar)`.
**Mobile:** The triangle needs a square; at half width the axis titles crowd, so turn tick labels off and rely on hover.

**Example** (`scatterternary`)

```yaml
insights:
  - name: payment-mix-by-zone
    props:
      type: scatterternary
      mode: markers
      a: ?{ sum(case when ${ref(trips).payment_type} = 'card' then 1 else 0 end) }
      b: ?{ sum(case when ${ref(trips).payment_type} = 'cash' then 1 else 0 end) }
      c: ?{ sum(case when ${ref(trips).payment_type} not in ('card', 'cash') then 1 else 0 end) }
      text: ?{ ${ref(trips).pickup_zone} }
charts:
  - name: payment-mix
    insights:
      - ${ref(payment-mix-by-zone)}
    layout:
      ternary: {aaxis: {title: {text: Card}}, baxis: {title: {text: Cash}}, caxis: {title: {text: Other}}}
```
<!-- rules:end -->
