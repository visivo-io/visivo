# Semantic layer

The **semantic layer** is where you define your business logic once and reuse it
everywhere. It has three object types — **Metrics**, **Dimensions**, and **Relations** —
that live on your [Models](model.md) (or at the project level) and feed your
[Insights](insight.md).

## Why it matters

Without a semantic layer, the same calculation — "revenue is `SUM(amount)`", "active means
`status = 'active'`" — gets re-written in every chart, and the definitions drift apart.
The semantic layer centralizes that logic so every Insight computes it the same way, and a
single edit updates every dashboard that uses it. It is also what lets Visivo
auto-generate the correct SQL `JOIN`s when an Insight pulls fields from more than one Model.

## The three objects

### Metric — a reusable aggregate

A **Metric** is an aggregate calculation (a `SUM`, `COUNT`, ratio, and so on) you name once
and reference across charts.

```yaml title="project.visivo.yml"
models:
  - name: orders
    sql: select * from orders_table
    metrics:
      - name: total_revenue
        expression: "SUM(amount)"
        description: "Total revenue from all orders"
```

### Dimension — a reusable row-level field

A **Dimension** is a per-row computed field you group or filter by.

```yaml
models:
  - name: orders
    sql: select * from orders_table
    dimensions:
      - name: order_month
        expression: "DATE_TRUNC('month', order_date)"
        description: "Month when the order was placed"
```

### Relation — how two Models join

A **Relation** declares the join condition between two Models, so a Metric can combine
data across them and Visivo can generate the `JOIN` automatically.

```yaml
relations:
  - name: orders_to_users
    join_type: inner
    condition: "${ref(orders).user_id} = ${ref(users).id}"
    is_default: true
```

## Learn more

- [Insight](insight.md) — how Insights consume Metrics and Dimensions.
- Reference:
  [Metric](../reference/configuration/Metric/index.md),
  [Dimension](../reference/configuration/Dimension/index.md),
  [Relation](../reference/configuration/Relation/index.md).
