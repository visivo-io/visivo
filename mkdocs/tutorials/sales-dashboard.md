# Tutorial: Building a Sales Dashboard

In this tutorial, we'll build a comprehensive sales analytics dashboard from scratch. You'll learn how to work with real-world data patterns, create multiple visualization types, and build a professional dashboard layout.

## What We'll Build

<!-- ![Sales Dashboard Preview](../assets/tutorials/sales-dashboard-complete.png) -->

A complete sales analytics dashboard featuring:
- 📊 Revenue trends with year-over-year comparison
- 🗺️ Geographic sales distribution
- 📈 Product performance analysis  
- 👥 Customer segmentation
- 🎯 Sales target tracking
- 📱 Mobile-responsive layout

**Time Required:** 90 minutes  
**Skill Level:** Intermediate

## Prerequisites

Before starting this tutorial, you should have:

- ✅ Completed [Your First Dashboard](../quickstart/first-dashboard.md)
- ✅ Basic SQL knowledge (JOINs, aggregations)
- ✅ Visivo installed and configured
- ✅ Access to a PostgreSQL database (or use our sample data)

## Project Setup

### Step 1: Create Project Structure

Create a new project directory with proper organization:

```bash
mkdir sales-analytics
cd sales-analytics
visivo init --name sales-analytics
```

Create the following directory structure:
```
sales-analytics/
├── project.visivo.yml
├── models/
│   ├── staging/
│   │   ├── stg_orders.sql
│   │   ├── stg_customers.sql
│   │   └── stg_products.sql
│   └── marts/
│       ├── revenue_daily.sql
│       ├── customer_summary.sql
│       └── product_performance.sql
├── includes/
│   ├── colors.yml
│   └── layouts.yml
└── .env
```

### Step 2: Configure Data Source

Set up your database connection in `project.visivo.yml`:

```yaml
name: sales-analytics

# Include shared configurations
includes:
  - includes/colors.yml
  - includes/layouts.yml

sources:
  - name: sales_db
    type: postgresql
    host: ${env_var('DB_HOST')}
    database: ${env_var('DB_NAME')}
    username: ${env_var('DB_USER')}
    password: ${env_var('DB_PASSWORD')}
    db_schema: public

defaults:
  source_name: sales_db
```

Create `.env` file:
```
DB_HOST=localhost
DB_NAME=sales
DB_USER=analytics_user
DB_PASSWORD=secure_password
```

## Part 1: Data Modeling

Good dashboards start with well-structured data. We'll use a staging → marts pattern.

### Staging Models

Create `models/staging/stg_orders.sql`:

```sql
-- Standardize and clean raw order data
WITH cleaned_orders AS (
  SELECT
    order_id,
    customer_id,
    product_id,
    order_date::date as order_date,
    quantity,
    unit_price,
    discount,
    quantity * unit_price * (1 - discount) as revenue,
    shipping_cost,
    order_status,
    sales_channel,
    region,
    country
  FROM raw.orders
  WHERE order_status NOT IN ('cancelled', 'returned')
    AND order_date >= '2023-01-01'
)
SELECT * FROM cleaned_orders
```

Create `models/staging/stg_customers.sql`:

```sql
-- Customer dimension with calculated fields
SELECT
  customer_id,
  customer_name,
  company_name,
  segment,
  join_date,
  lifetime_value,
  CASE 
    WHEN lifetime_value >= 10000 THEN 'High Value'
    WHEN lifetime_value >= 5000 THEN 'Medium Value'
    ELSE 'Low Value'
  END as value_tier
FROM raw.customers
WHERE is_active = true
```

Create `models/staging/stg_products.sql`:

```sql
-- Product dimension with categories
SELECT
  product_id,
  product_name,
  category,
  sub_category,
  unit_cost,
  list_price,
  (list_price - unit_cost) / list_price as margin_pct
FROM raw.products
WHERE is_available = true
```

### Mart Models

Create `models/marts/revenue_daily.sql`:

```sql
-- Daily revenue with year-over-year comparison
WITH daily_revenue AS (
  SELECT
    order_date,
    SUM(revenue) as revenue,
    COUNT(DISTINCT order_id) as order_count,
    COUNT(DISTINCT customer_id) as customer_count,
    SUM(revenue) / COUNT(DISTINCT order_id) as avg_order_value
  FROM ${ref(stg_orders)}
  GROUP BY order_date
),
yoy_comparison AS (
  SELECT
    current.order_date,
    current.revenue,
    previous.revenue as revenue_last_year,
    (current.revenue - previous.revenue) / previous.revenue as yoy_growth
  FROM daily_revenue current
  LEFT JOIN daily_revenue previous
    ON current.order_date = previous.order_date + INTERVAL '1 year'
)
SELECT * FROM yoy_comparison
```

## Part 2: Creating Visualizations

Now let's create traces for our visualizations.

### Revenue Trend Chart

Add to `project.visivo.yml`:

```yaml
traces:
  # Main revenue line
  - name: revenue_trend
    model: ${ref(revenue_daily)}
    props:
      type: scatter
      mode: lines
      x: ?{order_date}
      y: ?{revenue}
      name: "Current Year"
      line:
        color: ${color.primary}
        width: 3
      hovertemplate: |
        <b>%{x|%B %d, %Y}</b><br>
        Revenue: $%{y:,.0f}<br>
        <extra></extra>
    order_by:
      - ?{order_date asc}

  # Previous year comparison
  - name: revenue_last_year
    model: ${ref(revenue_daily)}
    props:
      type: scatter
      mode: lines
      x: ?{order_date}
      y: ?{revenue_last_year}
      name: "Previous Year"
      line:
        color: ${color.secondary}
        width: 2
        dash: dot
      opacity: 0.7
    order_by:
      - ?{order_date asc}

  # YoY growth indicator
  - name: yoy_growth_indicator
    model: |
      SELECT 
        AVG(yoy_growth) as avg_growth,
        CASE 
          WHEN AVG(yoy_growth) >= 0.1 THEN 'green'
          WHEN AVG(yoy_growth) >= 0 THEN 'yellow'
          ELSE 'red'
        END as color
      FROM ${ref(revenue_daily)}
      WHERE order_date >= CURRENT_DATE - INTERVAL '30 days'
    props:
      type: indicator
      mode: "number+delta"
      value: ?{avg_growth}
      delta:
        reference: 0
        valueformat: "+.1%"
      number:
        valueformat: ".1%"
```

### Geographic Distribution

```yaml
traces:
  - name: sales_by_country
    model: |
      SELECT 
        country,
        country_code,
        SUM(revenue) as total_revenue,
        COUNT(DISTINCT customer_id) as customer_count
      FROM ${ref(stg_orders)}
      GROUP BY country, country_code
    props:
      type: choropleth
      locations: ?{country_code}
      z: ?{total_revenue}
      text: ?{country}
      colorscale: "Blues"
      reversescale: false
      marker:
        line:
          color: "white"
          width: 0.5
      colorbar:
        title: "Revenue ($)"
        tickformat: "$,.0f"
```

### Product Performance Matrix

```yaml
traces:
  - name: product_scatter
    model: |
      SELECT 
        p.product_name,
        p.category,
        SUM(o.quantity) as units_sold,
        SUM(o.revenue) as total_revenue,
        AVG(p.margin_pct) as margin
      FROM ${ref(stg_orders)} o
      JOIN ${ref(stg_products)} p ON o.product_id = p.product_id
      GROUP BY p.product_name, p.category
      HAVING SUM(o.revenue) > 1000
    props:
      type: scatter
      mode: markers
      x: ?{units_sold}
      y: ?{margin}
      size: ?{total_revenue}
      color: ?{category}
      text: ?{product_name}
      marker:
        sizemode: area
        sizeref: 0.001
        sizemin: 4
      hovertemplate: |
        <b>%{text}</b><br>
        Units Sold: %{x}<br>
        Margin: %{y:.1%}<br>
        Revenue: $%{marker.size:,.0f}
        <extra></extra>
```

## Part 3: Building Charts

Compose traces into charts with proper layouts:

```yaml
charts:
  - name: revenue_trend_chart
    traces:
      - ${ref(revenue_trend)}
      - ${ref(revenue_last_year)}
    layout:
      title: "Revenue Trend with YoY Comparison"
      xaxis:
        title: "Date"
        rangeslider:
          visible: true
      yaxis:
        title: "Revenue ($)"
        tickformat: "$,.0f"
      hovermode: "x unified"
      ${layout.default}

  - name: geographic_sales
    traces:
      - ${ref(sales_by_country)}
    layout:
      title: "Sales by Country"
      geo:
        projection:
          type: "natural earth"
      ${layout.map}

  - name: product_analysis
    traces:
      - ${ref(product_scatter)}
    layout:
      title: "Product Performance Matrix"
      xaxis:
        title: "Units Sold"
        type: "log"
      yaxis:
        title: "Profit Margin"
        tickformat: ".0%"
      ${layout.scatter}
```

## Part 4: Customer Segmentation

Add customer analysis:

```yaml
models:
  - name: customer_segments
    sql: |
      WITH customer_metrics AS (
        SELECT 
          c.customer_id,
          c.segment,
          c.value_tier,
          COUNT(DISTINCT o.order_id) as order_count,
          SUM(o.revenue) as total_revenue,
          MAX(o.order_date) as last_order_date,
          CURRENT_DATE - MAX(o.order_date) as days_since_last_order
        FROM ${ref(stg_customers)} c
        LEFT JOIN ${ref(stg_orders)} o ON c.customer_id = o.customer_id
        GROUP BY c.customer_id, c.segment, c.value_tier
      )
      SELECT 
        segment,
        value_tier,
        COUNT(*) as customer_count,
        AVG(total_revenue) as avg_revenue,
        AVG(order_count) as avg_orders
      FROM customer_metrics
      GROUP BY segment, value_tier

traces:
  - name: customer_heatmap
    model: ${ref(customer_segments)}
    props:
      type: heatmap
      x: ?{segment}
      y: ?{value_tier}
      z: ?{customer_count}
      colorscale: "YlOrRd"
      text: ?{customer_count}
      texttemplate: "%{text}"
      hovertemplate: |
        Segment: %{x}<br>
        Value Tier: %{y}<br>
        Customers: %{z}<br>
        Avg Revenue: $%{customdata[0]:,.0f}<br>
        Avg Orders: %{customdata[1]:.1f}
        <extra></extra>
      customdata: ?{array[avg_revenue, avg_orders]}
```

## Part 5: Dashboard Assembly

Create the final dashboard layout:

```yaml
selectors:
  - name: date_filter
    type: daterange
    default:
      start: ${date_add(today(), -90)}
      end: ${today()}

  - name: category_filter
    type: multiselect
    model: |
      SELECT DISTINCT category 
      FROM ${ref(stg_products)}
      ORDER BY category
    default: ["All"]

dashboards:
  - name: sales_analytics
    selector: 
      - ${ref(date_filter)}
      - ${ref(category_filter)}
    rows:
      # Header
      - height: small
        items:
          - width: 12
            markdown: |
              # 📊 Sales Analytics Dashboard
              Comprehensive insights into sales performance and customer behavior
              
              Generated: ${datetime_now()}

      # KPI Row
      - height: small
        items:
          - width: 3
            chart: ${ref(total_revenue_kpi)}
          - width: 3
            chart: ${ref(total_orders_kpi)}
          - width: 3
            chart: ${ref(avg_order_value_kpi)}
          - width: 3
            chart: ${ref(yoy_growth_kpi)}

      # Main Charts
      - height: large
        items:
          - width: 8
            chart: ${ref(revenue_trend_chart)}
          - width: 4
            chart: ${ref(top_products_bar)}

      # Geographic and Segments
      - height: medium
        items:
          - width: 6
            chart: ${ref(geographic_sales)}
          - width: 6
            chart: ${ref(customer_heatmap_chart)}

      # Product Analysis
      - height: large
        items:
          - width: 12
            chart: ${ref(product_analysis)}

      # Tables
      - height: medium
        items:
          - width: 6
            table: ${ref(top_customers_table)}
          - width: 6
            table: ${ref(recent_orders_table)}
```

## Part 6: Adding Polish

### Custom Styling

Create `includes/colors.yml`:

```yaml
color:
  primary: "#1f77b4"
  secondary: "#ff7f0e"
  success: "#2ca02c"
  danger: "#d62728"
  warning: "#ff7f0e"
  info: "#17a2b8"
  
  # Chart-specific
  revenue: "#1f77b4"
  profit: "#2ca02c"
  cost: "#d62728"
  
  # Gradients
  gradient_blue: ["#f0f9ff", "#1e40af"]
  gradient_green: ["#f0fdf4", "#166534"]
```

### Responsive Layouts

Create `includes/layouts.yml`:

```yaml
layout:
  default:
    font:
      family: "Inter, sans-serif"
    margin:
      l: 60
      r: 30
      t: 60
      b: 60
    plot_bgcolor: "rgba(0,0,0,0)"
    paper_bgcolor: "rgba(0,0,0,0)"
    
  map:
    margin:
      l: 0
      r: 0
      t: 40
      b: 0
      
  scatter:
    xaxis:
      showgrid: true
      gridcolor: "rgba(0,0,0,0.1)"
    yaxis:
      showgrid: true
      gridcolor: "rgba(0,0,0,0.1)"
```

### Performance Optimization

Add indexes to your database:

```sql
-- Add these indexes for better performance
CREATE INDEX idx_orders_date ON orders(order_date);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_product ON orders(product_id);
CREATE INDEX idx_orders_composite ON orders(order_date, customer_id, product_id);
```

## Part 7: Testing

Add tests to ensure data quality:

```yaml
traces:
  - name: revenue_trend
    # ... trace configuration ...
    tests:
      - row_count > 0
      - revenue >= 0
      - order_date is not null

models:
  - name: revenue_daily
    # ... model configuration ...
    tests:
      - unique: order_date
      - not_null: [order_date, revenue]
      - custom: |
          SELECT COUNT(*) = 0
          FROM ${ref(revenue_daily)}
          WHERE revenue < 0
```

Run tests:
```bash
visivo test
```

## Deployment

### Local Development
```bash
visivo serve
```

### Production Deployment
```bash
# Set production environment
export ENVIRONMENT=production

# Deploy to Visivo Cloud
visivo deploy -s production

# Or self-host with Docker
docker build -t sales-dashboard .
docker run -p 8000:8000 sales-dashboard
```

## Summary

Congratulations! You've built a professional sales analytics dashboard with:

- ✅ Modular data models (staging → marts pattern)
- ✅ Multiple visualization types (lines, maps, heatmaps, scatter)
- ✅ Interactive filters and selectors
- ✅ Responsive layout design
- ✅ Performance optimizations
- ✅ Data quality tests
- ✅ Production-ready deployment

## Exercises

Practice what you've learned:

1. **Add a Funnel Chart**: Create a sales funnel showing conversion rates
2. **Time Comparison**: Add week-over-week and month-over-month comparisons
3. **Drill-Down**: Implement click-through from country to city level
4. **Alerts**: Add threshold alerts for low sales days
5. **Export**: Add functionality to export data to CSV

## Next Steps

- [Advanced Interactivity Tutorial](advanced-interactivity.md)
- [Performance Optimization Guide](../howto/performance.md)
- [Production Deployment Guide](../howto/production-deploy.md)
- [Browse the Cookbook](../cookbook/index.md) for more examples

---

_Questions about this tutorial?_ Ask in our [Community Slack](https://visivo-community.slack.com)!