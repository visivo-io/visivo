---
name: distribution
summary: The shape of one numeric column, binned; compare a few groups by overlaying or stacking.
family: distribution
---

# Distribution charts

Read this after `recommend_charts` names the family and before `write_insight`. Generated from the trace rules; do not edit by hand.

<!-- rules:start -->
**Traces**
- `histogram` (preferred): The shape of one numeric column, binned; compare a few groups by overlaying or stacking.
- `box` (preferred): Compare the distribution of a numeric column across groups with medians, quartiles and outliers.
- `violin` (preferred): A box plot that also draws the density; pick it when the shape beyond quartiles matters and groups are large.

**Use when**
- One numeric_continuous or numeric_discrete column and the question is "how is it distributed".
- A few groups to compare (a categorical of 2–7 values) as overlaid or stacked histograms.
- Spotting skew, outliers, bimodality before choosing an average vs a median for the KPIs.
- One numeric column by a categorical of 2–20 values (trip minutes by borough, fare by payment type).
- Too many groups for overlaid histograms, which turn to mud; a box per group stays readable.
- Outliers matter and should be visible as points rather than clipped away.
- One numeric column by a categorical of 2–7 values where every group is large and the shape matters (bimodal fares, a second hump of airport trips).
- Two sub-groups per category to contrast side by side: two insights with `side: negative` / `side: positive` (split violin).
- A box would hide the story; two groups with the same median and IQR but different shapes.

**Avoid when**
- Too many groups to overlay; a box plot per group compares distributions without the overlap.
- Too many rows to bin in the browser; pre-bucket in SQL (`width_bucket`, `floor(x/step)*step`) and draw a bar.
- A heavy tail (p99 ≪ max) without clipping; one outlier stretches the axis and squashes the body.
- A categorical column; that is a bar of counts, not a histogram.
- A single group; a histogram shows the shape, and a lone box hides bimodality.
- Too many groups to label; use an input filter. A top-N pools the distinctive groups into an Other box that describes no real group.
- The audience needs exact figures; show median and p99 as a table or KPIs.
- Very small groups, where quartiles of a handful of points mislead; show the points (`boxpoints: all`) or a table.
- Small groups; the kernel density invents smooth shape from a handful of points, use box with `boxpoints: all`.
- Too many groups; the bodies get too narrow to read a shape, use box, which scales further.
- Audiences unfamiliar with density plots, or exact figures wanted; box or a median/p99 table reads faster.
- A bounded or discrete column (small counts, ratings); the kernel smears past the bounds, use bar of counts or `spanmode: hard`.

**Data shape:** 0 metrics; 1–2 dimensions (numeric_continuous, numeric_discrete, categorical, boolean).

**Limits:** 2 series ideal, 3 at most; over the limit, repair with `box`, `small_multiples`, `input_filter`.

**Gotchas**
- A histogram takes the raw column, not an aggregate: `x: ?{ trip_distance }` with no GROUP BY; every row is sent to the browser.
- Clip the tail in SQL (`least(x, p99)`) rather than with `xaxis.range`, which hides bins but still bins them.
- `nbinsx` is a hint; Plotly picks nice edges. Set `xbins.size` when the step matters (e.g. 1 km).
- Overlaid groups need `opacity` < 1, `barmode: overlay` on the chart layout, and one `bingroup`; otherwise the front group hides the rest and each group gets its own bin width.
- Zero and null are different: filter nulls in SQL, and ask whether zeros are real before binning them.
- A box takes raw rows, not an aggregate: `y: ?{ trip_minutes }` with no GROUP BY; on large tables precompute quartiles in SQL.
- `x` is the group, `y` the value; swapping them with `orientation: h` also swaps the props.
- `boxpoints: all` on a large group draws every row; use `outliers` (the default) or `false`.
- Groups appear in storage order; add `- sort: ?{ <group expr> }` or sort by the median in SQL.
- Never clip the values (`least(x, p99)`): one global cap moves the quartiles of every long group. A heavy tail shows as outlier points; zoom with `layout.yaxis.range` if it must.
- Raw rows, no aggregate on `y` (like box); every row is shipped and the browser runs the KDE, so sample in SQL on large tables.
- `points` defaults to `outliers`; `points: all` on a large group draws every row, so use `false` and `box.visible: true`.
- Never clip the values (`least(x, p99)`): one global cap piles every long group's tail onto one value. Zoom a long tail with `layout.yaxis.range`; `spanmode: hard` stops the kernel at the data.
- `split` on the same column as `x` makes one trace per group; harmless, but it doubles the legend. Split only on a second dimension.
- The density is smoothed (`bandwidth` auto); say 'estimated density' in the subtitle and never read a value off the outline.

**Variations**
- When a second dimension of 2–7 values: `split` with the chart `layout.barmode: overlay` and `opacity: 0.6`, or `barmode: stack`.
- When comparing groups of different size: `histnorm: percent` so shapes compare, not totals.
- When the column is a timestamp: that is counts per period, i.e. a bar or line after `date_trunc`, not a histogram.

**Other uses**
- A cumulative distribution (CDF), e.g. the share of trips under a given distance. `cumulative: {enabled: true}` with `histnorm: percent`.
- A metric summed per bin instead of a row count, e.g. revenue by distance band. `x: ?{ <numeric column> }`, `y: ?{ <metric column> }` and `histfunc: sum` (or `avg`).

**Placement:** `medium` height, 6 of 12 columns, as a `relationship`; pair with `chart_beside(box)`, `kpi_strip_above`.
**Mobile:** Fewer groups than on desktop; with `histnorm` set, name the unit (percent of trips) in the axis title.

**Example** (`histogram`)

```yaml
insights:
  - name: trip-distance-distribution
    props:
      type: histogram
      x: ?{ least(${ref(trips).trip_distance}, 30) }
      nbinsx: 40
      histnorm: percent
    interactions:
      - filter: ?{ ${ref(trips).trip_distance} > 0 }
      - split: ?{ ${ref(trips).payment_type} }
```
<!-- rules:end -->
