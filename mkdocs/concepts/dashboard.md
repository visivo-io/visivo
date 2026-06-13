# Dashboard

A **Dashboard** is the page your team actually opens. It arranges your charts, tables, and
[Inputs](input.md) into a grid of **rows**, each holding one or more **items**.

## Why it matters

Everything else in Visivo exists to feed a Dashboard. The Dashboard is the deliverable —
the thing you deploy to [Visivo Cloud](../cloud/index.md) and share with stakeholders via a
URL, or serve locally with `visivo serve`. Because it is defined in YAML and version
controlled, you can review layout changes in a pull request just like any other code.

## Minimal example

A Dashboard is a list of rows; each row has a `height` and a list of `items`. An item is a
chart, a table, an input, or markdown:

```yaml title="project.visivo.yml"
dashboards:
  - name: Sales
    rows:
      - height: compact
        items:
          - input: ${ref(region)}
      - height: medium
        items:
          - chart: ${ref(revenue_chart)}
          - chart: ${ref(orders_chart)}
```

## Anatomy

| Piece | What it is |
|-------|------------|
| **Row** | A horizontal band with a `height` (`compact`, `small`, `medium`, `large`, …). |
| **Item** | A single cell in a row — a `chart`, `table`, `input`, or `markdown`. |
| **Chart** | A container that renders one or more [Insights](insight.md). |
| **Table** | A tabular view of a Model. |

## Learn more

- [Get Started](../index.md) — build and serve your first Dashboard.
- [Deployment](../topics/deployments.md) and [Cloud](../cloud/index.md) — share Dashboards
  with your team.
- Reference:
  [Dashboard](../reference/configuration/Dashboards/Dashboard/index.md),
  [Row](../reference/configuration/Dashboards/Dashboard/Row/index.md),
  [Item](../reference/configuration/Dashboards/Dashboard/Row/Item/index.md),
  [Chart](../reference/configuration/Chart/index.md),
  [Table](../reference/configuration/Table/index.md).
