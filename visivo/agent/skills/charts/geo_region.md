---
name: geo_region
summary: Color countries or US states by a metric using built-in boundaries; no GeoJSON needed.
family: geo_region
---

# Geo region charts

Read this after `recommend_charts` names the family and before `write_insight`. Generated from the trace rules; do not edit by hand.

<!-- rules:start -->
**Traces**
- `choropleth` (preferred): Color countries or US states by a metric using built-in boundaries; no GeoJSON needed.
- `choroplethmap` (preferred): Color arbitrary regions from a GeoJSON on a tiled street map; the choropleth for custom boundaries.
- `choroplethmapbox` (deprecated): Deprecated Mapbox GL twin of choroplethmap; never pick it for a new chart, migrate it to choroplethmap.

**Use when**
- A `geo_region` column whose `geo_kind` is iso3, country_name or us_state; Plotly ships these boundaries. Map iso2 codes to ISO-3 first.
- One metric per region, with `intent: geo` or enough regions that a bar would run long and the geography carries meaning.
- A rate or density; absolute totals on a map mostly show which regions are big.
- A `geo_region` column with `geo_kind: custom` and `semantics.boundaries_available`: a GeoJSON URL whose feature ids match the column (zones, counties, districts).
- The reader needs street-level context (a tiled basemap) under the regions.
- `intent: geo` with regions smaller than a US state.

**Avoid when**
- Regions without built-in boundaries (boroughs, zones, counties, postcodes) and `boundaries_available` is false; use a bar or heatmap by region, or `scattermap` on lat/lon.
- Only a handful of regions; a bar says it in less space.
- Precise comparison between regions; color steps are coarse, so pair with a sorted bar or a table.
- Time series per region; one map per period is not a trend. Use a line split by region, or an input to pick the period.
- No GeoJSON is available; fall back to a bar or heatmap by region, or `scattermap` on centroid lat/lon.
- Built-in boundaries suffice (countries, US states); `choropleth` needs no file and no network fetch.
- Too many features for the browser to fetch and draw every polygon; simplify or aggregate.
- Comparing exact values; pair with a sorted bar or a table.

**Data shape:** 1 metric; 1 dimension; 3+ values on the main dimension (geo_region).

**Limits:** 1 series ideal, 1 at most; over the limit, repair with `dominant_category`, `input_filter`.

**Gotchas**
- Plotly's named Blues, Greens, Greys, YlGnBu and YlOrRd scales run dark to light, so the highest values come out palest; add `reversescale: true`, or use Reds or Viridis.
- `locationmode` must match the column: `ISO-3` (USA, FRA), `USA-states` (NY, NJ), `country names` (United States). Mismatched codes draw an empty map with no error.
- `z` must be aggregated per region (one row per location); duplicate locations are drawn on top of each other and only the last shows.
- Set chart `layout.geo.scope` (`usa` for states) or `layout.geo.fitbounds: locations`; the default is the world and US states are a smudge.
- Totals follow population; prefer a rate (per resident, per trip) or say in the title that it is a count.
- The theme colors `layout.geo` land, ocean and borders for light and dark mode; do not override `landcolor` or `bgcolor` per chart.
- `featureidkey` must point at the GeoJSON property that holds the same values as `locations` (default `id`); a mismatch renders the basemap with no regions and no error.
- `geojson` is a URL the browser fetches: it must be public and CORS-enabled; a local file path does not work in a deployed dashboard.
- Use `choroplethmap`, not `choroplethmapbox`; the mapbox traces are deprecated and need an access token, while the `*map` traces use MapLibre with the theme's carto style.
- Set `layout.map.center` and `layout.map.zoom`; the default view is the whole world.
- One row per location (aggregate in SQL); duplicate locations overdraw.

**Variations**
- When the data covers one country or continent: chart `layout.geo.scope` (usa, europe, …) and `layout.geo.projection.type`; otherwise the world is drawn around a few states.
- When a second metric matters: size is impossible; color one metric and put the other in `text` or `hovertemplate`.
- When the reader picks a period: a `filter` on the insight driven by an input; the map re-colors client-side.

**Other uses**
- Change map that splits regions into growth and decline around zero, e.g. sales versus last year by state. `z: ?{ <current> - <prior> }`, a diverging `colorscale` such as `RdBu`, and `zmid: 0`.
- Custom regions (US counties, sales territories) on a plain outline map with no street tiles. `geojson: <public url>`, `featureidkey: properties.<id>`, `locationmode: geojson-id`, and chart `layout.geo.fitbounds: locations`.

**Placement:** `large` height, 8 of 12 columns, as a `hero`; pair with `chart_beside(bar)`, `detail_table_below`.
**Mobile:** Full width and `large`; a half-width world map is unreadable.

**Example** (`choropleth`)

```yaml
insights:
  - name: rides-by-state
    props:
      type: choropleth
      locationmode: USA-states
      locations: ?{ ${ref(trips).pickup_state} }
      z: ?{ count(*) }
      colorscale: Blues
      reversescale: true
      colorbar: {title: {text: rides}}
charts:
  - name: rides-by-state-map
    insights: ["${ref(rides-by-state)}"]
    layout: {geo: {scope: usa}}
```
<!-- rules:end -->
