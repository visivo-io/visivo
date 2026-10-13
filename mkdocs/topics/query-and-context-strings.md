# Query & Context Strings

Two kinds of string appear all over a Visivo project, and they do different jobs:

| Form | Name | What it is |
| --- | --- | --- |
| `${ref(name).property}` | **Context string** | A reference to another object's value |
| `?{ ... }` | **Query string** | SQL that is evaluated *in the query* |
| `?{ ... }[0]` | **Slice** | An index into the *result* of that query |

A single insight prop usually combines them — a query string wrapping one or more context strings:

```yaml
props:
  type: bar
  y: ?{ sum(${ref(widget_sales).quantity}) }
```

Read that inside-out: `${ref(widget_sales).quantity}` points at a column of the
`widget_sales` model, and the surrounding `?{ ... }` is the SQL that aggregates it.

## Context strings — `${ref(name).property}`

A context string references another object. The `ref(name)` part names the object; everything after
it is a **property path** into that object's value.

```text
${ref(widget_sales).quantity}      # a column of a model
${ref(region).value}               # a single-select input's selected value
${ref(regions).values}             # a multi-select input's selected values
```

Property paths may include **indexes** and nested segments:

```text
${ref(my_insight).column[0]}       # first element of a property
${ref(my_insight).list[0].prop}    # nested path
${ref(my_insight)[0]}              # index the referenced value directly
```

## Query strings — `?{ ... }`

Everything between `?{` and `}` is SQL, compiled into the query Visivo runs against your source.
Aggregations, functions, `case` expressions and arithmetic all belong **inside** the braces:

```yaml
props:
  type: scatter
  x: ?{ date_trunc('week', ${ref(widget_sales).completed_at}) }
  y: ?{ sum(${ref(widget_sales).quantity}) }
  marker:
    color: ?{ case when sum(${ref(widget_sales).quantity}) > 200 then 'green' else 'blue' end }
```

To divide a value by 100, the division is SQL, so it goes inside:

```yaml
props:
  type: bar
  y: ?{ sum(${ref(widget_sales).quantity}) / 100 }
```

## Slices — `?{ ... }[0]`

A query string normally produces a **column of values**. A slice picks from that result *after* the
query runs. It goes **outside** the closing brace, and it must be the **last** thing in the value.

The common case is an [indicator](../reference/configuration/Chart/index.md), which needs a single
number rather than a column:

```yaml
props:
  type: indicator
  value: ?{${ref(indicator-data).value}}[0]
```

Supported forms:

| Slice | Result |
| --- | --- |
| *(omitted)* | The whole column |
| `[0]`, `[-1]` | A single element, as a scalar |
| `[1:5]`, `[:5]`, `[1:]` | A sub-range |
| `[0:9:2]` | A strided range |
| `[0,2,5]` | Specific indexes |

Only integers are valid inside the brackets — `[a]` and `[1.5]` are rejected.

## The two indexes are not the same thing

This is the easiest thing to get wrong, because both are written `[0]`:

```text
${ref(my_insight).column[0]}   # INSIDE  → index the referenced object's property
?{ sum(${ref(m).quantity}) }[0]  # OUTSIDE → index this query's result
```

The first is part of a reference and is resolved when the reference is looked up. The second is
applied to the rows the query returns. If you want a scalar out of a query you wrote, you want the
second one.

## What does not work

Nothing may follow the slice — the value ends there:

<!-- visivo-example: invalid - this is the counter-example: the slice must be the last thing in the value -->

```yaml
# Invalid: the slice must be last
props:
  type: indicator
  value: ?{ sum(${ref(m).quantity}) }[0] / 100
```

Put the arithmetic inside the braces instead, where the SQL is evaluated:

```yaml
# Valid
props:
  type: indicator
  value: ?{ sum(${ref(m).quantity}) / 100 }[0]
```

The order to remember is **aggregate → modify → slice**: aggregate and modify inside `?{ }`, then
slice the result outside it.

## Where each form is accepted

- **Insight `props` and `interactions`** accept context strings, query strings and slices.
- **Model, dimension, metric and relation expressions** accept context strings; a dimension or metric
  expression is SQL already, so it needs no `?{ }` wrapper.
- **`chart.layout`** does not evaluate query strings today — a chart has no query of its own, so
  there is no result for a slice to index.
