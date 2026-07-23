# Model

A **Model** is a named query that turns a [Source](source.md) into the table your
[Insights](insight.md) read from. If a Source is *where* your data lives, a Model is
*which slice of it* you care about.

## Why it matters

Models are the seam between raw data and visualization. They let you:

- Name and reuse a query across many Insights, so the transformation lives in one place.
- Keep dashboard logic declarative — an Insight references `${ref(model_name)}` instead of
  embedding raw SQL.
- Query data that came from a script, API, or other non-SQL process, by loading it onto a
  Source with a [Seed](../reference/configuration/Sources/DuckdbSource/Seed/index.md).

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

## Seeds

When your data comes from a script, an API, or another non-SQL process, give the Source a
[Seed](../reference/configuration/Sources/DuckdbSource/Seed/index.md): a command whose CSV output is loaded
into a table before any Model queries it. Seed several datasets onto one Source and a single
Model can join across them in plain SQL.

## Learn more

- [How It Works](../how_it_works.md) — how a Model's query is compiled and run.
- [Including](../topics/including.md) — splitting models across files.
- Reference: [Models configuration](../reference/configuration/SqlModel/index.md).
