---
name: multivariate
summary: Parallel coordinates; each row is a line across several numeric axes, brushable to filter profiles.
family: multivariate
---

# Multivariate charts

Read this after `recommend_charts` names the family and before `write_insight`. Generated from the trace rules; do not edit by hand.

<!-- rules:start -->
**Traces**
- `parcoords` (niche): Parallel coordinates; each row is a line across several numeric axes, brushable to filter profiles.
- `splom` (niche): Scatter-plot matrix of several numeric columns; every pairwise relationship at once, for exploration.

**Use when**
- Several numeric columns per entity (zone, driver, day) and the question is which profiles co-occur, e.g. high fare with short distance and low tip.
- Rows aggregated per entity (one line per zone or driver), and an analyst who will brush axes.
- Ranking trade-offs across many measures where a splom would need too many panels.
- `intent: relationship` over several numeric columns with no single x/y pair singled out (fare, distance, minutes, tip).
- Few enough rows to plot every point (sampled if needed) and an analyst audience screening for correlations before choosing one scatter.
- A categorical of 2–7 values to compare clusters across every pair: `split`.

**Avoid when**
- Too few numeric columns to form a profile; a scatter is clearer.
- Categorical columns as axes; parcoords wants numbers, use `parcats` for categories.
- Too many lines; they overplot into a hairball, so aggregate per entity or sample.
- Non-analyst audiences; axis order drives the reading and brushing is not discoverable, so show the key measures as bars.
- A single pair of numeric columns; that is one scatter, larger and with real axes.
- Too many columns; the panel count grows with the square and each panel shrinks to a few pixels, so pick the ones that matter or use parcoords.
- Too many rows unsampled; every point is drawn once per panel, so sample in SQL or move to histogram2d on the one pair that matters.
- Executive or summary dashboards; a splom is an exploration tool, not a finding, so promote the interesting pair to a scatter.

**Data shape:** 3–8 metrics; 0–1 dimensions; 20–5000 rows (identifier, categorical).

**Limits:** 1 series ideal, 1 at most; over the limit, repair with `sample`, `regrain`, `input_filter`.

**Gotchas**
- One trace, one line per row: there is no legend and a `split` overlays several parcoords on the same domain; group per entity in SQL instead.
- Set the grain with a non-aggregate prop (`ids: ?{ pickup_zone }`): Visivo groups by it, giving one line per zone. With no aggregate, every raw row becomes a line.
- `line.color` must be numeric with a `line.colorscale`; a constant color opts out of the theme and a CASE of strings does nothing useful.
- Axis order is the reading order; put the measure of interest in the middle so both neighbours relate to it.
- Clip tails in SQL; one outlier stretches its axis and every other line collapses to its bottom.
- Each `dimensions[].values` is a raw column (no GROUP BY) and every dimension must come from the same model so rows line up.
- Sample in a dedicated model (`select * from trips using sample 5000`); an input filter does not cap the rows a split splom ships.
- Clip each column's tail in SQL; one outlier squashes its whole row and column of panels.
- Splom panels are WebGL; they count toward the browser's ~8–16 WebGL context cap like scattergl.
- Color clusters with `split` rather than a hard-coded CASE on `marker.color`, so the theme colorway (and its colorblind-safe order) applies.

**Variations**
- When one measure should color the lines: `line.color` bound to that measure with a sequential `line.colorscale`; the only legitimate color here.
- When the view should open on a known region of interest: `dimensions[].constraintrange` pre-brushes that axis.
- When measures share a unit and should compare on one scale: the same `dimensions[].range` on each of those axes.

**Other uses**
- One categorical attribute (plan tier, region) as an axis among the numeric ones. Encode it as an integer with a CASE in that dimension's `values`, and label the axis with `tickvals` and `ticktext`.

**Placement:** `large` height, 12 of 12 columns, as a `relationship`; pair with `detail_table_below`.
**Mobile:** Poor below 1024 px; use fewer axes, full width, and accept that brushing is fiddly on touch.

**Example** (`parcoords`)

```yaml
insights:
  - name: zone-profiles
    props:
      type: parcoords
      ids: ?{ ${ref(trips).pickup_zone} }
      dimensions:
        - {label: Avg fare, values: "?{ avg(${ref(trips).fare_amount}) }"}
        - {label: Avg miles, values: "?{ avg(${ref(trips).trip_distance}) }"}
        - {label: Tip %, values: "?{ avg(${ref(trips).tip_pct}) }"}
        - {label: Trips, values: "?{ count(*) }"}
      line:
        color: ?{ avg(${ref(trips).tip_pct}) }
        colorscale: Viridis
```
<!-- rules:end -->
