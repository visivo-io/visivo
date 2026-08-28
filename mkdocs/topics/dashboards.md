# Build a Dashboard

A dashboard is the page your team opens — but it is the **last** object in a chain. Every
dashboard in Visivo is assembled from the same five pieces, connected with
[`${ref()}`](query-and-context-strings.md):

```
Source  →  Model  →  Insight  →  Chart  →  Dashboard
(where     (a SQL     (data +     (wraps      (rows of
data       query)     plotly      insights)   items)
lives)                props)
```

This guide walks the whole path once, then covers the layout system — rows, items,
widths, heights, and markdown — in depth.

There are two ways to author everything on this page:

- **YAML** — edit `project.visivo.yml` directly in your editor. Save, and
  `visivo serve` hot-reloads the browser.
- **The in-browser workspace** — run `visivo serve` and build visually: create sources
  with the wizard, explore models, and drag objects onto the dashboard canvas. The
  workspace writes the same YAML back to your project, so the two routes are always
  interchangeable.

## Step 1 — a Source

A [Source](../concepts/source.md) is where your data lives — a database or file:

```yaml
sources:
  - name: my_db
    type: sqlite
    database: /path/to/file.db
```

See [Source Types](source-types.md) for PostgreSQL, Snowflake, BigQuery, DuckDB, CSV,
and the rest.

## Step 2 — a Model

A [Model](../concepts/model.md) is a SQL query saved against a Source:

```yaml
models:
  - name: monthly_revenue
    source: ${ref(my_db)}
    sql: |
      SELECT date_trunc('month', order_date) AS month,
             SUM(amount) AS revenue
      FROM orders
      GROUP BY 1
```

## Step 3 — an Insight

An [Insight](../concepts/insight.md) binds a Model's columns to plotly props with
[query strings](query-and-context-strings.md):

```yaml
insights:
  - name: revenue_by_month
    props:
      type: bar
      x: ?{ ${ref(monthly_revenue).month} }
      y: ?{ ${ref(monthly_revenue).revenue} }
```

An insight knows what to draw and which data feeds it — but it does not know *where* it
belongs on a page. That is the next step's job.

## Step 4 — wrap it in a Chart

A [Chart](../reference/configuration/Chart/index.md) wraps one or more Insights and
carries the presentation-level layout (title, axes, legend):

```yaml
charts:
  - name: revenue_chart
    insights:
      - ${ref(revenue_by_month)}
    layout:
      title:
        text: Monthly Revenue
```

!!! warning "The Chart is the composition boundary"

    A dashboard item never takes a bare insight. Items place **charts** (or tables,
    markdown, and inputs) — so every insight must be wrapped in a chart before it can
    appear on a dashboard. `chart: ${ref(revenue_by_month)}` will not validate;
    `chart: ${ref(revenue_chart)}` will.

    In the in-browser workspace this happens for you: dropping an insight onto the
    canvas auto-wraps it in a new chart.

Why the extra layer? Two things an insight alone cannot do:

- **Combine** — a chart can render several insights on shared axes: a bar series plus a
  line on a second y-axis, or an indicator layered over a trend. See the
  [dual-axis example](../reference/configuration/Chart/index.md#dual-axis).
- **Reuse** — the same insight can appear in many charts, each with its own title,
  axis labels, and styling. The underlying query still runs once.

```yaml
charts:
  - name: revenue_dual_axis
    insights:
      - ${ref(revenue_by_month)}      # bar, left axis
      - ${ref(orders_by_month)}       # line, yaxis: 'y2'
    layout:
      title:
        text: Revenue vs Orders
      yaxis2:
        overlaying: 'y'
        side: right
```

## Step 5 — place it on a Dashboard

A [Dashboard](../concepts/dashboard.md) arranges charts into **rows** of **items**:

```yaml
dashboards:
  - name: my_dashboard
    rows:
      - height: medium
        items:
          - width: 1
            chart: ${ref(revenue_chart)}
```

That is the whole path. Here it is end to end, as one runnable project — the source
seeds its own data, so you can paste this into a `project.visivo.yml` and run
`visivo serve`:

```yaml
name: revenue-example

sources:
  - name: my_db
    type: duckdb
    database: target/example.duckdb
    seeds:
      - table_name: orders
        args:
          - echo
          - |-
            month,revenue
            2025-01-01,100
            2025-02-01,150
            2025-03-01,200

models:
  - name: monthly_revenue
    source: ${ref(my_db)}
    sql: SELECT month, SUM(revenue) AS revenue FROM orders GROUP BY 1

insights:
  - name: revenue_by_month
    props:
      type: bar
      x: ?{ ${ref(monthly_revenue).month} }
      y: ?{ sum(${ref(monthly_revenue).revenue}) }

charts:
  - name: revenue_chart
    insights:
      - ${ref(revenue_by_month)}
    layout:
      title:
        text: Monthly Revenue

dashboards:
  - name: my_dashboard
    rows:
      - height: medium
        items:
          - width: 1
            chart: ${ref(revenue_chart)}
```

## The layout system

A dashboard is a vertical stack of rows; each row is a horizontal band of items. Items
are placed left to right in the order they are listed.

### Items

An [Item](../reference/configuration/Dashboards/Dashboard/Row/Item/index.md) holds
exactly one of:

| Field | Places |
|-------|--------|
| `chart` | A chart (which wraps your insights) |
| `table` | A [table](../reference/configuration/Table/index.md), defined inline or by reference |
| `markdown` | Formatted text — see [Markdown items](#markdown-items) |
| `input` | An [input widget](inputs.md) that drives interactivity |
| `rows` | A nested stack of rows — see [Nested rows](#nested-rows) |

An item may also be empty (none of the five set) to reserve intentional whitespace in a
row, sized by its `width`.

### Relative widths

Each item has an integer `width` (default `1`). Widths are **relative, not absolute**:
within a row, each item gets `width ÷ (sum of all widths in the row)` of the horizontal
space. There is no fixed column count — the row's total is whatever its widths sum to.

```yaml
rows:
  - height: medium
    items:
      - width: 1              # 1/4 of the row
        markdown:
          content: "**Q1** commentary"
      - width: 1              # 1/4 of the row
        table:
          name: revenue_table
          data: ${ref(monthly_revenue)}
      - width: 2              # 2/4 = half the row
        chart: ${ref(revenue_chart)}
```

So `1 / 1 / 2` renders the same as `2 / 2 / 4` or `25 / 25 / 50` — only the ratios
matter, and only within that row. Rows do not need to agree with each other: one row can
split `1 / 1` while the next splits `5 / 3 / 4`.

### Row heights

Each row has a `height` — either a named token or a positive integer pixel value:

| Height | Pixels |
|--------|--------|
| `compact` | wraps to content |
| `xsmall` | 128 |
| `small` | 256 |
| `medium` | 396 *(default)* |
| `large` | 512 |
| `xlarge` | 768 |
| `xxlarge` | 1024 |
| `<int>` | that many pixels exactly |

`compact` is the natural fit for rows holding only markdown or inputs — the row shrinks
to its content instead of reserving chart-sized space:

```yaml
rows:
  - height: compact
    items:
      - input: ${ref(region_filter)}
  - height: 450
    items:
      - chart: ${ref(revenue_chart)}
```

### Markdown items

Markdown adds titles, commentary, and section breaks between your charts. Inline it
directly on an item:

```yaml
rows:
  - height: compact
    items:
      - markdown:
          content: |
            ## Revenue
            All figures in **USD**, updated nightly.
```

Or define a named markdown object once and reference it from any dashboard —
`align` controls horizontal alignment and `justify` controls vertical distribution:

```yaml
markdowns:
  - name: welcome_note
    content: |
      # Welcome to Visivo
      This is **formatted** text.
    align: center
    justify: start

dashboards:
  - name: my_dashboard
    rows:
      - height: compact
        items:
          - markdown: ${ref(welcome_note)}
```

Markdown content supports [CommonMark](https://commonmark.org/help/) and
[GitHub Flavored Markdown](https://github.github.com/gfm/), including raw HTML.

### Nested rows

An item can hold `rows` instead of a leaf object, turning it into a **row-container**:
the nested rows render as a vertical stack inside the slot the parent row reserved. Use
this for layouts like "one big chart beside a stack of three small ones":

```yaml
rows:
  - height: large
    items:
      - width: 2
        chart: ${ref(big_chart)}
      - width: 1
        rows:
          - height: small
            items: [{ chart: "${ref(small_a)}" }]
          - height: small
            items: [{ chart: "${ref(small_b)}" }]
          - height: small
            items: [{ chart: "${ref(small_c)}" }]
```

Inside a row-container, nested row heights act as *relative weights* within the parent
slot rather than absolute pixel heights.

## Iterating on a layout

Run `visivo serve` and keep it open while you work:

- **In YAML** — edit heights and widths, save, and the browser hot-reloads. Because the
  layout is plain YAML, layout changes show up in pull requests like any other code.
- **In the workspace** — drag items between rows, resize them on the canvas, and drop
  project objects (insights included — they auto-wrap in charts) straight onto the page.
  Saving from the workspace commits the same YAML back to your project files.

## Next steps

- [Interactivity](interactivity.md) — wire inputs to insight interactions so viewers can
  filter, sort, and split.
- [Testing](testing.md) — assert on your data before a dashboard ships.
- [Deployment](deployments.md) — share it via Visivo Cloud, or as a
  [static bundle](static-distribution.md) with `visivo dist`.
- Reference:
  [Dashboard](../reference/configuration/Dashboards/Dashboard/index.md) ·
  [Row](../reference/configuration/Dashboards/Dashboard/Row/index.md) ·
  [Item](../reference/configuration/Dashboards/Dashboard/Row/Item/index.md) ·
  [Chart](../reference/configuration/Chart/index.md) ·
  [Markdown](../reference/configuration/Markdown/index.md)
