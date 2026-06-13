# Inputs

Visivo has exactly two [Input](../concepts/input.md) types, **single-select** and **multi-select**, and a viewer picks values from them to filter and slice a dashboard without editing code. Their selected values flow into [Insight](../concepts/insight.md) interactions through `${ref(input_name).value}` (and related accessors), applied client-side with no round-trip to your source database.

!!! visivo "Two types, several display modes"
    `single-select` and `multi-select` are the only two Input types. Each renders through one
    of several UI components (dropdown, radio, checkboxes, range-slider, and more), and
    `multi-select` can be backed either by a list of options or by a numeric/date **range**.
    Options can be a static list or a query against one Model.

## The two types

| :visivo-input:{ .vz-input } Type | Selects | Options source | Accessors |
|------|---------|----------------|-----------|
| `single-select` | One value | Static list **or** query | `.value` |
| `multi-select` | Many values, **or** a range | Static list / query, **or** a `range` block | `.values`, `.min`, `.max`, `.first`, `.last` |

## Single-select

Pick one value from a set of options. Options are a static list **or** a query string that
references exactly one Model. The optional `display` block chooses the UI component and the
default selection; if omitted, it renders as a dropdown with the first option selected.

```yaml title="project.visivo.yml"
inputs:
  - name: region
    type: single-select
    options: ["North", "South", "East", "West"]
    display:
      type: dropdown
      default:
        value: North
```

**Display types:** `dropdown`, `radio`, `toggle`, `tabs`, `autocomplete`, `slider`. A
`toggle` display requires exactly two options.

### Query-backed options

Instead of a static list, drive options from your data with a `?{ ... }` query that
references one Model. Visivo runs it during the build so the dropdown is populated from live
values.

```yaml title="project.visivo.yml"
inputs:
  - name: category
    type: single-select
    options: ?{ SELECT DISTINCT category FROM ${ref(products)} }
```

## Multi-select

Pick several values, or define a numeric/date range. A `multi-select` uses **either**
`options` (list-based) **or** `range` (range-based); the two are mutually exclusive.

### List-based

```yaml title="project.visivo.yml"
inputs:
  - name: categories
    type: multi-select
    options: ["Electronics", "Clothing", "Food"]
    display:
      type: checkboxes
      default:
        values: all
```

`default.values` accepts a static list, a query, or the keywords `all` (the default) or
`none`. **Display types:** `dropdown`, `checkboxes`, `chips`, `tags`, `range-slider`,
`date-range`.

### Range-based

Use a `range` block (`start`, `end`, `step`, all required) for continuous or stepped values.
The stepped values are computed in the viewer at runtime. A range-based input uses
`default.start` / `default.end` and pairs naturally with the `range-slider` or `date-range`
display.

```yaml title="project.visivo.yml"
inputs:
  - name: price_range
    type: multi-select
    range:
      start: 0
      end: 1000
      step: 50
    display:
      type: range-slider
      default:
        start: 100
        end: 500
```

## Wiring inputs into Insights

Reference an Input's value from an Insight `filter`, `split`, or `sort` interaction. Use the
accessor that matches the Input type.

```yaml title="project.visivo.yml"
insights:
  - name: filtered_sales
    props:
      type: bar
      x: ?{ ${ref(sales).category} }
      y: ?{ sum(${ref(sales).amount}) }
    interactions:
      # single-select → .value
      - filter: ?{ ${ref(sales).region} = '${ref(region).value}' }
      # multi-select (list) → .values
      - filter: ?{ ${ref(sales).category} IN (${ref(categories).values}) }
      # multi-select (range) → .min / .max
      - filter: ?{ ${ref(sales).price} BETWEEN ${ref(price_range).min} AND ${ref(price_range).max} }
```

| Input | Accessor | Returns |
|-------|----------|---------|
| `single-select` | `.value` | The selected value |
| `multi-select` | `.values` | Array of selected values |
| `multi-select` | `.min` / `.max` | Min / max of the selected values |
| `multi-select` | `.first` / `.last` | First / last selected value |

Place the Input on a [Dashboard](../concepts/dashboard.md) like any other item:

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
```

## Learn more

- [Input concept](../concepts/input.md): the short overview.
- [Interactivity](interactivity.md): the full walkthrough with screenshots.
- Reference:
  [SingleSelectInput](../reference/configuration/Inputs/SingleSelectInput/index.md),
  [MultiSelectInput](../reference/configuration/Inputs/MultiSelectInput/index.md).
