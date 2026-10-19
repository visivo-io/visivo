---
name: geo_density
summary: A heat layer over a street map from many lat/lon points; where things concentrate, not how many.
family: geo_density
---

# Geo density charts

Read this after `recommend_charts` names the family and before `write_insight`. Generated from the trace rules; do not edit by hand.

<!-- rules:start -->
**Traces**
- `densitymap` (preferred): A heat layer over a street map from many lat/lon points; where things concentrate, not how many.
- `densitymapbox` (deprecated): Deprecated Mapbox GL twin of densitymap; never pick it for a new chart, migrate it to densitymap.

**Use when**
- Many `geo_point` rows where individual dots would overplot (pickups, clicks, incidents).
- The question is concentration ('where is it busiest'), not a per-place figure.
- Points cluster at many distinct locations with no natural region to aggregate to.

**Avoid when**
- Too few points for a heat layer; a `scattermap` with sized markers shows the same thing honestly.
- A per-region number is wanted; use a choropleth or a bar, since a heat layer has no legend you can read a value off.
- Comparing two groups; two density layers overlap into brown, so use an input to switch, or two charts.
- Points weighted by a non-additive metric; `z` is summed under the kernel, so averages are meaningless here.

**Data shape:** 0–1 metrics; 2 dimensions; 200+ rows (geo_point).

**Limits:** 1 series ideal, 1 at most; over the limit, repair with `input_filter`.

**Gotchas**
- Plotly's named Blues, Greens, Greys, YlGnBu and YlOrRd scales run dark to light, so the highest values come out palest; add `reversescale: true`, or use Reds or Viridis.
- Without `z` every point weighs 1; with `z` the weight is summed, so pass a count, not an average, cast to a number (`count(*)::double`): a BIGINT reaches the map as a string and is ignored.
- Round and group in SQL on large tables; the trace works on raw rows but the browser payload grows with every row.
- `radius` is in screen pixels, so the look changes with zoom; pick it for the `layout.map.zoom` you set.
- Use `densitymap`, not `densitymapbox` (deprecated, token required).
- Hide the colorbar (`showscale: false`): its units are kernel density, which nobody can read.

**Variations**
- When the table has far more rows than the browser should receive: round lat/lon to 2 decimals (~1 km) and use `count(*)::double` as `z`; finer cells saturate to blobs and the kernel does the rest.
- When the reader compares periods or groups: an input `filter`, never two layers.
- When the chart's zoom level is set: `radius` in pixels to match it: 10–15 for city zoom, 30+ for a region.

**Placement:** `large` height, 12 of 12 columns, as a `hero`; pair with `kpi_strip_above`.
**Mobile:** Full width; lower `radius` as the map shrinks.

**Example** (`densitymap`)

```yaml
insights:
  - name: pickup-density
    props:
      type: densitymap
      lat: ?{ round(${ref(trips).pickup_lat}, 2) }
      lon: ?{ round(${ref(trips).pickup_lon}, 2) }
      z: ?{ count(*)::double }
      radius: 20
      colorscale: Hot
      showscale: false
charts:
  - name: pickup-density-map
    insights: ["${ref(pickup-density)}"]
    layout: {map: {center: {lat: 40.73, lon: -73.94}, zoom: 9.5}}
```
<!-- rules:end -->
