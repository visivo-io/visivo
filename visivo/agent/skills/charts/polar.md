---
name: polar
summary: Bars around a circle; only for a cyclic axis (hour of day, weekday, month, compass) where the wrap-around matters.
family: polar
---

# Polar charts

Read this after `recommend_charts` names the family and before `write_insight`. Generated from the trace rules; do not edit by hand.

<!-- rules:start -->
**Traces**
- `barpolar` (niche): Bars around a circle; only for a cyclic axis (hour of day, weekday, month, compass) where the wrap-around matters.
- `scatterpolar` (niche): Radar or spider chart: normalized metrics as spokes, one closed shape per entity.
- `scatterpolargl` (niche): WebGL scatterpolar; only for dense clouds of raw direction × magnitude points (wind readings, vehicle headings).

**Use when**
- A `time` dimension reduced to a cycle part (hour of day, day of week, month of year) as `theta`, one additive metric as `r`.
- Compass direction sectors with a count or sum: a wind rose, a heading, a bearing.
- The story is the wrap-around itself: 23:00 sits next to 00:00 and December next to January, where a linear bar would split the peak.
- A few-valued additive categorical stacked on top via `split` (speed bucket, payment type); polar bars stack by default.
- A profile comparison: several metrics of the same polarity (higher is better) for a handful of entities, such as a company scorecard or a borough profile.
- An explicit request for a radar or spider chart, and the metrics have been normalized to one scale (0–1 or % of max) in SQL.
- Raw observations with an angle and a magnitude (wind direction × speed, heading × speed), with too many points after filtering for plain `scatterpolar`.
- A `scatterpolar` case that exceeds its point budget; the same cyclic-axis gate applies.

**Avoid when**
- The axis is not cyclic (sequential months over several years, unordered categories, ranks or stages); the circle implies a wrap that is not there. Use a bar or a line.
- Exact comparison between wedges matters; wedge area grows with the square of `r` and exaggerates differences, so a linear bar is more honest.
- Two cyclic dimensions (hour × weekday); that grid belongs in a heatmap, not a set of split roses.
- Too many sectors to read, or a non-additive metric (averages, rates) stacked by `split`.
- Metrics in different units left raw; the shared radial axis lets the largest unit flatten the rest. Normalize, or use grouped bars.
- Too many entities or spokes; overlapping fills are unreadable. Use a heatmap (entity × metric) or small multiples.
- Reading magnitudes or ranking; shape area depends on spoke order, which is arbitrary, so a grouped bar or a table is honest.
- A non-cyclic theta (dates in sequence, ranks); the closing segment invents a link from the last value back to the first.
- Radar charts, and any point count plain `scatterpolar` handles; it renders crisper and supports `fill: toself` reliably.
- A non-cyclic angle, or a question about how much per direction; aggregate to a barpolar rose instead.
- A dashboard already holding several WebGL charts; browsers cap the number of WebGL contexts per page.

**Data shape:** 1 metric; 1–2 dimensions; 7–24 values on the main dimension (time, categorical).

**Limits:** 3 series ideal, 6 at most; over the limit, repair with `regrain`, `bar`, `heatmap`, `input_filter`.

**Gotchas**
- Numeric `theta` is read as degrees: `extract(hour ...)` squeezes 24 bars into 0–23°. A zero-padded label (`strftime(ts, '%H')`) is still read as a number, so also set `layout.polar.angularaxis.type: category`, or multiply (`hour * 15`).
- A category angular axis only has the slots present in the data; a missing hour shifts every later wedge. Build a complete spine (`generate_series` + LEFT JOIN) or set `layout.polar.angularaxis.categoryarray`.
- Weekday and month names sort alphabetically; sort on `isodow` or `month` and label with `dayname` or `monthname`.
- The default angular axis starts at 3 o'clock and runs counter-clockwise; set `direction: clockwise, rotation: 90` so the cycle reads like a clock.
- A constant `marker.color`, or a hex CASE per split value, opts out of the theme; `split` already colors each series.
- Metrics are columns but a radar wants rows: UNPIVOT (`unpivot ... on fare, distance, tip_rate`) to (entity, metric, value) first, with a spoke-order column; one insight per metric is wrong.
- Normalize per metric in SQL (`value / max(value) over (partition by metric)`); raw fare in dollars next to trip counts in thousands collapses every other spoke.
- A line does not close itself: use `fill: toself`, or repeat the first spoke as the last row.
- Sort on an explicit spoke-order column so every split series walks the spokes in the same order; otherwise category order follows the first series seen.
- Numeric `theta` is degrees, but a radar wants category labels. Do not set a constant `line.color`; `split` colors each series from the theme.
- `theta` must be degrees (or set `thetaunit: radians`); a categorical theta defeats the point of a dense cloud.
- The browser still receives every row; sample or clip in SQL on large tables.
- Set `marker.opacity` to 0.2–0.4 or the cloud is a solid disc.
- Same theme rule as scatter: no constant `marker.color`; color only from a CASE that encodes data.

**Variations**
- When a second categorical with a few additive values: `split`; the series stack into a rose.
- When a second cyclic dimension: switch to a heatmap (hour × weekday); never a split per weekday.
- When a second dimension that is not cyclic, such as borough: an input_filter, or small_multiples with one rose each.

**Other uses**
- Polar range bars, the low-to-high spread of a metric per hour or month. `base: ?{ min(<m>) }` and `r: ?{ max(<m>) - min(<m>) }` on the cyclic `theta`.

**Placement:** `medium` height, 6 of 12 columns, as a `breakdown`; pair with `chart_beside(bar)`, `kpi_strip_above`.
**Mobile:** A rose needs a square; at half width it survives the stack, but keep few stacked series and label every other sector on an hour-of-day rose.

**Example** (`barpolar`)

```yaml
insights:
  - name: rides-by-hour-of-day
    props:
      type: barpolar
      theta: ?{ strftime(${ref(trips).pickup_at}, '%H') }
      r: ?{ count(*) }
    interactions:
      - sort: ?{ strftime(${ref(trips).pickup_at}, '%H') ASC }
charts:
  - name: rides-clock
    insights:
      - ${ref(rides-by-hour-of-day)}
    layout:
      polar: {angularaxis: {type: category, direction: clockwise, rotation: 90}}
```
<!-- rules:end -->
