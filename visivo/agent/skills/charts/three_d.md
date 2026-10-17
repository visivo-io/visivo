---
name: three_d
summary: Points in a rotatable 3D box; niche, since a 2D scatter with color or size almost always reads better.
family: three_d
---

# Three d charts

Read this after `recommend_charts` names the family and before `write_insight`. Generated from the trace rules; do not edit by hand.

<!-- rules:start -->
**Traces**
- `scatter3d` (niche): Points in a rotatable 3D box; niche, since a 2D scatter with color or size almost always reads better.
- `surface` (niche): A z-height surface over a regular x/y grid; niche, since it needs a 2D z array and a heatmap usually wins.
- `mesh3d` (niche): A triangulated 3D mesh from vertices and i/j/k faces; scientific or CAD data only, never a business metric.
- `cone` (niche): Cones at x/y/z points pointing along u/v/w vectors; for 3D vector fields (wind, flow), never business data.
- `streamtube` (niche): Tubes that trace flow through a gridded 3D vector field; a fluid-dynamics plot, never business data.
- `volume` (niche): Semi-transparent rendering of a scalar on a regular 3D grid (scan, simulation); niche scientific type.
- `isosurface` (niche): The shells where a gridded 3D scalar crosses chosen values; niche scientific type, never business data.

**Use when**
- Only on an explicit request for 3D, with three numeric columns per entity.
- Genuinely spatial x/y/z data: sensor positions, depth samples, a flight path drawn with `mode: lines`.
- Exploratory rotation of a small cloud, where the user will drag the camera to find a cluster.
- Only on an explicit request for 3D.
- A smooth response over two ordered numeric axes (fare by hour and distance band, a model's prediction grid), with a fixed, small set of y rows.
- Only on an explicit request, when a table of vertices and triangle indices already exists.
- A point cloud to be wrapped in a hull (`alphahull`) when no face table exists.
- Only on an explicit request, for a sampled vector field with position (x, y, z) and direction (u, v, w).
- A sparse sample, where each arrow can still be seen.
- Only on an explicit request, for a full u/v/w vector field sampled on a regular x/y/z grid.
- Only on an explicit request, for one value on every cell of a regular x/y/z grid.
- Only on an explicit request, for one value on a regular x/y/z grid and a level of interest.

**Avoid when**
- Three measures per entity on a dashboard; plot two on x/y and encode the third as `marker.size` or `marker.color` on a 2D `scatter`.
- Reading values off the chart; perspective distorts position and nobody can read z from a static view.
- Too many points or split series; the box turns into a blob that rotation cannot untangle.
- Dashboards with several WebGL charts; every 3D scene costs a WebGL context and browsers cap how many a page can hold.
- Long-format x, y, z rows from SQL; surface needs `z` as a 2D array (one list per grid row), not a column. Use a heatmap or `contour`.
- Either axis categorical; the surface interpolates between neighbours, implying values between boroughs.
- Reading magnitudes; perspective and lighting hide them, and a heatmap with a colorscale shows the same grid honestly.
- Sparse grids; every missing cell is a hole or a spike in the mesh.
- Any aggregated business metric; a bar or heatmap does every reading of it better.
- Vertex and face counts differ and cannot be padded into one result set.
- Meshes with too many faces; the browser receives every vertex as JSON.
- Two-dimensional vectors such as wind on a map; draw arrows on a 2D chart or a map, the third axis adds nothing.
- Too many points; the cones overlap into a hedgehog. Subsample the grid or use `streamtube`.
- Any metric that is not a direction; a cone's size and angle are not readable as magnitude.
- Scattered (non-gridded) sample points; streamlines cannot be integrated, use `cone`.
- Small fields where each vector matters; cones show every sample, tubes interpolate them away.
- Anything aggregated from business rows; there is no flow to trace.
- A metric over three business dimensions (hour × weekday × borough); use a heatmap with an input, or small multiples, for the third.
- Scattered or sparse points; volume needs a full grid, use `scatter3d` with `marker.color`.
- One level matters; `isosurface` draws that shell crisply instead of a fog.
- Three business dimensions with a metric; use a heatmap plus an input for the third dimension.
- Non-gridded points; there is no surface to extract, use `scatter3d` colored by value.
- The whole distribution matters, not one level; `volume` shows the full field.

**Data shape:** 3–4 metrics; 1–2 dimensions; 10+ rows (identifier, categorical, time).

**Limits:** 3 series ideal, 5 at most; over the limit, repair with `sample`, `input_filter`, `top_n_other`.

**Gotchas**
- Axis titles and ranges live under `layout.scene.xaxis/yaxis/zaxis`; `layout.xaxis` is silently ignored.
- `mode: lines` connects points in row order; add `- sort:` on the sequence column, exactly as for a 2D line.
- Raw rows ship to the browser; sample or clip large clouds in SQL or rotation stutters.
- A constant `marker.color` opts out of the theme colorway; only set it to a column (a CASE or a numeric).
- `z: ?{ col }` over long-format rows gives a 1D z and Plotly draws nothing; z must be a list of `?{ }` expressions, one per grid row.
- `y` must have one value per listed z expression and is usually a literal list; `x` has one value per result row.
- Every z expression shares the insight's GROUP BY, so x must be the only non-aggregated column; sort on x or the surface folds over itself.
- Axis titles live under `layout.scene`; `layout.xaxis` is ignored for 3D.
- No `split`; it would stack several surfaces in one scene. One insight, one surface.
- i/j/k index into the vertex rows in result order; always `- sort:` on the vertex index, or faces connect the wrong vertices.
- All props come from one result set, so vertex and face arrays share a row count; pad the shorter with NULLs in the model SQL.
- Any aggregate in a prop triggers a GROUP BY that reorders and dedupes vertices; keep every prop a plain projection.
- `sizeref` depends on the data's scale; without it cones are invisible or swallow the scene, so tune it per dataset.
- Default hover shows coordinates and the vector norm without a unit; pass the speed as `text` or set `hovertemplate`.
- Camera position belongs in `layout.scene.camera.eye`, not in the insight props.
- x/y/z must be a complete regular grid; one missing row and nothing draws. Sort on a grid index column so row order is stable.
- Any aggregate in a prop adds a GROUP BY that can reorder the grid; precompute the field in the model and project it.
- Rows grow as the cube of the points per axis, and every one ships to the browser; regrain to a coarser grid first.
- x/y/z must form a complete regular grid; build it in the model SQL (a cross join of axis buckets, value 0 where empty).
- Sort on a grid index column, such as `idx` in the example, so row order is stable.
- Set a low `opacity` (0.05–0.2) and a `surface.count` of 10–20; the defaults read as a near-solid block.
- Set `isomin`/`isomax` from the value's real range; values outside it draw nothing and the chart looks empty.
- x/y/z must be a complete regular grid built in the model SQL; sort on a grid index column for a stable order.

**Variations**
- When a fourth numeric column per point: `marker.color` bound to it with `marker.colorscale`; a data encoding, so leaving the theme colorway is fine.
- When a categorical column with a few values: `split` on it; past the series limit the colors cannot be told apart while rotating.
- When the points form a path through space: `mode: lines` with `- sort:` on the ordering column.

**Placement:** `large` height, 6 of 12 columns, as a `relationship`; pair with `detail_table_below`.
**Mobile:** Drag-to-rotate fights page scroll on touch screens; on phones prefer the 2D scatter it should have been.

**Example** (`scatter3d`)

```yaml
insights:
  - name: fare-distance-tip-3d
    props:
      type: scatter3d
      mode: markers
      x: ?{ ${ref(trips).trip_distance} }
      y: ?{ ${ref(trips).fare_amount} }
      z: ?{ ${ref(trips).tip_amount} }
      marker: {size: 3, opacity: 0.5}
    interactions:
      - split: ?{ ${ref(trips).payment_type} }
      - filter: ?{ ${ref(trips).trip_distance} between 0 and 50 }
```
<!-- rules:end -->
