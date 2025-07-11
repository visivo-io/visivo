# Your First Dashboard

In this guide, we'll create a simple but complete dashboard in under 10 minutes. You'll learn the core concepts of Visivo while building something real.

## What We'll Build

We'll create a sales dashboard that shows:
- Monthly revenue trend (bar chart)
- Sales by product category (pie chart)  
- Top customers table
- Key metrics summary

<!-- ![Dashboard Preview](../assets/quickstart-dashboard-preview.png) -->

## Prerequisites

- ✅ Visivo installed (`pip install visivo`)
- ✅ Completed the [installation guide](installation.md)
- ✅ Basic familiarity with YAML

## Step 1: Create a New Project

First, create a new directory and initialize a Visivo project:

```bash
mkdir my-first-dashboard
cd my-first-dashboard
visivo init
```

When prompted:
- Choose `duckdb` as your database type
- Accept the default project name
- Skip the API key for now (just press Enter)

This creates:
- `project.visivo.yml` - Your main configuration file
- `data/` directory - For sample data
- `.visivo/` directory - For generated files

## Step 2: Configure Your Data

For this tutorial, we'll use DuckDB with sample data. You have two options:

### Option A: Use In-Memory Data (Recommended for Quick Start)
We'll create data on-the-fly using DuckDB's in-memory database.

### Option B: Download Sample Database
For a more realistic example, download our pre-built sample database:
```bash
# Download the sample database
curl -O https://raw.githubusercontent.com/visivo-io/visivo/main/docs/assets/sample_sales.duckdb
```

## Step 3: Configure Your Dashboard

Replace the contents of `project.visivo.yml` with:

```yaml
name: my-first-dashboard

sources:
  - name: local
    type: duckdb
    database: ":memory:"  # In-memory DuckDB database

models:
  - name: sales_data
    source_name: local
    sql: |
      WITH sales_data AS (
        SELECT 
          '2024-01-01'::DATE as date, 
          'Electronics' as category, 
          'Customer A' as customer, 
          45000 as revenue
        UNION ALL SELECT '2024-01-01'::DATE, 'Clothing', 'Customer B', 32000
        UNION ALL SELECT '2024-01-01'::DATE, 'Books', 'Customer C', 18000
        UNION ALL SELECT '2024-02-01'::DATE, 'Electronics', 'Customer A', 52000
        UNION ALL SELECT '2024-02-01'::DATE, 'Clothing', 'Customer D', 28000
        UNION ALL SELECT '2024-02-01'::DATE, 'Books', 'Customer C', 22000
        UNION ALL SELECT '2024-03-01'::DATE, 'Electronics', 'Customer B', 48000
        UNION ALL SELECT '2024-03-01'::DATE, 'Clothing', 'Customer A', 35000
        UNION ALL SELECT '2024-03-01'::DATE, 'Books', 'Customer E', 25000
      )
      SELECT * FROM sales_data

traces:
  # Monthly revenue bar chart
  - name: monthly_revenue
    model: ${ref(sales_data)}
    props:
      type: bar
      x: ?{strftime('%Y-%m', date)}
      y: ?{sum(revenue)}
      text: ?{sum(revenue)}
      textposition: "outside"
      texttemplate: "$%{text:,.0f}"
      marker:
        color: "#1f77b4"
    order_by:
      - ?{date asc}

  # Category pie chart
  - name: category_breakdown
    model: ${ref(sales_data)}
    props:
      type: pie
      labels: ?{category}
      values: ?{sum(revenue)}
      textinfo: "label+percent"
      hole: 0.4
      marker:
        colors: ["#1f77b4", "#ff7f0e", "#2ca02c"]

  # Customer ranking
  - name: top_customers_data
    model: ${ref(sales_data)}
    props:
      type: table
      cells:
        values:
          - ?{customer}
          - ?{sum(revenue)}
          - ?{count(*)}
    order_by:
      - ?{sum(revenue) desc}

charts:
  - name: revenue_trend
    traces:
      - ${ref(monthly_revenue)}
    layout:
      title: "Monthly Revenue Trend"
      xaxis:
        title: "Month"
      yaxis:
        title: "Revenue ($)"
        tickformat: "$,.0f"
      height: 300

  - name: category_pie
    traces:
      - ${ref(category_breakdown)}
    layout:
      title: "Revenue by Category"
      height: 300

tables:
  - name: top_customers
    trace: ${ref(top_customers_data)}
    columns:
      - name: "Customer"
        width: 200
      - name: "Total Revenue"
        format: "$,.0f"
        width: 150
      - name: "Orders"
        width: 100

dashboards:
  - name: sales_overview
    rows:
      # Header row with title
      - height: small
        items:
          - width: 12
            markdown: |
              # Sales Dashboard
              ### Monthly performance and customer insights
              
      # Metrics row
      - height: small
        items:
          - width: 3
            markdown: |
              ## $348K
              **Total Revenue**
              
          - width: 3
            markdown: |
              ## 9
              **Total Orders**
              
          - width: 3
            markdown: |
              ## $38.7K
              **Avg Order Value**
              
          - width: 3
            markdown: |
              ## 5
              **Active Customers**
      
      # Charts row
      - height: medium
        items:
          - width: 8
            chart: ${ref(revenue_trend)}
          - width: 4
            chart: ${ref(category_pie)}
      
      # Table row
      - height: medium
        items:
          - width: 12
            table: ${ref(top_customers)}
```

## Step 4: Run Your Dashboard

Now let's see your dashboard in action:

```bash
visivo serve
```

This will:
1. Compile your configuration
2. Execute the queries
3. Start a local server
4. Open your browser to `http://localhost:8000`

You should see your dashboard with:
- A bar chart showing monthly revenue
- A donut chart breaking down sales by category
- A table of top customers
- Summary metrics at the top

## Step 5: Make It Interactive

Let's add a date filter to make the dashboard interactive. Add this selector to your configuration:

```yaml
selectors:
  - name: date_range
    type: daterange
    default:
      start: "2024-01-01"
      end: "2024-12-31"
```

Then update your models to use the selector:

```yaml
models:
  - name: sales_data
    source_name: local
    sql: |
      WITH sales_data AS (
        -- [Previous CTE definition here for brevity]
      )
      SELECT * FROM sales_data
      WHERE date >= '{% raw %}{{ selector(date_range.start) }}{% endraw %}'
        AND date <= '{% raw %}{{ selector(date_range.end) }}{% endraw %}'
```

Update your dashboard to include the selector:

```yaml
dashboards:
  - name: sales_overview
    selector: ${ref(date_range)}  # Add this line
    rows:
      # ... rest of your dashboard configuration
```

Save the file and your dashboard will automatically reload with the date filter!

## Step 6: Customize and Explore

Try these modifications to learn more:

### Change Chart Types
Transform the bar chart into a line chart:
```yaml
props:
  type: scatter
  mode: "lines+markers"
  # ... rest stays the same
```

### Adjust Colors
Use a custom color scheme:
```yaml
marker:
  colors: ["#e74c3c", "#3498db", "#2ecc71"]
```

### Add More Data
Extend the sample data with more months or categories in `models/sample_data.sql`.

### Modify Layout
Change the dashboard grid by adjusting `width` values (they're relative to each other in a row).

## What You've Learned

Congratulations! You've created your first Visivo dashboard and learned:

- ✅ **Project structure** - How Visivo projects are organized
- ✅ **Sources** - Connecting to databases (SQLite in this case)
- ✅ **Models** - Defining data queries
- ✅ **Traces** - Creating visual elements (bars, pies, tables)
- ✅ **Charts** - Composing traces with layouts
- ✅ **Dashboards** - Arranging charts in a grid
- ✅ **Selectors** - Adding interactivity
- ✅ **Live reload** - How changes update automatically

## Next Steps

Now that you have a working dashboard:

1. **[Connect Your Own Data](connect-data.md)** - Link to a real database
2. **[Browse the Chart Gallery](../gallery/index.md)** - Explore all chart types
3. **[Follow a Tutorial](../tutorials/index.md)** - Build more complex dashboards
4. **[Deploy Your Dashboard](../howto/cloud-deploy.md)** - Share with others

## Troubleshooting

### Dashboard won't load?
- Check the terminal for error messages
- Verify your YAML syntax (indentation matters!)
- Ensure all `${ref()}` references match actual names

### Charts look wrong?
- Verify your SQL returns the expected columns
- Check that `?{}` expressions are valid SQL
- Look at the browser console for JavaScript errors

### DuckDB specific issues?
- Ensure date casting is correct (use `::DATE`)
- Check that aggregations are properly grouped
- Verify column names match exactly (case-sensitive)

### Need help?
- Join our [Community Slack](https://visivo-community.slack.com)
- Check the [How-To Guides](../howto/index.md)
- Email [support@visivo.io](mailto:support@visivo.io)

---

_Ready for more?_ **[Connect your own data →](connect-data.md)**