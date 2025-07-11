# KPI Dashboard Recipe

A comprehensive executive dashboard showing key performance indicators with trends, comparisons, and drill-down capabilities. Perfect for daily business monitoring.

## What This Recipe Includes

- 📊 **Key Metrics Cards** - Revenue, customers, conversion rate, NPS
- 📈 **Trend Analysis** - Current vs previous period comparisons  
- 🎯 **Target Tracking** - Visual progress indicators
- 📱 **Mobile Responsive** - Works on all screen sizes
- ⚡ **Real-time Ready** - Easy to connect to live data

## Complete Configuration

Copy this entire YAML and save as `project.visivo.yml`:

```yaml
name: kpi-dashboard

sources:
  - name: local
    type: duckdb
    database: ":memory:"

# Generate realistic business data
models:
  - name: business_metrics
    source_name: local
    sql: |
      WITH RECURSIVE dates AS (
        -- Generate last 90 days of data
        SELECT DATE '2024-01-01' as date
        UNION ALL
        SELECT date + INTERVAL '1 day'
        FROM dates
        WHERE date < CURRENT_DATE
      ),
      daily_metrics AS (
        SELECT 
          date,
          -- Revenue with weekly seasonality and growth trend
          ROUND(
            100000 + 
            (date - DATE '2024-01-01') * 500 + -- Growth trend
            SIN(EXTRACT(DOW FROM date) * PI() / 3.5) * 15000 + -- Weekly pattern
            (RANDOM() - 0.5) * 10000, -- Daily variance
            2
          ) as revenue,
          
          -- Customers with similar patterns
          CAST(
            1000 + 
            (date - DATE '2024-01-01') * 2 +
            SIN(EXTRACT(DOW FROM date) * PI() / 3.5) * 100 +
            (RANDOM() - 0.5) * 50 
            AS INTEGER
          ) as new_customers,
          
          -- Conversion rate (between 2-5%)
          ROUND(
            3.5 + 
            SIN(EXTRACT(DOW FROM date) * PI() / 3.5) * 1 +
            (RANDOM() - 0.5) * 0.5,
            2
          ) as conversion_rate,
          
          -- NPS Score (between 20-60)
          ROUND(
            40 + 
            (date - DATE '2024-01-01') * 0.05 +
            (RANDOM() - 0.5) * 10,
            1
          ) as nps_score
        FROM dates
      )
      SELECT * FROM daily_metrics

  # Current period summary
  - name: current_period_summary
    source_name: local
    sql: |
      SELECT 
        SUM(revenue) as total_revenue,
        ROUND(AVG(revenue), 2) as avg_daily_revenue,
        SUM(new_customers) as total_customers,
        ROUND(AVG(conversion_rate), 2) as avg_conversion_rate,
        ROUND(AVG(nps_score), 1) as avg_nps_score,
        MIN(date) as period_start,
        MAX(date) as period_end
      FROM ${ref(business_metrics)}
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'

  # Previous period for comparison
  - name: previous_period_summary
    source_name: local
    sql: |
      SELECT 
        SUM(revenue) as total_revenue,
        SUM(new_customers) as total_customers,
        ROUND(AVG(conversion_rate), 2) as avg_conversion_rate,
        ROUND(AVG(nps_score), 1) as avg_nps_score
      FROM ${ref(business_metrics)}
      WHERE date >= CURRENT_DATE - INTERVAL '60 days'
        AND date < CURRENT_DATE - INTERVAL '30 days'

  # Combined with change calculations
  - name: kpi_summary
    source_name: local
    sql: |
      SELECT 
        c.total_revenue,
        c.total_customers,
        c.avg_conversion_rate,
        c.avg_nps_score,
        ROUND((c.total_revenue - p.total_revenue) / p.total_revenue * 100, 1) as revenue_change,
        ROUND((c.total_customers - p.total_customers) / CAST(p.total_customers AS FLOAT) * 100, 1) as customer_change,
        ROUND(c.avg_conversion_rate - p.avg_conversion_rate, 2) as conversion_change,
        ROUND(c.avg_nps_score - p.avg_nps_score, 1) as nps_change
      FROM ${ref(current_period_summary)} c
      CROSS JOIN ${ref(previous_period_summary)} p

  # Daily trend data
  - name: daily_trends
    source_name: local
    sql: |
      WITH daily AS (
        SELECT 
          date,
          revenue,
          new_customers,
          conversion_rate,
          SUM(revenue) OVER (ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) / 7 as revenue_ma7
        FROM ${ref(business_metrics)}
        WHERE date >= CURRENT_DATE - INTERVAL '30 days'
      )
      SELECT * FROM daily
      ORDER BY date

  # Hourly pattern simulation
  - name: hourly_pattern
    source_name: local
    sql: |
      WITH hours AS (
        SELECT generate_series(0, 23) as hour
      )
      SELECT 
        hour,
        ROUND(
          100 + 
          CASE 
            WHEN hour BETWEEN 9 AND 17 THEN 50 + (hour - 9) * 10
            WHEN hour BETWEEN 18 AND 22 THEN 100 - (hour - 18) * 20
            ELSE 20
          END + (RANDOM() - 0.5) * 20,
          2
        ) as hourly_revenue
      FROM hours

# Define visualizations
traces:
  # KPI Cards - using indicator type
  - name: revenue_indicator
    model: ${ref(kpi_summary)}
    props:
      type: indicator
      mode: "number+delta"
      value: ?{total_revenue}
      delta:
        reference: ?{total_revenue / (1 + revenue_change/100)}
        relative: true
        valueformat: "+.1%"
      number:
        valueformat: "$,.0f"
        font:
          size: 24
      domain:
        x: [0, 0.25]
        y: [0.8, 1]
        
  - name: customers_indicator
    model: ${ref(kpi_summary)}
    props:
      type: indicator
      mode: "number+delta"
      value: ?{total_customers}
      delta:
        reference: ?{total_customers / (1 + customer_change/100)}
        relative: true
        valueformat: "+.1%"
      number:
        valueformat: ",.0f"
        font:
          size: 24
      domain:
        x: [0.25, 0.5]
        y: [0.8, 1]
        
  - name: conversion_indicator
    model: ${ref(kpi_summary)}
    props:
      type: indicator
      mode: "number+delta"
      value: ?{avg_conversion_rate}
      delta:
        reference: ?{avg_conversion_rate - conversion_change}
        relative: false
        valueformat: "+.2f"
      number:
        valueformat: ".2f"
        suffix: "%"
        font:
          size: 24
      domain:
        x: [0.5, 0.75]
        y: [0.8, 1]
        
  - name: nps_indicator
    model: ${ref(kpi_summary)}
    props:
      type: indicator
      mode: "number+gauge"
      value: ?{avg_nps_score}
      gauge:
        axis:
          range: [-100, 100]
        bar:
          color: ?{CASE 
            WHEN avg_nps_score >= 50 THEN '#2ecc71'
            WHEN avg_nps_score >= 0 THEN '#f39c12'
            ELSE '#e74c3c'
          END}
        steps:
          - range: [-100, 0]
            color: "rgba(231, 76, 60, 0.1)"
          - range: [0, 50]
            color: "rgba(243, 156, 18, 0.1)"
          - range: [50, 100]
            color: "rgba(46, 204, 113, 0.1)"
      number:
        valueformat: ".0f"
        font:
          size: 24
      domain:
        x: [0.75, 1]
        y: [0.8, 1]

  # Revenue trend line
  - name: revenue_trend
    model: ${ref(daily_trends)}
    props:
      type: scatter
      x: ?{date}
      y: ?{revenue}
      mode: "lines+markers"
      name: "Daily Revenue"
      line:
        color: "#3498db"
        width: 2
      marker:
        size: 6
        color: "#3498db"
      hovertemplate: |
        <b>%{x|%b %d}</b><br>
        Revenue: $%{y:,.0f}<br>
        <extra></extra>
        
  - name: revenue_ma
    model: ${ref(daily_trends)}
    props:
      type: scatter
      x: ?{date}
      y: ?{revenue_ma7}
      mode: "lines"
      name: "7-Day Average"
      line:
        color: "#e74c3c"
        width: 2
        dash: "dash"
        
  # Customer acquisition
  - name: customer_bars
    model: ${ref(daily_trends)}
    props:
      type: bar
      x: ?{date}
      y: ?{new_customers}
      name: "New Customers"
      marker:
        color: "#2ecc71"
        
  # Conversion rate area
  - name: conversion_area
    model: ${ref(daily_trends)}
    props:
      type: scatter
      x: ?{date}
      y: ?{conversion_rate}
      mode: "lines"
      fill: "tozeroy"
      name: "Conversion Rate"
      fillcolor: "rgba(155, 89, 182, 0.3)"
      line:
        color: "#9b59b6"
        width: 2
        
  # Hourly heatmap
  - name: hourly_heatmap
    model: ${ref(hourly_pattern)}
    props:
      type: bar
      x: ?{hour}
      y: ?{hourly_revenue}
      marker:
        color: ?{hourly_revenue}
        colorscale: "Viridis"
        showscale: false
      text: ?{'$' || ROUND(hourly_revenue)}
      textposition: "outside"
      textfont:
        size: 10

# Compose charts
charts:
  - name: kpi_cards
    traces:
      - ${ref(revenue_indicator)}
      - ${ref(customers_indicator)}
      - ${ref(conversion_indicator)}
      - ${ref(nps_indicator)}
    layout:
      showlegend: false
      height: 150
      margin:
        l: 20
        r: 20
        t: 40
        b: 20
      annotations:
        - text: "<b>Total Revenue</b>"
          x: 0.125
          y: 0.5
          xref: "paper"
          yref: "paper"
          showarrow: false
          font:
            size: 14
        - text: "<b>New Customers</b>"
          x: 0.375
          y: 0.5
          xref: "paper"
          yref: "paper"
          showarrow: false
          font:
            size: 14
        - text: "<b>Conversion Rate</b>"
          x: 0.625
          y: 0.5
          xref: "paper"
          yref: "paper"
          showarrow: false
          font:
            size: 14
        - text: "<b>NPS Score</b>"
          x: 0.875
          y: 0.5
          xref: "paper"
          yref: "paper"
          showarrow: false
          font:
            size: 14

  - name: revenue_chart
    traces:
      - ${ref(revenue_trend)}
      - ${ref(revenue_ma)}
    layout:
      title: "Revenue Trend (Last 30 Days)"
      xaxis:
        title: ""
        tickformat: "%b %d"
      yaxis:
        title: "Revenue ($)"
        tickformat: "$,.0f"
      hovermode: "x unified"
      showlegend: true
      legend:
        x: 0
        y: 1

  - name: customer_chart
    traces:
      - ${ref(customer_bars)}
    layout:
      title: "Daily Customer Acquisition"
      xaxis:
        title: ""
        tickformat: "%b %d"
      yaxis:
        title: "New Customers"
      showlegend: false

  - name: conversion_chart
    traces:
      - ${ref(conversion_area)}
    layout:
      title: "Conversion Rate Trend"
      xaxis:
        title: ""
        tickformat: "%b %d"
      yaxis:
        title: "Conversion Rate (%)"
        tickformat: ".1f"
      showlegend: false

  - name: hourly_chart
    traces:
      - ${ref(hourly_heatmap)}
    layout:
      title: "Revenue by Hour (Today)"
      xaxis:
        title: "Hour"
        tickmode: "linear"
        tick0: 0
        dtick: 3
      yaxis:
        title: "Revenue ($)"
        tickformat: "$,.0f"
      showlegend: false

# Dashboard layout
dashboards:
  - name: executive_kpi
    rows:
      # Header
      - height: small
        items:
          - width: 12
            markdown: |
              # Executive Dashboard
              **Last Updated:** ${datetime_now()}
              
              📊 Key metrics for the last 30 days with period-over-period comparisons
              
      # KPI Cards
      - height: small
        items:
          - width: 12
            chart: ${ref(kpi_cards)}
            
      # Main metrics
      - height: medium
        items:
          - width: 8
            chart: ${ref(revenue_chart)}
          - width: 4
            chart: ${ref(hourly_chart)}
            
      # Secondary metrics
      - height: medium
        items:
          - width: 6
            chart: ${ref(customer_chart)}
          - width: 6
            chart: ${ref(conversion_chart)}
            
      # Footer insights
      - height: small
        items:
          - width: 12
            markdown: |
              ## Insights
              - **Revenue**: Growing at ~3% week-over-week with strong weekend performance
              - **Customers**: Acquisition remains steady with slight uptick on Mondays
              - **Conversion**: Maintaining healthy 3-4% range with room for optimization
              - **NPS**: Trending positive, focus on detractor feedback to reach 50+
```

## Customization Guide

### Adapting to Your Data

1. **Replace the source** with your database:
```yaml
sources:
  - name: production
    type: postgresql  # or snowflake, mysql, etc.
    host: ${env_var('DB_HOST')}
    database: ${env_var('DB_NAME')}
```

2. **Update models** to query your tables:
```yaml
models:
  - name: business_metrics
    sql: |
      SELECT 
        date,
        revenue,
        customer_count,
        conversion_rate,
        nps_score
      FROM daily_metrics
      WHERE date >= CURRENT_DATE - INTERVAL '90 days'
```

### Changing Metrics

Add or replace KPI cards by:

1. Creating a new indicator trace:
```yaml
traces:
  - name: aov_indicator
    model: ${ref(kpi_summary)}
    props:
      type: indicator
      mode: "number+delta"
      value: ?{avg_order_value}
      delta:
        reference: ?{prev_avg_order_value}
```

2. Adding to the KPI cards chart:
```yaml
charts:
  - name: kpi_cards
    traces:
      - ${ref(revenue_indicator)}
      - ${ref(aov_indicator)}  # Add here
```

### Styling Options

Customize colors and themes:
```yaml
# Brand colors
props:
  line:
    color: "#your-brand-color"
  marker:
    color: "#your-secondary-color"
```

## Performance Tips

1. **Pre-aggregate data** in your models
2. **Use materialized views** for complex calculations
3. **Limit date ranges** to necessary periods
4. **Index** date and dimension columns

## Common Extensions

- **Add filters**: Date range selector, product filter
- **Drill-down**: Click metrics to see detailed breakdowns
- **Real-time updates**: Connect to streaming data
- **Alerts**: Add threshold indicators
- **Export**: Enable CSV downloads

## Next Steps

- Try the [Sales Analytics](sales-analytics.md) recipe for deeper sales insights
- Check [How-To: Selectors](../howto/selectors.md) to add interactivity
- See [Tutorial: Advanced Dashboards](../tutorials/advanced-interactivity.md) for more techniques

---
*Questions?* Ask in our [Community Slack](https://visivo-community.slack.com)!