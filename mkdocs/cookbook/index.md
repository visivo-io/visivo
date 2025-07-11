# Cookbook

Production-ready dashboard recipes you can copy, customize, and deploy. Each recipe is a complete, working example designed to solve real business problems.

## What's in the Cookbook?

Each recipe includes:
- ✅ **Complete YAML configuration** - Copy and run immediately
- ✅ **Sample data generation** - No external dependencies needed
- ✅ **Best practices** - Production-tested patterns
- ✅ **Customization guide** - Adapt to your needs
- ✅ **Performance tips** - Scale to real-world data

## Recipe Categories

<div class="grid cards" markdown>

### :material-chart-line: Business Dashboards

Complete dashboards for common business metrics and KPIs.

-   **[KPI Dashboard](kpi-dashboard.md)**  
    Executive dashboard with key metrics, trends, and targets

-   **[Sales Analytics](sales-analytics.md)**  
    Comprehensive sales performance tracking and forecasting

-   **[Marketing Metrics](marketing.md)**  
    Campaign performance, ROI, and customer acquisition

### :material-cogs: Engineering & Operations

Technical dashboards for engineering teams and operations.

-   **[CI/CD Metrics](cicd-metrics.md)**  
    Build times, success rates, and deployment frequency

-   **[System Monitoring](monitoring.md)**  
    Server health, resource usage, and uptime tracking

-   **[Error Tracking](errors.md)**  
    Application errors, trends, and debugging insights

### :material-database: Data Quality

Monitor and maintain data quality across your systems.

-   **[Data Validation](validation.md)**  
    Automated data quality checks and anomaly detection

-   **[Anomaly Detection](anomalies.md)**  
    Statistical methods for finding outliers and unusual patterns

</div>

## Quick Start with Any Recipe

1. **Copy the YAML** - Each recipe is self-contained
2. **Save as `project.visivo.yml`** in a new directory
3. **Run `visivo serve`** - See your dashboard immediately
4. **Customize** - Modify queries, colors, and layouts

## How Recipes are Structured

```yaml
# Each recipe follows this pattern:
name: recipe-name

sources:
  - name: local
    type: duckdb
    database: ":memory:"  # In-memory for demos

models:
  # Sample data generation
  - name: sample_data
    sql: |
      -- Self-contained data using CTEs
      
  # Business logic and calculations
  - name: calculated_metrics
    sql: |
      -- Transformations on sample data

traces:
  # Visualizations
  
charts:
  # Composed visualizations
  
dashboards:
  # Complete dashboard layout
```

## Adapting Recipes to Your Data

### Step 1: Replace the Source
```yaml
# Change from demo:
sources:
  - name: local
    type: duckdb
    database: ":memory:"

# To your database:
sources:
  - name: production
    type: postgresql
    host: ${env_var('DB_HOST')}
    database: ${env_var('DB_NAME')}
    username: ${env_var('DB_USER')}
    password: ${env_var('DB_PASSWORD')}
```

### Step 2: Update Models
```yaml
# Change from generated data:
models:
  - name: sales_data
    sql: |
      WITH sales AS (
        -- Generated sample data
      )

# To your tables:
models:
  - name: sales_data
    sql: |
      SELECT * FROM sales_transactions
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
```

### Step 3: Adjust Visualizations
- Update column references in `?{}` expressions
- Modify aggregations and calculations
- Adjust time ranges and filters

## Recipe Design Principles

1. **Self-Contained** - No external dependencies
2. **Realistic Data** - Patterns that mirror production
3. **Performance-Ready** - Optimized queries and aggregations
4. **Customizable** - Clear structure for modifications
5. **Best Practices** - Industry-standard approaches

## Common Patterns

### Time Series with Comparison
Most recipes include year-over-year or period comparisons:
```yaml
# Current vs previous period pattern
WITH current_period AS (...),
     previous_period AS (...)
SELECT ... FROM current_period
LEFT JOIN previous_period ON ...
```

### Dynamic Aggregations
Flexible grouping and summarization:
```yaml
# Configurable time granularity
DATE_TRUNC(
  '${selector(time_granularity)}',  -- day/week/month
  timestamp_column
) as period
```

### Responsive Layouts
Mobile-friendly dashboard grids:
```yaml
rows:
  - height: small    # KPI cards
  - height: medium   # Main charts
  - height: large    # Detailed tables
```

## Contributing a Recipe

Have a great dashboard pattern? We'd love to include it!

1. Start with an existing recipe as a template
2. Ensure it runs with `visivo serve` without errors
3. Include helpful comments and documentation
4. Submit a PR to [github.com/visivo-io/visivo](https://github.com/visivo-io/visivo)

## Need Help?

- 📚 Check the [Tutorials](../tutorials/index.md) for step-by-step learning
- 📖 Read the [How-To Guides](../howto/index.md) for specific tasks
- 💬 Ask in [Community Slack](https://visivo-community.slack.com)
- 📧 Email [support@visivo.io](mailto:support@visivo.io)

---

**Ready to cook?** Start with the [KPI Dashboard](kpi-dashboard.md) for a comprehensive example!