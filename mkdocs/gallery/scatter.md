# Scatter & Line Charts

Scatter plots are one of the most versatile chart types in Visivo. They can create scatter plots, line charts, and area charts - all using the same `scatter` trace type.

!!! note "Did you know?"
    The `scatter` trace type in Visivo is used to create scatter plots, line charts, AND area charts. The visualization style is controlled by the `mode` and `fill` properties.

## Quick Examples

<div class="grid cards" markdown>

-   __Simple Scatter Plot__

    ---
    
    Basic scatter plot showing individual data points.
    
    ![](../assets/example-charts/props/scatter/simple-scatter.png)
    
    ```yaml
    props:
      type: scatter
      x: ?{x}
      y: ?{y}
      mode: "markers"
    ```

-   __Line Chart__

    ---
    
    Connect points with lines to show trends.
    
    ![](../assets/example-charts/props/scatter/lines-scatter.png)
    
    ```yaml
    props:
      type: scatter
      x: ?{date}
      y: ?{value}
      mode: "lines"
    ```

-   __Area Chart__

    ---
    
    Fill the area under the line.
    
    ![](../assets/example-charts/props/scatter/area-plot.png)
    
    ```yaml
    props:
      type: scatter
      x: ?{date}
      y: ?{value}
      mode: "lines"
      fill: "tozeroy"
    ```

</div>

## When to Use

### Scatter Plots
- **Exploring relationships** between two continuous variables
- **Identifying patterns**, clusters, or outliers in data
- **Showing distribution** of data points

### Line Charts  
- **Displaying trends** over time
- **Comparing multiple** time series
- **Showing continuous** data progression

### Area Charts
- **Emphasizing magnitude** of change over time
- **Showing cumulative** totals
- **Comparing proportional** contributions

## Complete Examples

### Basic Scatter Plot

This example shows a simple scatter plot with customized markers:

![](../assets/example-charts/props/scatter/simple-scatter.png)

```yaml
models:
  - name: scatter-data
    args:
      - echo
      - |
        x,y,category
        1,10,A
        2,20,B
        3,15,A
        4,25,B
        5,30,A

traces:
  - name: Simple Scatter Plot
    model: ${ref(scatter-data)}
    props:
      type: scatter
      x: ?{x}
      y: ?{y}
      mode: "markers"
      marker: 
        size: 12
        color: ?{category}
        colorscale: "Viridis"
    order_by: 
      - ?{x asc}

charts:
  - name: Simple Scatter Chart
    traces:
      - ${ref(Simple Scatter Plot)}
    layout:
      title:
        text: Simple Scatter Plot<br><sub>Colored by Category</sub>
      xaxis:
        title: "X Values"
      yaxis:
        title: "Y Values"
```

### Multi-Series Line Chart

Create multiple lines with different styles:

![](../assets/example-charts/props/scatter/lines-scatter.png)

```yaml
models:
  - name: time-series-data
    args:
      - echo
      - |
        date,revenue,profit,costs
        2024-01-01,100,20,80
        2024-02-01,120,30,90
        2024-03-01,110,25,85
        2024-04-01,140,40,100
        2024-05-01,160,50,110

traces:
  - name: Revenue Line
    model: ${ref(time-series-data)}
    props:
      type: scatter
      x: ?{date}
      y: ?{revenue}
      mode: "lines+markers"
      name: "Revenue"
      line:
        color: "#1f77b4"
        width: 3
    order_by: [?{date asc}]

  - name: Profit Line
    model: ${ref(time-series-data)}
    props:
      type: scatter
      x: ?{date}
      y: ?{profit}
      mode: "lines+markers"
      name: "Profit"
      line:
        color: "#2ca02c"
        width: 3
        dash: "dot"
    order_by: [?{date asc}]

charts:
  - name: Financial Trends
    traces:
      - ${ref(Revenue Line)}
      - ${ref(Profit Line)}
    layout:
      title: "Monthly Financial Metrics"
      xaxis:
        title: "Month"
      yaxis:
        title: "Amount ($)"
      hovermode: "x unified"
```

### Stacked Area Chart

Show cumulative contributions over time:

![](../assets/example-charts/props/scatter/area-plot.png)

```yaml
traces:
  - name: Product A Sales
    model: ${ref(sales-data)}
    props:
      type: scatter
      x: ?{month}
      y: ?{product_a_sales}
      mode: "lines"
      fill: "tonexty"
      name: "Product A"
      stackgroup: "one"

  - name: Product B Sales  
    model: ${ref(sales-data)}
    props:
      type: scatter
      x: ?{month}
      y: ?{product_b_sales}
      mode: "lines"
      fill: "tonexty"
      name: "Product B"
      stackgroup: "one"
```

## Advanced Features

### Custom Markers

Customize marker appearance based on data:

```yaml
marker:
  size: ?{case when value > 100 then 15 else 10 end}
  color: ?{category}
  symbol: ?{case when is_important then 'star' else 'circle' end}
  line:
    color: "black"
    width: 2
```

### Line Styling

Create different line styles for emphasis:

```yaml
line:
  color: "#ff7f0e"
  width: 4
  dash: "dashdot"  # Options: solid, dot, dash, longdash, dashdot
  shape: "spline"  # Options: linear, spline, hv, vh, hvh, vhv
```

### Hover Information

Customize what appears on hover:

```yaml
hovertemplate: |
  <b>Date:</b> %{x|%Y-%m-%d}<br>
  <b>Value:</b> %{y:,.0f}<br>
  <b>Category:</b> %{text}
  <extra></extra>
text: ?{category}
```

## Common Patterns

### Time Series with Annotations

Add context to your time series:

```yaml
charts:
  - name: Sales with Events
    traces:
      - ${ref(sales-line)}
    layout:
      annotations:
        - x: "2024-03-15"
          y: 150
          text: "Product Launch"
          showarrow: true
          arrowhead: 2
```

### Scatter with Trendline

Add a trendline to scatter plots:

```yaml
traces:
  - name: Data Points
    props:
      type: scatter
      mode: "markers"
      # ... marker properties

  - name: Trend Line
    props:
      type: scatter
      mode: "lines"
      line:
        color: "red"
        dash: "dash"
      # Use SQL to calculate regression line
```

### Bubble Chart

Use marker size to show a third dimension:

```yaml
props:
  type: scatter
  mode: "markers"
  marker:
    size: ?{revenue / 1000}  # Scale for visibility
    sizemode: "diameter"
    sizemin: 4
    color: ?{profit_margin}
    colorscale: "RdYlGn"
    showscale: true
```

## Tips & Best Practices

!!! tip "Performance"
    - For large datasets (>10k points), consider using `scattergl` instead of `scatter`
    - Use data aggregation in SQL to reduce point count
    - Set `order_by` to ensure consistent line connections

!!! warning "Common Gotchas"
    - Always set `order_by` for line charts to ensure proper point connections
    - Remember that `scatter` creates lines, areas, AND scatter plots
    - Use `stackgroup` for stacked area charts, not just `fill`

## Related Chart Types

- [Bar Charts](bar.md) - For categorical comparisons
- [3D Scatter](3d.md#scatter-3d) - For three-dimensional relationships
- [Scatter Maps](maps.md#scatter-maps) - For geographic point data

## Full Configuration Reference

For a complete list of all available properties, see the [Scatter Trace Configuration](../reference/configuration/Trace/Props/Scatter/index.md).

---

_Need help choosing between scatter, line, or area?_ Check our [Chart Selection Guide](index.md#chart-selection-guide).