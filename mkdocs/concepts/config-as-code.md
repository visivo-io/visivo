# Configuration as Code

Visivo embraces configuration as code, allowing you to define dashboards using YAML files. This approach brings software engineering best practices to business intelligence.

## Why Configuration as Code?

### Traditional BI Tools
- 🖱️ Drag-and-drop interfaces
- 🔒 Changes locked in proprietary formats
- 👤 Single-user editing
- 📦 Hard to version or review
- 🚫 No automated testing

### Visivo's Approach
- 📝 YAML configuration files
- 🔄 Git version control
- 👥 Collaborative development
- ✅ Code review process
- 🤖 CI/CD automation

## Core Concepts

### 1. Declarative Configuration

Instead of clicking through UIs, you declare what you want:

```yaml
# Declare a chart
charts:
  - name: revenue_chart
    traces:
      - ${ref(revenue_trace)}
    layout:
      title: "Monthly Revenue"
      height: 400
```

### 2. Reference System

Link components together using references:

```yaml
# Define once
models:
  - name: sales_data
    sql: SELECT * FROM sales

# Reference many times
traces:
  - name: sales_by_region
    model: ${ref(sales_data)}  # Reference the model
    
  - name: sales_by_product
    model: ${ref(sales_data)}  # Reuse same model
```

### 3. Environment Variables

Separate configuration from secrets:

{% raw %}
```yaml
sources:
  - name: production_db
    type: postgresql
    host: ${env_var('DB_HOST')}
    password: ${env_var('DB_PASSWORD')}
    database: ${env_var('DB_NAME', 'analytics')}  # With default
```
{% endraw %}

### 4. Templating with Jinja2

Dynamic configuration using Jinja2:

{% raw %}
```yaml
models:
  - name: recent_orders
    sql: |
      SELECT * FROM orders
      WHERE created_at >= '{{ date_add(today(), -30) }}'
      {% if env_var('INCLUDE_PENDING') == 'true' %}
        -- Include pending orders in dev
      {% else %}
        AND status = 'completed'
      {% endif %}
```
{% endraw %}

## Project Structure

### Basic Structure
```
my-dashboard/
├── project.visivo.yml      # Main configuration
├── .env                    # Environment variables
├── models/                 # SQL queries
│   ├── staging/           # Raw data preparation
│   └── marts/             # Business logic
├── includes/              # Reusable components
│   ├── colors.yml         # Color schemes
│   └── layouts.yml        # Layout templates
└── .visivo/               # Generated files (git-ignored)
```

### Main Configuration File

`project.visivo.yml` is the entry point:

```yaml
name: sales-analytics
version: 1.0.0

# Include other files
includes:
  - includes/colors.yml
  - includes/layouts.yml

# Set defaults
defaults:
  source_name: main_db
  trace_height: 400

# Define sources
sources:
  - name: main_db
    type: postgresql
    # ... connection details

# Define models, traces, charts, dashboards
models: [...]
traces: [...]
charts: [...]
dashboards: [...]
```

## Modular Configuration

### Using Includes

Break configuration into logical files:

`includes/colors.yml`:
```yaml
colors:
  brand:
    primary: "#1976d2"
    secondary: "#dc004e"
    success: "#4caf50"
    warning: "#ff9800"
    error: "#f44336"
  
  chart:
    revenue: ${colors.brand.primary}
    cost: ${colors.brand.error}
    profit: ${colors.brand.success}
```

`includes/layouts.yml`:
```yaml
layouts:
  default:
    font:
      family: "Inter, -apple-system, sans-serif"
      size: 12
    margin:
      l: 50
      r: 30
      t: 50
      b: 40
    
  minimal:
    margin:
      l: 20
      r: 20
      t: 30
      b: 20
```

Reference in main config:
```yaml
charts:
  - name: revenue_chart
    layout:
      ${layouts.default}  # Spread operator
      title:
        text: "Revenue Analysis"
        font:
          color: ${colors.brand.primary}
```

### Organizing Models

Structure models by purpose:

```
models/
├── staging/
│   ├── stg_orders.yml
│   ├── stg_customers.yml
│   └── stg_products.yml
├── intermediate/
│   ├── int_order_items.yml
│   └── int_customer_orders.yml
└── marts/
    ├── fct_sales.yml
    ├── dim_customers.yml
    └── dim_products.yml
```

## Advanced Patterns

### 1. Configuration Inheritance

Create base configurations and extend them:

```yaml
# Base trace configuration
_base_traces:
  line_trace: &line_base
    props:
      type: scatter
      mode: lines
      line:
        width: 2
      hovermode: "x"

# Extend base configuration
traces:
  - name: revenue_line
    <<: *line_base  # YAML anchor reference
    model: ${ref(daily_revenue)}
    props:
      <<: *line_base.props
      y: ?{revenue}
      line:
        color: ${colors.chart.revenue}
```

### 2. Dynamic Configuration

Generate configuration based on conditions:

{% raw %}
```yaml
# Different configs for different environments
models:
  - name: sales_summary
    sql: |
      SELECT *
      FROM {{ 'sales_dev' if env_var('ENVIRONMENT') == 'dev' else 'sales_prod' }}
      {% if env_var('ENVIRONMENT') == 'production' %}
      WHERE date >= CURRENT_DATE - 90
      {% endif %}
```
{% endraw %}

### 3. Loops and Iteration

Generate multiple similar components:

```yaml
# Generate traces for each region
traces:
{% for region in ['North', 'South', 'East', 'West'] %}
  - name: sales_{{ region.lower() }}
    model: ${ref(regional_sales)}
    filters:
      - region = '{{ region }}'
    props:
      type: scatter
      mode: lines
      name: "{{ region }} Region"
{% endfor %}
```

### 4. Conditional Components

Include components based on environment:

{% raw %}
```yaml
dashboards:
  - name: main_dashboard
    rows:
      # Always include
      - height: medium
        items:
          - chart: ${ref(revenue_chart)}
      
      # Only in dev environment
      {% if env_var('ENVIRONMENT') == 'dev' %}
      - height: small
        items:
          - markdown: |
              ### Debug Info
              - Environment: {{ env_var('ENVIRONMENT') }}
              - Database: {{ env_var('DB_NAME') }}
              - Last refresh: {{ datetime_now() }}
      {% endif %}
```
{% endraw %}

## Best Practices

### 1. Naming Conventions

Use consistent naming:
```yaml
# Models
stg_[source]_[entity]    # stg_stripe_payments
int_[entity]_[verb]      # int_orders_grouped
fct_[entity]             # fct_sales
dim_[entity]             # dim_customers

# Traces
[metric]_[visualization] # revenue_line, count_bar

# Charts
[domain]_[metric]        # sales_revenue, customer_count
```

### 2. Documentation

Document complex logic:
```yaml
models:
  - name: customer_cohorts
    description: |
      Monthly cohorts based on first purchase date.
      Includes only customers with 2+ purchases.
    sql: |
      -- Complex SQL with inline comments
      WITH first_purchase AS (
        -- Get each customer's first purchase date
        SELECT customer_id,
               MIN(DATE_TRUNC('month', purchase_date)) as cohort_month
        FROM orders
        GROUP BY customer_id
      )
      -- Rest of query...
```

### 3. Version Control

Structure commits meaningfully:
```bash
# Feature branches
git checkout -b feature/add-revenue-dashboard

# Meaningful commits
git add models/revenue_analysis.yml
git commit -m "Add revenue analysis model with YoY comparison"

# Pull request with review
```

### 4. Testing Configuration

Add tests to your configuration:
```yaml
models:
  - name: daily_revenue
    sql: SELECT date, SUM(amount) as revenue FROM orders GROUP BY date
    tests:
      - unique: date
      - not_null: [date, revenue]
      - custom: revenue >= 0

traces:
  - name: revenue_trace
    model: ${ref(daily_revenue)}
    tests:
      - row_count > 0
      - max('revenue') < 1000000  # Sanity check
```

## CI/CD Integration

### GitHub Actions Example

`.github/workflows/visivo.yml`:
{% raw %}
```yaml
name: Visivo Dashboard CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'
      
      - name: Install Visivo
        run: pip install visivo
      
      - name: Validate Configuration
        run: visivo compile
        
      - name: Run Tests
        run: visivo test
        env:
          DB_HOST: ${{ secrets.DB_HOST }}
          DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
          
  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to Production
        run: visivo deploy -s production
        env:
          VISIVO_API_KEY: ${{ secrets.VISIVO_API_KEY }}
```
{% endraw %}

## Configuration Reference

### Variable Functions

{% raw %}
```yaml
# Environment variables
${env_var('VAR_NAME')}
${env_var('VAR_NAME', 'default_value')}

# Date functions
${today()}
${date_add(today(), -7)}
${date_format(today(), '%Y-%m-%d')}

# References
${ref(model_name)}
${selector(selector_name)}

# Math functions
${max(10, 20)}
${min(5, 3)}
${round(3.14159, 2)}
```
{% endraw %}

### Selector Integration

{% raw %}
```yaml
selectors:
  - name: date_range
    type: daterange
    default:
      start: ${date_add(today(), -30)}
      end: ${today()}

models:
  - name: filtered_orders
    sql: |
      SELECT * FROM orders
      WHERE date BETWEEN '{{ selector(date_range.start) }}'
                    AND '{{ selector(date_range.end) }}'
```
{% endraw %}

## Migration Guide

### From Click-Based BI Tools

1. **Export existing dashboards** (if possible)
2. **Recreate in YAML** starting with:
   - Data sources
   - Core metrics/KPIs
   - Most-used visualizations
3. **Add version control**
4. **Set up CI/CD**
5. **Train team** on Git workflow

### Benefits After Migration

- ✅ Full audit trail of changes
- ✅ Rollback capabilities
- ✅ Parallel development
- ✅ Automated testing
- ✅ Infrastructure as code

---

_Next:_ [Testing Strategy](testing.md) | [How Visivo Works](architecture.md)