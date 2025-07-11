# Area Charts

Area charts emphasize the magnitude of change over time by filling the area between a line and a baseline. They're perfect for showing cumulative values, trends, and part-to-whole relationships.

## When to Use Area Charts

- **Cumulative Values**: Show total accumulation over time
- **Trend Emphasis**: Highlight the magnitude of change
- **Part-to-Whole**: Display how components contribute to a total
- **Comparisons**: Compare multiple datasets with stacked areas

## Basic Area Chart

Create a simple area chart showing revenue over time:

```yaml
name: revenue-trends

sources:
  - name: analytics_db
    type: duckdb
    database: ":memory:"

models:
  - name: monthly_revenue
    source_name: analytics_db
    sql: |
      WITH months AS (
        SELECT 
          DATE '2023-01-01' + (INTERVAL '1 month' * m) as month,
          50000 + m * 5000 + (RANDOM() - 0.5) * 10000 as revenue
        FROM generate_series(0, 11) as m
      )
      SELECT 
        month,
        ROUND(revenue, 2) as revenue
      FROM months

traces:
  - name: revenue_area
    model: ${ref(monthly_revenue)}
    props:
      type: scatter
      x: ?{month}
      y: ?{revenue}
      mode: "lines"
      fill: "tozeroy"  # Fill to zero on y-axis
      fillcolor: "rgba(52, 152, 219, 0.3)"
      line:
        color: "#3498db"
        width: 2
      name: "Revenue"
      
charts:
  - name: revenue_trend
    traces:
      - ${ref(revenue_area)}
    layout:
      title: "Monthly Revenue Trend"
      xaxis:
        title: "Month"
      yaxis:
        title: "Revenue ($)"
        tickformat: "$,.0f"
```

## Stacked Area Chart

Show how different categories contribute to the total:

```yaml
models:
  - name: sales_by_category
    source_name: analytics_db
    sql: |
      WITH sales AS (
        SELECT 
          DATE '2023-01-01' + (INTERVAL '1 month' * m) as month,
          'Electronics' as category,
          30000 + m * 2000 + (RANDOM() - 0.5) * 5000 as revenue
        FROM generate_series(0, 11) as m
        UNION ALL
        SELECT 
          DATE '2023-01-01' + (INTERVAL '1 month' * m),
          'Clothing',
          20000 + m * 1500 + (RANDOM() - 0.5) * 3000
        FROM generate_series(0, 11) as m
        UNION ALL
        SELECT 
          DATE '2023-01-01' + (INTERVAL '1 month' * m),
          'Books',
          10000 + m * 500 + (RANDOM() - 0.5) * 2000
        FROM generate_series(0, 11) as m
      )
      SELECT * FROM sales ORDER BY month, category

traces:
  - name: electronics_area
    model: |
      SELECT month, revenue 
      FROM ${ref(sales_by_category)} 
      WHERE category = 'Electronics'
    props:
      type: scatter
      x: ?{month}
      y: ?{revenue}
      mode: "lines"
      stackgroup: "one"  # All traces in same stackgroup will stack
      fillcolor: "rgba(52, 152, 219, 0.6)"
      line:
        color: "#3498db"
        width: 0
      name: "Electronics"
      
  - name: clothing_area
    model: |
      SELECT month, revenue 
      FROM ${ref(sales_by_category)} 
      WHERE category = 'Clothing'
    props:
      type: scatter
      x: ?{month}
      y: ?{revenue}
      mode: "lines"
      stackgroup: "one"
      fillcolor: "rgba(231, 76, 60, 0.6)"
      line:
        color: "#e74c3c"
        width: 0
      name: "Clothing"
      
  - name: books_area
    model: |
      SELECT month, revenue 
      FROM ${ref(sales_by_category)} 
      WHERE category = 'Books'
    props:
      type: scatter
      x: ?{month}
      y: ?{revenue}
      mode: "lines"
      stackgroup: "one"
      fillcolor: "rgba(46, 204, 113, 0.6)"
      line:
        color: "#2ecc71"
        width: 0
      name: "Books"

charts:
  - name: stacked_revenue
    traces:
      - ${ref(electronics_area)}
      - ${ref(clothing_area)}
      - ${ref(books_area)}
    layout:
      title: "Revenue by Category (Stacked)"
      xaxis:
        title: "Month"
      yaxis:
        title: "Total Revenue ($)"
        tickformat: "$,.0f"
      hovermode: "x unified"
```

## Normalized (100%) Stacked Area

Show relative proportions over time:

```yaml
traces:
  - name: electronics_normalized
    model: |
      SELECT month, revenue 
      FROM ${ref(sales_by_category)} 
      WHERE category = 'Electronics'
    props:
      type: scatter
      x: ?{month}
      y: ?{revenue}
      mode: "lines"
      stackgroup: "one"
      groupnorm: "percent"  # Normalize to 100%
      fillcolor: "rgba(52, 152, 219, 0.8)"
      line:
        width: 0
      name: "Electronics"
      hovertemplate: "%{y:.1f}%<extra></extra>"
```

## Stream Graph (Centered Stack)

Create a stream graph with symmetric stacking:

```yaml
models:
  - name: social_media_activity
    source_name: analytics_db
    sql: |
      WITH activity AS (
        SELECT 
          DATE '2024-01-01' + (INTERVAL '1 day' * d) as date,
          platform,
          CASE platform
            WHEN 'Twitter' THEN 1000 + 500 * SIN(d * 0.1) + (RANDOM() - 0.5) * 200
            WHEN 'Facebook' THEN 800 + 300 * COS(d * 0.08) + (RANDOM() - 0.5) * 150
            WHEN 'Instagram' THEN 1200 + 400 * SIN(d * 0.12) + (RANDOM() - 0.5) * 250
          END as posts
        FROM generate_series(0, 89) as d,
          (SELECT 'Twitter' as platform 
           UNION ALL SELECT 'Facebook' 
           UNION ALL SELECT 'Instagram')
      )
      SELECT date, platform, ROUND(posts) as posts FROM activity

traces:
  - name: twitter_stream
    model: |
      SELECT date, posts FROM ${ref(social_media_activity)} WHERE platform = 'Twitter'
    props:
      type: scatter
      x: ?{date}
      y: ?{posts}
      mode: "lines"
      stackgroup: "one"
      fillcolor: "rgba(29, 161, 242, 0.6)"
      line:
        width: 0
        shape: "spline"  # Smooth curves
      name: "Twitter"
      
  # Similar for other platforms...
```

## Area with Range Bands

Show confidence intervals or min/max ranges:

```yaml
models:
  - name: temperature_forecast
    source_name: analytics_db
    sql: |
      WITH forecast AS (
        SELECT 
          TIMESTAMP '2024-01-01 00:00:00' + (INTERVAL '1 hour' * h) as time,
          20 + 10 * SIN(h * 2 * PI() / 24) as temp_avg,
          5 as uncertainty
        FROM generate_series(0, 168) as h  -- 7 days
      )
      SELECT 
        time,
        temp_avg,
        temp_avg - uncertainty as temp_min,
        temp_avg + uncertainty as temp_max
      FROM forecast

traces:
  # Upper bound (invisible)
  - name: temp_upper
    model: ${ref(temperature_forecast)}
    props:
      type: scatter
      x: ?{time}
      y: ?{temp_max}
      mode: "lines"
      line:
        width: 0
      showlegend: false
      
  # Lower bound with fill to upper
  - name: temp_range
    model: ${ref(temperature_forecast)}
    props:
      type: scatter
      x: ?{time}
      y: ?{temp_min}
      mode: "lines"
      fill: "tonexty"  # Fill to next trace (upper bound)
      fillcolor: "rgba(52, 152, 219, 0.2)"
      line:
        width: 0
      name: "Uncertainty Range"
      
  # Average line
  - name: temp_avg_line
    model: ${ref(temperature_forecast)}
    props:
      type: scatter
      x: ?{time}
      y: ?{temp_avg}
      mode: "lines"
      line:
        color: "#3498db"
        width: 3
      name: "Forecast"
```

## Gradient Fill Areas

Create visually appealing gradient fills:

```yaml
traces:
  - name: gradient_area
    model: ${ref(monthly_revenue)}
    props:
      type: scatter
      x: ?{month}
      y: ?{revenue}
      mode: "lines"
      fill: "tozeroy"
      fillcolor: "rgba(52, 152, 219, 0.6)"
      fillgradient:
        type: "vertical"
        start: "rgba(52, 152, 219, 0.8)"
        stop: "rgba(52, 152, 219, 0.1)"
      line:
        color: "#3498db"
        width: 3
```

## Difference Area Chart

Highlight differences between two series:

```yaml
models:
  - name: actual_vs_forecast
    source_name: analytics_db
    sql: |
      WITH data AS (
        SELECT 
          DATE '2024-01-01' + (INTERVAL '1 day' * d) as date,
          1000 + d * 10 + (RANDOM() - 0.5) * 100 as actual,
          1000 + d * 10 as forecast
        FROM generate_series(0, 30) as d
      )
      SELECT 
        date,
        actual,
        forecast,
        actual - forecast as difference,
        CASE 
          WHEN actual > forecast THEN 'Above'
          ELSE 'Below'
        END as status
      FROM data

traces:
  # Forecast line
  - name: forecast_line
    model: ${ref(actual_vs_forecast)}
    props:
      type: scatter
      x: ?{date}
      y: ?{forecast}
      mode: "lines"
      line:
        color: "gray"
        dash: "dash"
      name: "Forecast"
      
  # Actual line with conditional fill
  - name: actual_line
    model: ${ref(actual_vs_forecast)}
    props:
      type: scatter
      x: ?{date}
      y: ?{actual}
      mode: "lines"
      fill: "tonexty"
      fillcolor: "rgba(46, 204, 113, 0.3)"  # Positive difference
      line:
        color: "#2ecc71"
        width: 2
      name: "Actual"
```

## Best Practices

### Color Selection
- **Transparency**: Use 0.3-0.7 opacity for overlapping areas
- **Contrast**: Ensure sufficient contrast between stacked areas
- **Consistency**: Use related colors for similar categories

### Data Ordering
```yaml
# Order categories consistently for stacked areas
models:
  - name: ordered_data
    sql: |
      SELECT * FROM sales_data
      ORDER BY date, 
        CASE category
          WHEN 'Primary' THEN 1
          WHEN 'Secondary' THEN 2
          WHEN 'Tertiary' THEN 3
        END
```

### Handling Negative Values
```yaml
# Split positive and negative values
traces:
  - name: positive_values
    model: |
      SELECT date, GREATEST(value, 0) as value
      FROM ${ref(data)}
    props:
      fill: "tozeroy"
      fillcolor: "rgba(46, 204, 113, 0.4)"
      
  - name: negative_values
    model: |
      SELECT date, LEAST(value, 0) as value
      FROM ${ref(data)}
    props:
      fill: "tozeroy"
      fillcolor: "rgba(231, 76, 60, 0.4)"
```

## Common Use Cases

### Website Traffic Sources
```yaml
models:
  - name: traffic_sources
    sql: |
      SELECT 
        date,
        source,
        visitors
      FROM web_analytics
      WHERE source IN ('Organic', 'Direct', 'Social', 'Referral')
      ORDER BY date, source
```

### Budget vs Actuals
```yaml
models:
  - name: budget_tracking
    sql: |
      SELECT 
        month,
        budget_amount,
        actual_amount,
        actual_amount - budget_amount as variance
      FROM financial_data
```

### Cumulative Growth
```yaml
models:
  - name: cumulative_users
    sql: |
      SELECT 
        date,
        SUM(new_users) OVER (ORDER BY date) as total_users
      FROM user_signups
```

## Performance Tips

- **Data Aggregation**: Pre-aggregate data at appropriate time intervals
- **Point Reduction**: Use sampling for very large datasets
- **Smooth Curves**: Use `shape: "spline"` sparingly as it's computationally intensive

## Related Resources
- [Line Charts](scatter.md#line-charts) - Simple trend visualization
- [Bar Charts](bar.md) - Discrete value comparison
- [Stacked Bar Charts](bar.md#stacked-bars) - Alternative to stacked areas
- [Time Series Concepts](../concepts/time-series.md) - Working with temporal data

---
*Next Steps:* Explore [3D Visualizations](3d.md) for advanced multidimensional data representation