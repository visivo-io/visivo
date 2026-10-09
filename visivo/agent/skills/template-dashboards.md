---
name: template-dashboards
summary: Lay a dashboard out with HTML when rows and items cannot express it.
---

# Template dashboards

A dashboard is normally `rows` of `items`. When the layout needs something that
grid cannot express — a banner, prose between charts, a sidebar — write the
layout as HTML instead and mark where items go:

```yaml
dashboards:
  - name: Quarterly Review
    template: |
      <style>.kpi { height: 160px; } .wide { height: 420px; }</style>
      <section class="banner">
        <div class="kpi" data-visivo-item="revenue-kpi"></div>
      </section>
      <article>
        <p>Revenue held through the quarter.</p>
        <div class="wide" data-visivo-item="revenue-by-month"></div>
      </article>
```

A dashboard is a template one because it has `template` — there is no `type`
field to set. Use `rows` when the grid is enough; reach for this when it is not.

## Slots name existing displayable objects

`data-visivo-item="<name>"` is a slot, and the name is a reference to a chart,
table, markdown or input that already exists. Pointing one at a model or a
source fails, because neither renders.

Like every other `${ref()}` in Visivo, a slot naming something that does not
exist **passes `validate_dashboard` and fails when the project compiles**. So
build the items first and the template after, the same order as
`chart-from-an-insight`. If you do write the layout first, create the items
before running.

## The HTML is checked against an allowlist

No `<script>`, no `on*` handlers, no `<iframe>`, `<form>`, `<link>` or
`@import`. `validate_dashboard` reports each violation with its line number, so
validate before writing and read what it says rather than guessing at what was
rejected.

## Sizing comes from the template's CSS

Nothing sizes a slot except the stylesheet in the template. A slot with no
height falls back to 396px, which is the grid's `medium` row. If a chart looks
wrong, it is the CSS, not the chart.

## Renaming a placed item takes two edits

Renaming a chart that a template places is refused, because the rewrite cannot
reach a name inside HTML. Change it in the template and in the YAML together.
