# Interactivity

Visivo's interactivity is built around [Inputs](/../reference/configuration/Inputs/SingleSelectInput/). An Input is a dashboard control — single-select dropdown, multi-select, range slider — whose value flows into your insight queries via the `${input_name.value}` placeholder.

## How it works

1. Define an Input at the top of your project (or inline in a dashboard item).
2. Reference the Input from an Insight's `props` or `interactions` using `${input_name.value}` (or `.values` for multi-select).
3. The viewer re-runs the insight's `post_query` against its parquet data each time the Input changes — no round-trip to the source database.

```yaml
inputs:
  - name: region
    type: single-select
    options: ["North", "South", "East", "West"]
    display:
      type: dropdown
      default: { value: North }

insights:
  - name: revenue-by-region
    props:
      type: bar
      x: ?{ category }
      y: ?{ sum(amount) }
    interactions:
      - filter: ?{ region = '${region.value}' }

dashboards:
  - name: Sales
    rows:
      - items:
          - input: ${ref(region)}
      - items:
          - chart:
              insights:
                - ${ref(revenue-by-region)}
```

## Reference

- [SingleSelectInput](/../reference/configuration/Inputs/SingleSelectInput/) — one-of-many picker
- [MultiSelectInput](/../reference/configuration/Inputs/MultiSelectInput/) — pick zero or more options, or use a numeric range slider
- [Insight interactions](/../reference/configuration/Insight/) — `filter`, `sort`, and `split` clauses that bind to inputs
