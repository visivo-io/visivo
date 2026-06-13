# Concepts

Visivo is BI-as-code: you describe your dashboards in YAML, version them in git, and
render them with the CLI or in [Visivo Cloud](../cloud/index.md). Almost everything you build
is one of **six core objects**. Learn these and the rest of the documentation falls into place.

<div class="grid cards" markdown>

-   :material-database:{ .lg .middle } **Source**

    ---

    A connection to where your data lives — Postgres, Snowflake, BigQuery,
    DuckDB, a local file, and more.

    [:octicons-arrow-right-24: Source](source.md)

-   :material-table:{ .lg .middle } **Model**

    ---

    A named SQL query (or dbt™ model) that shapes a Source into the table an
    Insight reads from.

    [:octicons-arrow-right-24: Model](model.md)

-   :material-layers-triple:{ .lg .middle } **Semantic layer**

    ---

    Reusable **Metrics**, **Dimensions**, and **Relations** defined once and
    shared across every Insight.

    [:octicons-arrow-right-24: Semantic layer](semantic-layer.md)

-   :material-chart-line:{ .lg .middle } **Insight**

    ---

    The unit of visualization — it binds a Model's columns to plotly props and
    carries client-side interactions.

    [:octicons-arrow-right-24: Insight](insight.md)

-   :material-form-dropdown:{ .lg .middle } **Input**

    ---

    A dashboard control — dropdown, multi-select, range slider — whose value
    flows into your Insight queries.

    [:octicons-arrow-right-24: Input](input.md)

-   :material-view-dashboard:{ .lg .middle } **Dashboard**

    ---

    The page your team actually opens — a grid of rows and items that arrange
    your charts, tables, and inputs.

    [:octicons-arrow-right-24: Dashboard](dashboard.md)

</div>

## How they fit together

```text
Source  →  Model  →  Insight  →  Dashboard
   │         │          ▲            ▲
   │         │          │            │
   └─ Semantic layer ───┘        Input ┘
      (Metrics, Dimensions, Relations)
```

A **Source** connects to your data. A **Model** turns that Source into a query result.
An **Insight** reads a Model (optionally pulling reusable definitions from the
**Semantic layer**) and produces a chart. **Inputs** let viewers filter and slice
those charts. A **Dashboard** arranges the charts, tables, and inputs into a page.

!!! note "How many concepts are there, really?"
    These six objects are the mental model we use throughout the docs. You will
    occasionally see Charts and Tables called out separately — they are containers
    that arrange Insights on a Dashboard. The exact count is being reconciled across
    surfaces; for learning purposes, start with the six above.

## Where to go next

- New to Visivo? Start with [Get Started](../index.md) and run your first dashboard.
- Want field-by-field detail? Every concept page links down into the generated
  [Configuration reference](../reference/configuration/Dashboards/Dashboard/index.md).
- Curious how it all executes? Read [How It Works](../how_it_works.md).
