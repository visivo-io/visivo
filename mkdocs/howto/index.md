# How-To Guides

Practical, task-focused guides that show you how to accomplish specific goals with Visivo. Each guide provides step-by-step instructions with real examples.

## Guide Categories

<div class="grid cards" markdown>

### :material-database: Data Sources

Connect and configure various databases and data sources.

-   **[Connect to PostgreSQL](postgres.md)**  
    Set up PostgreSQL connections with SSL, connection pooling, and best practices.

-   **[Connect to Snowflake](snowflake.md)**  
    Configure Snowflake warehouses, handle authentication, and optimize queries.

-   **[Working with dbt](dbt.md)**  
    Integrate Visivo with your dbt models and leverage transformations.

-   **[Multi-Source Queries](multi-source.md)**  
    Combine data from multiple databases in a single dashboard.

### :material-view-dashboard: Dashboards

Create and customize interactive dashboards.

-   **[Layout & Positioning](layout.md)**  
    Master grid layouts, responsive design, and component positioning.

-   **[Selectors & Filters](selectors.md)**  
    Add interactive filters, date ranges, and dynamic controls.

-   **[Annotations & Shapes](annotations.md)**  
    Enhance charts with annotations, reference lines, and shapes.

-   **[Adding Interactivity](interactivity.md)**  
    Create interactive dashboards with selectors, filters, and dynamic elements.

-   **[Custom Styling](styling.md)**  
    Apply custom colors, fonts, and themes to match your brand.

### :material-rocket-launch: Deployment

Deploy and manage Visivo in production.

-   **[Deploy to Visivo Cloud](cloud-deploy.md)**  
    Push dashboards to Visivo's hosted platform with CI/CD.

-   **[Self-Hosting Guide](self-host.md)**  
    Run Visivo on your own infrastructure with Docker or Kubernetes.

-   **[GitHub Actions Setup](github-actions.md)**  
    Automate testing and deployment with GitHub workflows.

-   **[Deployment Strategies](deployments.md)**  
    Best practices for deploying Visivo dashboards in various environments.

-   **[Environment Management](environments.md)**  
    Handle dev, staging, and production configurations.

### :material-chart-line: Advanced Visualizations

Create sophisticated and interactive visualizations.

-   **[Time Series Analysis](time-series-advanced.md)**  
    Advanced techniques for temporal data including rolling windows and seasonality.

-   **[Geographic Visualizations](geographic.md)**  
    Create choropleth maps, scatter maps, and custom map visualizations.

-   **[Statistical Charts](statistical.md)**  
    Build box plots, violin plots, and distribution analyses.

-   **[Custom Interactivity](interactivity-advanced.md)**  
    Implement cross-filtering, drill-downs, and custom actions.

### :material-cog: Configuration & Optimization

Fine-tune your Visivo setup for performance and maintainability.

-   **[Performance Optimization](performance.md)**  
    Speed up queries, reduce load times, and handle large datasets.

-   **[Security Best Practices](security.md)**  
    Secure credentials, implement access controls, and audit usage.

-   **[Linting & Validation](linting.md)**  
    Use Visivo's built-in linting to catch configuration errors early.

-   **[Debugging Tips](debugging.md)**  
    Troubleshoot common issues and understand error messages.

</div>

## Quick Reference

### Common Tasks

| Task | Guide | Time |
|------|-------|------|
| Connect a new database | [PostgreSQL](postgres.md) / [Snowflake](snowflake.md) | 10 min |
| Add filters to dashboard | [Selectors & Filters](selectors.md) | 15 min |
| Deploy to production | [Cloud Deploy](cloud-deploy.md) | 20 min |
| Create responsive layout | [Layout & Positioning](layout.md) | 15 min |
| Set up CI/CD | [GitHub Actions](github-actions.md) | 30 min |
| Add annotations | [Annotations](annotations.md) | 10 min |
| Optimize slow queries | [Performance](performance.md) | 20 min |
| Integrate with dbt | [Working with dbt](dbt.md) | 25 min |

### Prerequisite Knowledge

Most how-to guides assume you have:
- ✅ Visivo installed (`pip install visivo`)
- ✅ A basic project created (`visivo init`)
- ✅ Familiarity with YAML syntax
- ✅ Access to at least one data source

If you're new to Visivo, start with our [Quick Start guides](../quickstart/installation.md).

## Not Finding What You Need?

- 📚 Check our [Tutorials](../tutorials/index.md) for end-to-end examples
- 🍳 Browse the [Cookbook](../cookbook/index.md) for complete solutions
- 💬 Ask in our [Community Slack](https://visivo-community.slack.com)
- 📧 Contact support at [support@visivo.io](mailto:support@visivo.io)

---

_Have a suggestion for a new guide?_ [Open an issue](https://github.com/visivo-io/visivo/issues) on GitHub!