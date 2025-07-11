# Core Concepts

Understand the fundamental concepts and architecture that power Visivo. These guides explain how Visivo works under the hood and the philosophy behind its design.

## Conceptual Overview

<div class="grid cards" markdown>

-   :material-lightbulb: __[Visivo's Viewpoint](viewpoint.md)__

    ---

    The philosophy and principles that guide Visivo's design. Learn why we chose configuration-as-code and how it benefits your workflow.

    **Key topics:**
    - Why YAML configuration
    - Benefits of code-based dashboards
    - Design principles
    - Comparison with traditional BI tools

-   :material-cogs: __[How Visivo Works](architecture.md)__

    ---

    Deep dive into Visivo's architecture and execution model. Understand the compile → run → serve pipeline.

    **Key topics:**
    - Architecture overview
    - Execution phases
    - DAG-based processing
    - Component relationships

-   :material-database-arrow-right: __[Sources & Models](data-flow.md)__

    ---

    Learn how data flows through Visivo from sources to visualizations. Master the data transformation pipeline.

    **Key topics:**
    - Source connections
    - Model types (SQL, CSV Script, Local Merge)
    - Query generation
    - Data caching

-   :material-file-code: __[Configuration as Code](config-as-code.md)__

    ---

    Understand Visivo's configuration system and how to leverage it for maintainable, version-controlled dashboards.

    **Key topics:**
    - YAML structure
    - Reference system (`${ref()}`)
    - Environment variables
    - Modular configuration

-   :material-file-multiple: __[Including Files](including.md)__

    ---

    Learn how to organize and reuse configuration across multiple files.

    **Key topics:**
    - Include syntax
    - File organization
    - Reusable components
    - Best practices

</div>

## Key Concepts Quick Reference

### The Visivo Pipeline

```mermaid
graph LR
    A[YAML Config] --> B[Compile Phase]
    B --> C[DAG Generation]
    C --> D[Run Phase]
    D --> E[Data Files]
    E --> F[Serve Phase]
    F --> G[Interactive Dashboard]
```

### Core Components

| Component | Purpose | Configuration |
|-----------|---------|---------------|
| **Sources** | Database connections | `sources:` in YAML |
| **Models** | Data transformations | `models:` in YAML |
| **Traces** | Visual elements (lines, bars, etc.) | `traces:` in YAML |
| **Charts** | Collections of traces | `charts:` in YAML |
| **Dashboards** | Layouts with charts and content | `dashboards:` in YAML |

### Configuration Hierarchy

```
Project (project.visivo.yml)
├── Sources (database connections)
├── Models (data queries/transformations)
├── Traces (visualization definitions)
│   └── Props (Plotly.js properties)
├── Charts (trace collections)
│   └── Layout (titles, axes, etc.)
└── Dashboards (grid layouts)
    └── Rows → Items → Charts/Tables/Markdown
```

### Reference System

Visivo uses a reference system to link components:

```yaml
# Define a model
models:
  - name: sales_data
    sql: SELECT * FROM sales

# Reference it in a trace
traces:
  - name: sales_trend
    model: ${ref(sales_data)}  # Reference the model
    props:
      x: ?{date}
      y: ?{revenue}

# Reference trace in a chart
charts:
  - name: revenue_chart
    traces:
      - ${ref(sales_trend)}  # Reference the trace
```

### Query Selectors

The `?{}` syntax tells Visivo to include expressions in SQL queries:

```yaml
props:
  x: ?{date_trunc('month', created_at)}  # Becomes part of SELECT
  y: ?{sum(amount)}                      # Aggregation in SQL
  color: ?{category}                     # Grouping column
```

### Environment Management

Use Jinja2 templates for environment-specific configuration:

{% raw %}
```yaml
sources:
  - name: main_db
    type: postgresql
    host: {{ env_var('DB_HOST') }}
    password: {{ env_var('DB_PASSWORD') }}
```
{% endraw %}

## Understanding Execution

### 1. Compile Phase
- Parses YAML configuration files
- Validates structure and references
- Generates `project.json` and `explorer.json`
- Creates DAG of dependencies

### 2. Run Phase
- Executes models in dependency order
- Runs trace queries against sources
- Generates data files (`.js` format)
- Caches results for performance

### 3. Serve Phase
- Starts Flask development server
- Serves React frontend
- Provides API endpoints
- Enables hot reloading

## Best Practices

### Configuration Organization
- One source per logical database/environment
- Modular files using `include:`
- Clear naming conventions
- Comments for complex logic

### Performance Optimization
- Use models to pre-aggregate data
- Leverage source-specific features
- Implement appropriate indexes
- Cache expensive calculations

### Development Workflow
- Compile configuration to validate
- Run to generate data files
- Serve for local development
- Deploy to production

## Deep Dives

Ready to learn more? Explore these detailed guides:

1. [Architecture Deep Dive](architecture.md) - Complete technical overview
2. [Data Flow Patterns](data-flow.md) - Advanced data handling
3. [Configuration Mastery](config-as-code.md) - Expert-level YAML
4. [Data Sources Guide](sources.md) - Connecting to databases

## Common Questions

**Q: Why YAML instead of a GUI?**  
A: YAML enables version control, code review, CI/CD integration, and programmatic generation. See [Viewpoint](viewpoint.md).

**Q: How does Visivo handle large datasets?**  
A: Through SQL pushdown, aggregation at source, and smart caching. See [Architecture](architecture.md).

**Q: Can I extend Visivo?**  
A: Yes! Through custom models, scripts, and the plugin system. See [Data Flow](data-flow.md).

---

_Have conceptual questions?_ Join our [Community Slack](https://visivo-community.slack.com) for discussions!