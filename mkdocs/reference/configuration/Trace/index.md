The Trace is one of the most important and unique objects within a Visivo Project. You can think of traces as collection of lines or bars on a chart. For example, `Total Revenue by Week` would be a trace. Once you define this metric in a single trace in your project, you can add it to as many charts as you want. This is especially powerful since charts are able to join disparate axis automatically. Meaning you can define a trace for `Revenue Per Week` and then define another trace for `Revenue per Day` and include both of those traces on the same chart with no extra configuration needed.

This approach has a few key advantages:

* **Modularity**: Traces are repeatable across as many charts as you need.
* **Single Source of Truth**: Traces are singularly defined once in your project.
* **Testable**: Attributes of Traces are testable with simple configurations to make assertions about relationships that you expect to see in your data (ie. revenue = 300,000 on the week of 2022-09-19)

Sometimes you might want to create a number of different series within a trace. For example you might want to know `Revenue Per Week by Account Executive`. You can use the `cohort_on` attribute to split out data into different series within a single trace.

Traces are also where you define how you want to represent your data visually. Since Visivo leverages plotly for charting, you can set up a number of unique and useful trace types that are also highly customizable. This includes

* Bar
* Scatter
* Line
* Surface
* Area
* Pie
* OHLC (Candle Sticks)
* Funnel
* ...and many more
* Full List here: [Plotly Docs](https://plotly.com/javascript/reference/index/)

## Example
```  yaml
traces:
  - name: crypto ohlc
    model:
      sql: 'SELECT * finance_data_atlas.FINANCE.CMCCD2019'
    target_name: remote-snowflake
    cohort_on: query( "Cryptocurrency Name" )
    props:
      type: ohlc
      x: query( date_trunc('week', "Date")::date::varchar )
      close: query( max_by("Value", "Date") )
      high: query( max("Value") )
      low: query( min("Value") )
      open: query( min_by("Value", "Date") )
      increasing:
        line:
          color: 'green'
      decreasing:
        line:
          color: 'red'
      xaxis: 'x'
      yaxis: 'y'
    filters:
    - query("Date" >= '2015-01-01')
    - query( "Cryptocurrency Name" in ('Bitcoin (btc)', 'Ethereum (eth)', 'Dogecoin (doge)') )
    - query( "Measure Name" = 'Price, USD' )
```
## Attributes
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| name | string | None | The unique name of the object across the entire project. |
| target_name | string | None | Enables setting a target that this trace will always point to. If this value is set, it overrides targets passed to the CLI or set in the default block. |
| changed | boolean | True | **NOT A CONFIGURATION** attribute is used by the cli to determine if the trace should be re-run |
| model | [Model](https://docs.visivo.io/reference/configuration/Model/) | None | The model or model ref that visivo should use to build the trace. |
| cohort_on | string | None | `cohort_on` enables splitting the trace out into different series or cohorts. The column or query referenced here will be used to cut the resulting trace. |
| order_by | array | None | Takes a `column()` or `query()` reference. Orders the dataset so that information is presented in the correct order when the trace is added to a chart. Order by query statements support using `asc` and `desc`. |
| filters | array | None | A list of `column()` or `query()` functions that evaluate to `true` or `false`. Can include aggregations in the sql statement. |
| tests | array | None | A list of tests to run against the trace data. Enables making assertions about the nullability of data and relationships between data. |
| columns | [TraceColumns](https://docs.visivo.io/reference/configuration/Trace/TraceColumns/) | None | Place where you can define named sql select statements. Once they are defined here they can be referenced in the trace props or in tables built on the trace. |
| props | One of:<br>  •[Bar](https://docs.visivo.io/reference/configuration/Trace/Bar/)<br>  •[Barpolar](https://docs.visivo.io/reference/configuration/Trace/Barpolar/)<br>  •[Box](https://docs.visivo.io/reference/configuration/Trace/Box/)<br>  •[Candlestick](https://docs.visivo.io/reference/configuration/Trace/Candlestick/)<br>  •[Carpet](https://docs.visivo.io/reference/configuration/Trace/Carpet/)<br>  •[Choropleth](https://docs.visivo.io/reference/configuration/Trace/Choropleth/)<br>  •[Choroplethmapbox](https://docs.visivo.io/reference/configuration/Trace/Choroplethmapbox/)<br>  •[Cone](https://docs.visivo.io/reference/configuration/Trace/Cone/)<br>  •[Contour](https://docs.visivo.io/reference/configuration/Trace/Contour/)<br>  •[Contourcarpet](https://docs.visivo.io/reference/configuration/Trace/Contourcarpet/)<br>  •[Densitymapbox](https://docs.visivo.io/reference/configuration/Trace/Densitymapbox/)<br>  •[Funnel](https://docs.visivo.io/reference/configuration/Trace/Funnel/)<br>  •[Funnelarea](https://docs.visivo.io/reference/configuration/Trace/Funnelarea/)<br>  •[Heatmap](https://docs.visivo.io/reference/configuration/Trace/Heatmap/)<br>  •[Heatmapgl](https://docs.visivo.io/reference/configuration/Trace/Heatmapgl/)<br>  •[Histogram](https://docs.visivo.io/reference/configuration/Trace/Histogram/)<br>  •[Histogram2d](https://docs.visivo.io/reference/configuration/Trace/Histogram2d/)<br>  •[Histogram2dcontour](https://docs.visivo.io/reference/configuration/Trace/Histogram2dcontour/)<br>  •[Icicle](https://docs.visivo.io/reference/configuration/Trace/Icicle/)<br>  •[Image](https://docs.visivo.io/reference/configuration/Trace/Image/)<br>  •[Indicator](https://docs.visivo.io/reference/configuration/Trace/Indicator/)<br>  •[Isosurface](https://docs.visivo.io/reference/configuration/Trace/Isosurface/)<br>  •[Mesh3d](https://docs.visivo.io/reference/configuration/Trace/Mesh3d/)<br>  •[Ohlc](https://docs.visivo.io/reference/configuration/Trace/Ohlc/)<br>  •[Parcats](https://docs.visivo.io/reference/configuration/Trace/Parcats/)<br>  •[Parcoords](https://docs.visivo.io/reference/configuration/Trace/Parcoords/)<br>  •[Pie](https://docs.visivo.io/reference/configuration/Trace/Pie/)<br>  •[Sankey](https://docs.visivo.io/reference/configuration/Trace/Sankey/)<br>  •[Scatter](https://docs.visivo.io/reference/configuration/Trace/Scatter/)<br>  •[Scatter3d](https://docs.visivo.io/reference/configuration/Trace/Scatter3d/)<br>  •[Scattercarpet](https://docs.visivo.io/reference/configuration/Trace/Scattercarpet/)<br>  •[Scattergeo](https://docs.visivo.io/reference/configuration/Trace/Scattergeo/)<br>  •[Scattergl](https://docs.visivo.io/reference/configuration/Trace/Scattergl/)<br>  •[Scattermapbox](https://docs.visivo.io/reference/configuration/Trace/Scattermapbox/)<br>  •[Scatterpolar](https://docs.visivo.io/reference/configuration/Trace/Scatterpolar/)<br>  •[Scatterpolargl](https://docs.visivo.io/reference/configuration/Trace/Scatterpolargl/)<br>  •[Scattersmith](https://docs.visivo.io/reference/configuration/Trace/Scattersmith/)<br>  •[Scatterternary](https://docs.visivo.io/reference/configuration/Trace/Scatterternary/)<br>  •[Splom](https://docs.visivo.io/reference/configuration/Trace/Splom/)<br>  •[Streamtube](https://docs.visivo.io/reference/configuration/Trace/Streamtube/)<br>  •[Sunburst](https://docs.visivo.io/reference/configuration/Trace/Sunburst/)<br>  •[Surface](https://docs.visivo.io/reference/configuration/Trace/Surface/)<br>  •[Treemap](https://docs.visivo.io/reference/configuration/Trace/Treemap/)<br>  •[Violin](https://docs.visivo.io/reference/configuration/Trace/Violin/)<br>  •[Volume](https://docs.visivo.io/reference/configuration/Trace/Volume/)<br>  •[Waterfall](https://docs.visivo.io/reference/configuration/Trace/Waterfall/) | [Scatter](https://docs.visivo.io/reference/configuration/Trace/Scatter/) |  |
