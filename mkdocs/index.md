# Getting Started

## 🚀 Data to Dashboard in 90 Seconds

Transform your data into interactive dashboards with a single command. No configuration files, no complex setup—just instant visualization.

<div class="grid cards" markdown>

-   :material-lightning-bolt:{ .lg .middle } **Quick Start with `visivo serve`**

    ---

    Install Visivo and see your first dashboard in under 90 seconds. No Python required!

    ```bash
    curl -fsSL https://visivo.sh | bash
    visivo serve
    ```

    [:octicons-arrow-right-24: Jump to Quick Start](#quick-start)

-   :material-package-variant:{ .lg .middle } **Alternative Installation Methods**

    ---

    Choose your preferred installation method: Python/pip, Docker, or Cloud deployment.

    **Best for:** Teams, production deployments, or Python environments

    [:octicons-arrow-right-24: See all options](#alternative-installation-methods)

</div>

---

## Quick Start

Get your first dashboard running in 90 seconds—no configuration needed!

### 1. Install Visivo

=== "macOS/Linux"

    ```bash
    curl -fsSL https://visivo.sh | bash
    ```

=== "Windows"

    ```powershell
    irm https://visivo.sh/install.ps1 | iex
    ```

=== "Python (pip)"

    ```bash
    pip install visivo
    ```

!!! success "What you get"
    - ✅ Single binary, no dependencies
    - ✅ Works on Mac, Linux, and Windows
    - ✅ Instant hot-reload development
    - ✅ Built-in SQLite for immediate use

### 2. Launch Your First Dashboard

```bash
visivo serve
```

That's it! Visivo will:

1. **Open a template wizard** in your browser at `http://localhost:8000`
2. **Let you choose** from pre-built templates (Sales, Analytics, Monitoring)
3. **Create your project** with sample data automatically
4. **Show your dashboard** immediately

!!! tip "What happens when you run `visivo serve`"
    If no `project.visivo.yml` exists, Visivo launches an interactive wizard that helps you:
    
    - Select a template that matches your use case
    - Configure your data source (or use the built-in SQLite)
    - Customize your dashboard layout
    - All through a friendly web interface—no YAML editing required!

### 3. Experience Live Development Mode

Once your dashboard is running, try the magic of hot-reload:

1. **Open** `project.visivo.yml` in your favorite editor
2. **Change** any value (try changing a chart title)
3. **Save** the file
4. **Watch** your dashboard update instantly—no refresh needed!

<figure markdown>
  ![Live reload demonstration](assets/interactivity-example.gif)
  <figcaption>Every save triggers an instant update. No rebuilds. No waiting.</figcaption>
</figure>

---

## Experience the Live Development Flow 🎯

Visivo's `serve` command isn't just for viewing—it's your complete development environment:

!!! example "The Development Cycle"

    === "Edit"
        Make changes to your YAML configuration
        ```yaml
        charts:
          - name: revenue_chart
            traces:
              - ${ref(revenue_trace)}
            layout:
              title: Monthly Revenue  # ← Change this
        ```

    === "Save"
        Save the file (Cmd+S / Ctrl+S)

    === "See"
        Dashboard updates instantly in your browser
        
        No compilation ✓  
        No build step ✓  
        No page refresh ✓

This instant feedback loop means you can:

- **Experiment freely** - Try different visualizations instantly
- **Iterate quickly** - See changes as you type
- **Debug visually** - Spot issues immediately
- **Learn faster** - Understand the impact of each configuration

---

## Choose Your Data Source

Visivo works with your data, wherever it lives:

=== "Quick Start (SQLite)"

    Perfect for getting started—zero configuration needed!
    
    ```yaml
    sources:
      - name: local-data
        type: sqlite
        database: visivo.db
    ```
    
    Visivo includes sample data to explore immediately.

=== "PostgreSQL"

    ```yaml
    sources:
      - name: postgres
        type: postgresql
        host: localhost
        port: 5432
        database: myapp
        username: ${env_var('POSTGRES_USER')}
        password: ${env_var('POSTGRES_PASSWORD')}
    ```

=== "Snowflake"

    ```yaml
    sources:
      - name: snowflake
        type: snowflake
        account: ${env_var('SNOWFLAKE_ACCOUNT')}
        warehouse: COMPUTE_WH
        database: ANALYTICS
        username: ${env_var('SNOWFLAKE_USER')}
        password: ${env_var('SNOWFLAKE_PASSWORD')}
    ```

=== "BigQuery"

    ```yaml
    sources:
      - name: bigquery
        type: bigquery
        project: my-project
        dataset: analytics
        credentials_path: ${env_var('GOOGLE_APPLICATION_CREDENTIALS')}
    ```

=== "CSV/Excel Files"

    ```yaml
    sources:
      - name: csv-data
        type: csv
        path: ./data/sales.csv
    ```

[:octicons-book-24: Full source documentation](topics/sources.md)

---

## What's Next?

Now that you have a running dashboard, explore what's possible:

<div class="grid cards" markdown>

-   :material-palette:{ .lg .middle } **Customize Your Dashboard**

    ---

    Learn how to modify layouts, colors, and styling
    
    [:octicons-arrow-right-24: Dashboard customization](reference/configuration/Dashboards/Dashboard/index.md)

-   :material-chart-line:{ .lg .middle } **Add Charts & Visualizations**

    ---

    Explore 40+ chart types with rich customization options
    
    [:octicons-arrow-right-24: Chart gallery](reference/configuration/Chart/index.md)

-   :material-database:{ .lg .middle } **Connect Your Data**

    ---

    Set up connections to your production databases
    
    [:octicons-arrow-right-24: Data sources](topics/sources.md)

-   :material-cloud-upload:{ .lg .middle } **Deploy & Share**

    ---

    Share your dashboards with your team
    
    [:octicons-arrow-right-24: Deployment guide](topics/deployments.md)

</div>

---

## Alternative Installation Methods

### Python Package (pip)

Best for Python developers and data scientists who want to integrate Visivo into existing workflows.

```bash
pip install visivo
```

!!! note "Requirements"
    - Python 3.10 or higher
    - Virtual environment recommended

[:octicons-book-24: Python setup guide](#manual-setup)

### Docker

Perfect for containerized deployments and CI/CD pipelines.

```bash
docker run -p 8000:8000 visivo/visivo serve
```

[:octicons-book-24: Docker documentation](topics/deployments.md)

### Visivo Cloud

Get a hosted instance with authentication, sharing, and automatic updates.

1. Sign up at [app.visivo.io](https://app.visivo.io)
2. Get your API key from your profile
3. Deploy with: `visivo deploy -s production`

[:octicons-book-24: Cloud deployment guide](topics/deployments.md)

---

## Manual Setup

For those who prefer complete control over their configuration:

<details markdown>
<summary>Click to expand manual setup instructions</summary>

### Create a `project.visivo.yml` file

The `project.visivo.yml` is your project's configuration file. Create it in your project root:

```yaml title="project.visivo.yml"
name: my-dashboard
defaults:
  source_name: main

sources:
  - name: main
    type: sqlite
    database: data.db

models:
  - name: sales_data
    sql: select * from sales

traces:
  - name: revenue_trace
    model: ${ref(sales_data)}
    props:
      type: scatter
      x: ?{date}
      y: ?{revenue}
      mode: lines+markers

charts:
  - name: revenue_chart
    traces:
      - ${ref(revenue_trace)}
    layout:
      title: Revenue Over Time

dashboards:
  - name: main
    rows:
      - height: medium
        items:
          - chart: ${ref(revenue_chart)}
```

### Run your project

```bash
visivo serve
```

Your dashboard will be available at `http://localhost:8000`.

</details>

---

## Getting Help

<div class="grid cards" markdown>

-   :material-book-open-variant:{ .lg .middle } **Documentation**

    ---

    Browse the complete reference documentation
    
    [:octicons-arrow-right-24: View docs](reference/cli.md)

-   :material-github:{ .lg .middle } **Examples**

    ---

    Explore real-world examples and templates
    
    [:octicons-arrow-right-24: GitHub examples](https://github.com/visivo/visivo/tree/main/examples)

-   :material-email:{ .lg .middle } **Contact Support**

    ---

    Questions? We're here to help!
    
    [:octicons-arrow-right-24: Email us](mailto:jared@visivo.io)

</div>

---

!!! quote "Why Visivo?"
    "Unlike other tools that require init, config, setup—Visivo just needs `serve`. From zero to dashboard in 90 seconds."

---

<div style="text-align: center; margin-top: 2rem;">
  <a href="https://github.com/visivo/visivo" class="md-button md-button--primary">
    :fontawesome-brands-github: Star us on GitHub
  </a>
  <a href="https://app.visivo.io" class="md-button">
    :material-cloud: Try Visivo Cloud
  </a>
</div>