# Insight

An **Insight** is the unit of visualization in Visivo. It binds the columns of a
[Model](model.md) to plotly props and carries the client-side **interactions** (filter,
sort, split) that make a chart explorable. One Insight can be reused across as many charts
and dashboards as you like — Visivo computes its underlying data exactly once.

## Why it matters

The Insight is what makes Visivo's interactivity fast. Visivo runs the Insight's query once
and writes the result; in the browser, interactions like filtering and splitting are
applied to that data client-side — no round-trip to your database on every click.

Insights are the foundation of Interactivity 2.0 and the
[semantic layer](semantic-layer.md).

## Minimal example

An Insight uses `?{ ... }` slot expressions and `${ref(model).column}` field references to
map a Model's columns onto plotly props:

```yaml title="project.visivo.yml"
insights:
  - name: weekly_widget_sales
    props:
      type: scatter
      mode: lines
      x: ?{ date_trunc('week', ${ref(widget_sales).completed_at}) }
      y: ?{ sum(${ref(widget_sales).quantity}) }
    interactions:
      - split: ?{ ${ref(widget_sales).widget} }
```

A [Chart](../reference/configuration/Chart/index.md) then renders one or more Insights:

```yaml
charts:
  - name: simple_chart
    insights:
      - ${ref(weekly_widget_sales)}
    layout:
      title:
        text: Widget Sales by Week
```

## Interactions

Each Insight can declare `filter`, `sort`, and `split` interactions. Combined with
[Inputs](input.md), these let viewers slice and re-shape a chart without reloading the page.

## Learn more

- [How It Works](../how_it_works.md) — the compile → run → render lifecycle of an Insight.
- [Interactivity](../topics/interactivity.md) — wiring Inputs into Insight interactions.
- Reference:
  [Insight](../reference/configuration/Insight/index.md),
  [InsightInteraction](../reference/configuration/Insight/InsightInteraction/index.md).
