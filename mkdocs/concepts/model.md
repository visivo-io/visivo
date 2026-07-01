# Model

A **Model** is a named query that turns a [Source](source.md) into the table your
[Insights](insight.md) read from. If a Source is *where* your data lives, a Model is
*which slice of it* you care about.

## Why it matters

Models are the seam between raw data and visualization. They let you:

- Name and reuse a query across many Insights, so the transformation lives in one place.
- Keep dashboard logic declarative — an Insight references `${ref(model_name)}` instead of
  embedding raw SQL.
- Bring data together from multiple Sources (via a
  [LocalMergeModel](../reference/configuration/Models/LocalMergeModel/index.md)) or from a
  script that emits CSV (via a
  [CsvScriptModel](../reference/configuration/Models/CsvScriptModel/index.md)).

If you already use **dbt™**, Visivo reads your dbt™ models directly — you do not have to
re-declare them.

## Minimal example

```yaml title="project.visivo.yml"
models:
  - name: orders
    source: ${ref(warehouse)}
    sql: select order_date, region, amount from public.orders
```

An [Insight](insight.md) then reads the Model's columns:

```yaml
insights:
  - name: revenue_by_region
    props:
      type: bar
      x: ?{ ${ref(orders).region} }
      y: ?{ sum(${ref(orders).amount}) }
```

## Model types

| Type | Use when |
|------|----------|
| [SqlModel](../reference/configuration/Models/SqlModel/index.md) | You want to write a SQL query against one Source. |
| [LocalMergeModel](../reference/configuration/Models/LocalMergeModel/index.md) | You want to join tables that live in **different** Sources. |
| [CsvScriptModel](../reference/configuration/Models/CsvScriptModel/index.md) | Your data comes from a script, API, or other non-SQL process. |

## Learn more

- [How It Works](../how_it_works.md) — how a Model's query is compiled and run.
- [Including](../topics/including.md) — splitting models across files.
- Reference: [Models configuration](../reference/configuration/Models/SqlModel/index.md).
