---
name: density2d
summary: Two numeric columns binned into a colored grid; the repair for a scatter too dense to read.
family: density2d
---

# Density2d charts

Read this after `recommend_charts` names the family and before `write_insight`. Generated from the trace rules; do not edit by hand.

<!-- rules:start -->
**Traces**
- `histogram2d` (preferred): Two numeric columns binned into a colored grid; the repair for a scatter too dense to read.
- `histogram2dcontour` (niche): Smoothed density contours of two numeric columns; a histogram2d drawn as iso-lines for overlays.
- `contour` (niche): Iso-lines of a z surface over a regular numeric x/y grid; a smoothed heatmap for continuous axes.

**Use when**
- Two numeric_continuous columns with so many rows that a scatter or scattergl is a solid blob (fare vs distance over every trip).
- Where-is-the-mass questions: which distance × fare band holds most trips.
- A third numeric averaged per cell: `z` + `histfunc: avg` (average tip by distance × duration).
- `intent: distribution` over two numeric columns when the audience wants the shape of the cloud, not cell counts.
- Outlining where the mass sits on top of a scattergl of the same points (`contours.coloring: none`, a second insight).
- Comparing the cores of two groups' clouds as two outline sets on one chart.
- A metric already computed on a regular grid of two ordered numerics (avg fare by pickup hour × distance bucket) where the gradient matters.
- Response-surface or what-if grids from SQL (`generate_series` × `generate_series`) where the reader looks for ridges and thresholds.
- `intent: relationship` with two continuous inputs and one output, with enough values on each axis to interpolate.

**Avoid when**
- Too few rows; the grid is mostly empty cells, and a scatter shows every point.
- Either axis is categorical or a coarse time grain; that is a GROUP BY over two dimensions, i.e. a heatmap.
- Heavy tails unclipped; one outlier stretches the bin range and the whole body lands in a couple of cells.
- Finding individual points (one extreme fare); binning hides them, so pair with a filtered table.
- A default density view; `histogram2d` shows the same binning without the smoothing, is easier to read, and is the preferred pick.
- Too few rows; contours of a sparse grid are artifacts of the bin edges.
- A z already gridded by SQL (avg fare by hour × distance); that is `contour`, not a histogram contour.
- Exact counts matter; contour bands hide the per-cell figure.
- Raw x/y points with no z; that is `histogram2d` (or `histogram2dcontour`), which bins for you.
- Categorical or unordered axes (borough × company); interpolating between labels is meaningless, use a heatmap.
- A sparse or irregular grid; Plotly interpolates across gaps and draws contours through empty space, so regrain coarser first.
- Too few values per axis, or exact cell values matter; a heatmap with `text` reads better.

**Data shape:** 0–1 metrics; 2 dimensions; 1000+ rows (numeric_continuous, numeric_discrete, time).

**Limits:** 1 series ideal, 1 at most; over the limit, repair with `clip_p99`, `sample`, `input_filter`, `small_multiples`.

**Gotchas**
- Plotly's named Blues, Greens, Greys, YlGnBu and YlOrRd scales run dark to light, so the highest values come out palest; add `reversescale: true`, or use Reds or Viridis.
- Raw rows, binned in the browser: x/y take columns with no GROUP BY. On large tables, pre-bin in SQL (`floor(x/step)*step`, `count(*)`) and draw a `heatmap` instead.
- Clip both axes in SQL (`least(x, p99)`); `xaxis.range` hides bins but still bins the outliers into the range.
- Set `xbins.size`/`ybins.size` when the step means something (0.5 mi, $2); `nbinsx` is only a hint.
- `split` overlays one grid per value on the same axes and only the last is visible; use small multiples.
- Use one sequential colorscale (Viridis, Blues); a rainbow scale such as `Jet` invents boundaries that are not in the data.
- Raw rows with no GROUP BY, binned then contoured in the browser; on large tables, sample in SQL.
- Contour levels depend on `nbinsx`/`nbinsy`; too fine a grid gives ragged islands, too coarse a blob. Start at 30–40 bins a side.
- `contours.coloring: heatmap` is a histogram2d with extra artifacts; prefer histogram2d for filled views.
- `split` stacks filled contour sets on top of each other and the last hides the rest; use two filtered insights with `contours.coloring: none`.
- Clip tails in SQL first; one outlier compresses every contour into a corner.
- x, y and z come from one GROUP BY over both bucketed axes (1-D columns, like heatmap); Plotly grids them by distinct x and y.
- Every x × y combination needs a row; missing cells are interpolated (`connectgaps`) and invent a surface. Cross-join the axes and coalesce, or regrain.
- Bucket raw numerics in SQL (`floor(x/step)*step`); one distinct value per raw row produces a grid of mostly empty cells.
- `z` is one column, not a list; a list of columns is read as a matrix with one row per column, not the intended grid.
- Never `split` a contour; overlapping filled surfaces hide each other.

**Variations**
- When a third numeric measure to show per cell: `z: ?{ tip_amount }` with `histfunc: avg`; the color becomes the average, not the count.
- When the counts are heavily skewed: `zsmooth: best` is cosmetic; a log color (`z` = ln(count) via a pre-binned heatmap) is honest.
- When a categorical of 2–7 values to compare: small multiples (one chart per value); never `split`, the grids overlap.

**Placement:** `medium` height, 6 of 12 columns, as a `relationship`; pair with `scatter_overlay`, `chart_beside(histogram)`, `detail_table_below`.
**Mobile:** Half-width becomes full width; keep the bins coarse enough that cells stay tappable.

**Example** (`histogram2d`)

```yaml
insights:
  - name: fare-vs-distance-density
    props:
      type: histogram2d
      x: ?{ least(${ref(trips).trip_distance}, 20) }
      y: ?{ least(${ref(trips).fare_amount}, 80) }
      xbins: {size: 0.5}
      ybins: {size: 2}
      colorscale: Viridis
    interactions:
      - filter: ?{ ${ref(trips).trip_distance} > 0 and ${ref(trips).fare_amount} > 0 }
```
<!-- rules:end -->
