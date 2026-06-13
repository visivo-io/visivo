# Input

An **Input** is a dashboard control — a single-select dropdown, a multi-select, or a range
slider — whose value flows into your [Insight](insight.md) queries. Inputs are how viewers
filter and slice a dashboard without editing any code.

## Why it matters

Inputs turn a static chart into an explorable one. A viewer picks a region, a date range, or
a category, and the charts on the dashboard re-render against that selection — applied
client-side against the Insight's already-computed data, so there is no round-trip to your
source database.

## Minimal example

Define an Input, then reference its value from an Insight interaction with
`${ref(input_name).value}` (or `.values` for multi-select):

```yaml title="project.visivo.yml"
inputs:
  - name: region
    type: single-select
    options: ["North", "South", "East", "West"]
    display:
      type: dropdown
      default:
        value: North

insights:
  - name: revenue_by_region
    props:
      type: bar
      x: ?{ ${ref(sales_data).category} }
      y: ?{ ${ref(sales_data).amount} }
    interactions:
      - filter: ?{ ${ref(sales_data).region} = '${ref(region).value}' }
```

Place the Input on a [Dashboard](dashboard.md) like any other item:

```yaml
dashboards:
  - name: Sales
    rows:
      - height: compact
        items:
          - input: ${ref(region)}
      - height: medium
        items:
          - chart: ${ref(revenue_chart)}
```

## Input types

| Type | What it does |
|------|--------------|
| [SingleSelectInput](../reference/configuration/Inputs/SingleSelectInput/index.md) | Pick one of many options. |
| [MultiSelectInput](../reference/configuration/Inputs/MultiSelectInput/index.md) | Pick zero or more options, or use a numeric range slider. |

## Learn more

- [Interactivity](../topics/interactivity.md) — the full walkthrough with screenshots.
- [Insight](insight.md) — the `filter`, `sort`, and `split` interactions Inputs bind to.
- Reference: [Inputs configuration](../reference/configuration/Inputs/SingleSelectInput/index.md).
