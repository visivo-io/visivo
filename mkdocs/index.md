# Transform Your Data into Interactive Dashboards with Code

Build beautiful, interactive dashboards from your data warehouse using simple YAML configuration. **Visivo** is the open-source data visualization framework that brings software engineering best practices to dashboard creation.

<div class="grid cards" markdown>

-   :material-code-braces: __Configuration as Code__

    ---

    Define dashboards in YAML files. Version control, review, and deploy like any other code.

    [:octicons-arrow-right-24: Quick Start](quickstart/installation.md)

-   :material-database-multiple: __Multi-Source Support__

    ---

    Connect PostgreSQL, Snowflake, BigQuery, DuckDB, and more. Query and visualize from multiple sources in one dashboard.

    [:octicons-arrow-right-24: Data Sources](topics/sources.md)

-   :material-chart-line: __50+ Chart Types__

    ---

    From simple bar charts to complex 3D visualizations. Powered by Plotly.js with full customization.

    [:octicons-arrow-right-24: Chart Gallery](gallery/index.md)

-   :material-shield-check: __Production Ready__

    ---

    Deploy with confidence. Environment management, error handling, and monitoring built-in.

    [:octicons-arrow-right-24: Deployment Guide](howto/cloud-deploy.md)

</div>

## See Visivo in Action

Create your first dashboard in under 5 minutes:

```yaml
# project.visivo.yml
name: sales-dashboard

sources:
  - name: sales_db
    type: duckdb
    database: sales.duckdb

traces:
  - name: revenue_by_month
    model: ref(sales_data)
    props:
      type: bar
      x: ?{date_trunc('month', sale_date)}
      y: ?{sum(revenue)}

charts:
  - name: monthly_revenue
    traces: [ref(revenue_by_month)]
    layout:
      title: Monthly Revenue Trend

dashboards:
  - name: sales_overview
    rows:
      - items:
          - chart: ref(monthly_revenue)
```

Then run:
```bash
pip install visivo
visivo serve
```

Your dashboard is now live at `http://localhost:8000` 🚀

## Why Visivo?

### 🏗️ **Engineering-First Approach**
Unlike drag-and-drop BI tools, Visivo treats dashboards as code. This means:
- **Version Control**: Track changes, create branches, review PRs
- **CI/CD Integration**: Deploy dashboards alongside your data pipelines
- **Modularity**: Reuse traces, charts, and components across dashboards
- **Testing**: Validate data and visualizations automatically

### 🔌 **Works with Your Stack**
- **dbt Integration**: Visualize your dbt models directly
- **Multiple Databases**: Query different sources in the same dashboard
- **Environment Management**: Dev, staging, and production configurations
- **Cloud or Self-Hosted**: Deploy to Visivo Cloud or your own infrastructure

### 📊 **Powerful Visualizations**
- **Interactive Dashboards**: Filters, selectors, and drill-downs
- **Responsive Design**: Dashboards that work on any screen size
- **Custom Styling**: Full control over colors, fonts, and layouts
- **Annotations**: Add context with shapes, lines, and text

## Quick Links

<div class="grid cards" markdown>

-   :material-rocket-launch: __Getting Started__

    ---

    New to Visivo? Start here with our step-by-step guide.

    [:octicons-arrow-right-24: Installation Guide](quickstart/installation.md)

-   :material-school: __Tutorials__

    ---

    Learn by building real dashboards with our hands-on tutorials.

    [:octicons-arrow-right-24: Browse Tutorials](tutorials/index.md)

-   :material-book-open-variant: __How-To Guides__

    ---

    Practical guides for common tasks and integrations.

    [:octicons-arrow-right-24: How-To Guides](howto/index.md)

-   :material-chef-hat: __Cookbook__

    ---

    Production-ready dashboard recipes you can adapt.

    [:octicons-arrow-right-24: Dashboard Recipes](cookbook/index.md)

</div>

## Join the Community

- :material-github: [GitHub Repository](https://github.com/visivo-io/visivo)
- :material-slack: [Community Slack](https://join.slack.com/t/visivo-community/shared_invite/zt-1234567890)
- :material-email: [Contact Support](mailto:support@visivo.io)

---

_Ready to transform your data into insights?_ [**Get Started →**](quickstart/installation.md)