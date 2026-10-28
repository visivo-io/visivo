---
name: geo_point
summary: Points on a tiled street map from lat/lon, sized or colored by a metric.
family: geo_point
---

# Geo point charts

Read this after `recommend_charts` names the family and before `write_insight`. Generated from the trace rules; do not edit by hand.

<!-- rules:start -->
**Traces**
- `scattermap` (preferred): Points on a tiled street map from lat/lon, sized or colored by a metric.
- `scattergeo` (preferred): Points on an outline map (no tiles) from lat/lon or country/state codes; for world and continent scope.
- `scattermapbox` (deprecated): Deprecated Mapbox GL twin of scattermap; never pick it for a new chart, migrate it to scattermap.

**Use when**
- Two `geo_point` columns (`geo_kind: latlon`) such as pickup locations, stores or sensors, aggregated to places.
- Regions without boundaries (NYC zones, boroughs) where you still have a centroid; the fallback for `geo_region` when `boundaries_available` is false.
- `intent: geo` with a 'where' question: where do trips start, where are the stores.
- `geo_point` rows spread across countries or continents (offices, shipments, airports) where street tiles add nothing.
- A `geo_region` column of countries or US states and the metric reads better as a sized bubble than a fill: `locations` + `locationmode`, no lat/lon needed.
- The dashboard must render without a tile server (offline, export, a print-friendly figure).

**Avoid when**
- Too many points to draw one dot each; aggregate to a grid or zone centroids, or use `densitymap`.
- The question is 'how much per region' and boundaries exist; a choropleth reads better than sized dots.
- No lat/lon and no centroid lookup; use a bar by region.
- Points that all sit in one spot (an airport); show a count by location, sized, not one dot per row.
- City-scale points (NYC pickups, one metro area): the outline map has no streets; use `scattermap`.
- Too many points for an SVG trace with no clustering; aggregate, or use `densitymap`.
- 'How much per region' with built-in boundaries; a `choropleth` fills the region instead of guessing its centroid.
- Custom regions (zones, counties); `locationmode` only knows countries and US states, so use `scattermap` on centroids.

**Data shape:** 0–2 metrics; 2–3 dimensions; 0–5000 rows (geo_point, categorical, boolean).

**Limits:** 5 series ideal, 8 at most; over the limit, repair with `top_n_other`, `input_filter`, `densitymap`.

**Gotchas**
- Aggregate to a location first (`GROUP BY zone`, `avg(lat)`, `avg(lon)`, `count(*)`); one dot per raw row is slow and shows only density.
- Swapped `lat` and `lon` put every point in the ocean; check the columns' min and max (latitude stays within -90 to 90).
- Set `layout.map.center` and `layout.map.zoom` from the data's bounding box; the default shows the world.
- Use `scattermap`, not `scattermapbox` (deprecated, needs a token); the theme styles `layout.map`.
- `marker.size` is in pixels: scale into roughly 6–40 (`6 + 34 * sqrt(n / max_n)`) or the biggest dot covers the city.
- `layout.geo` lives on the chart, not the insight: without `scope` or `fitbounds: locations` a US-only dataset is drawn as a smudge on a world map.
- `locationmode` must match the column (`ISO-3` is the default); mismatched codes drop the points silently, as in choropleth.
- The theme colors `layout.geo` land, ocean and borders; do not override `landcolor` or `bgcolor` per chart or dark mode breaks.
- `marker.color` as hex strings from a CASE gives each series a fixed colour; a numeric column needs `marker.colorscale` instead.
- `mode: lines` connects points in row order: add `- sort:` on the sequence column and one `split` per route, or every point is joined into one zig-zag.

**Variations**
- When a metric per place: `marker.size` (use `sqrt` so area, not diameter, is proportional) with `marker.sizemode: diameter`.
- When a categorical with 2–7 values: `split` (one series per value, theme-colored) rather than `marker.color`.
- When the points are raw rows rather than aggregated places: `cluster.enabled: true`, or aggregate to zone or grid in SQL.
- When a second metric matters: `marker.color` from a data column with `marker.colorscale` (the legitimate color case).

**Other uses**
- Route or GPS track on a street map, e.g. a delivery run or a vehicle's day. `mode: lines` (or `lines+markers`) with `- sort:` on the timestamp and `split` on the vehicle or trip id; `line.width` for emphasis.
- Service areas or geofences drawn as filled polygons. `mode: lines`, `fill: toself` and one row per polygon vertex in order, `split` on the area id.

**Placement:** `large` height, 8 of 12 columns, as a `hero`; pair with `chart_beside(bar)`, `detail_table_below`, `kpi_strip_above`.
**Mobile:** Full width, `large`; hide the legend and rely on `hovertemplate`.

**Example** (`scattermap`)

```yaml
insights:
  - name: pickups-by-zone
    props:
      type: scattermap
      lat: ?{ avg(${ref(trips).pickup_lat}) }
      lon: ?{ avg(${ref(trips).pickup_lon}) }
      text: ?{ ${ref(trips).pickup_zone} }
      mode: markers
      marker:
        size: ?{ sqrt(count(*)) }
        sizemode: diameter
    interactions:
      - split: ?{ ${ref(trips).company} }
charts:
  - name: pickups-map
    insights: ["${ref(pickups-by-zone)}"]
    layout: {map: {center: {lat: 40.73, lon: -73.94}, zoom: 9.5}}
```
<!-- rules:end -->
