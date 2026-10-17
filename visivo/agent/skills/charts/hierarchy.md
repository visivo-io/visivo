---
name: hierarchy
summary: Nested rectangles sized by an additive metric; the default for a shallow hierarchy.
family: hierarchy
---

# Hierarchy charts

Read this after `recommend_charts` names the family and before `write_insight`. Generated from the trace rules; do not edit by hand.

<!-- rules:start -->
**Traces**
- `treemap` (preferred): Nested rectangles sized by an additive metric; the default for a shallow hierarchy.
- `sunburst` (preferred): Concentric rings, one per level; beats a treemap when the shape of the hierarchy matters more than leaf areas.
- `icicle` (preferred): Hierarchy as aligned columns, one per level left to right; reads deep trees and long labels better than treemap.

**Use when**
- A shallow hierarchy (borough → zone, category → product) and one additive metric.
- Many leaves where a bar would overflow but the parent level still groups them.
- `semantics.hierarchy` or `intent: composition` with a parent dimension.
- A multi-level hierarchy with one additive metric where the question is how each parent splits; every level stays visible as its own ring.
- A moderate number of leaves, and the reader compares a parent's composition, not leaf against leaf across branches (treemap's job).
- `semantics.hierarchy` and the chart sits in a half-width slot: the circle fits a square tile where a treemap gets squashed.
- A deep hierarchy where the reader walks from root to leaf (borough → zone → company → payment): each level is its own column.
- Siblings must be compared by size: bars share a straight baseline per column, which reads better than treemap areas or sunburst angles.
- Long node labels (zone names, product titles) that need horizontal text.
- `semantics.hierarchy` with a full-width breakdown row available.

**Avoid when**
- A flat categorical with few values; a bar compares them, and a treemap of a handful of boxes adds nothing.
- A non-additive metric; averages do not sum up the tree, so the parent box would lie.
- Too many leaves or too many levels; labels vanish, so use `maxdepth` or an input to pick a branch.
- Negative values; there is no negative area, so use a waterfall or a bar.
- Leaves must be compared by size across branches: outer-ring arcs have more radius than inner ones, so angles mislead; use a treemap or a bar.
- A single level; that is a donut, so use pie or bar.
- Too many leaves or levels; outer arcs become slivers with no labels, so set `maxdepth` or use an icicle.
- Non-additive or negative metrics; same rule as treemap.
- A shallow tree with few leaves; a treemap uses the space better and is the family default.
- Too many leaves at full depth; the leaf column becomes hairlines, so set `maxdepth` and let the reader click in.
- Half-width or short slots: icicles need width for levels and height for leaves.

**Data shape:** 1 metric; 1–3 dimensions; 2–25 values on the main dimension (categorical, geo_region, boolean).

**Limits:** 1 series ideal, 1 at most; over the limit, repair with `top_n_other`, `input_filter`.

**Gotchas**
- Every parent must also be a node row (with its own parent, or '' for a root). A parent that never appears as a node is an implied root, and more than one implied root draws nothing at all.
- With `branchvalues: total` a parent smaller than the sum of its children makes the whole trace fail to draw, and a larger one leaves an empty gap; with `remainder` (default) parents add their own value on top.
- `values` is a reserved SQL word; alias the column (or quote it as `?{ "values" }`).
- Build the hierarchy rows with a UNION ALL (one SELECT per level), not a join; the trace wants id/label/parent/value rows.
- `marker.colors` on the insight is the one color prop here that *should* be set, and only to a data column.
- Treemap's row rules apply verbatim: UNION ALL one SELECT per level, every parent present as a node row, and `branchvalues: total` for pre-summed rows (without it every parent ring is inflated by its children).
- A child label that repeats under several parents (Cash under every borough) needs `ids` (path-style `borough/payment`) and `parents` pointing at those ids; with labels alone the nodes collide.
- `sort` defaults to true and reorders sectors largest-first; set `sort: false` only when the SQL order (an ordered categorical) means something.
- `marker.colorscale` does nothing unless `marker.colors` is numeric; a list of hex codes per row opts out of the theme colorway.
- A `split` draws one sunburst per value on top of each other; a hierarchy is one insight, one trace.
- Same row contract as treemap: UNION ALL per level, parents present as nodes, `branchvalues: total` when values are pre-summed.
- With `total`, a parent smaller than the sum of its children makes the whole trace fail to draw; a parent larger leaves an unlabelled gap. Compute parents from children in SQL.
- Repeated child labels across parents need `ids` and id-valued `parents`, or the nodes collide.
- `marker.colorscale` alone has no effect; it needs numeric `marker.colors`.
- `textinfo: percent parent` is the useful label here; `percent root` on a deep leaf rounds to 0%.

**Variations**
- When a second metric that is a rate: `marker.colors: ?{ avg(tip_pct) }` with `marker.colorscale`; size says how much, color says how good.
- When the tree is deeper than the tile can label: `maxdepth: 2` with click-to-zoom instead of showing every level.
- When a single root total should frame the chart: one root row with an empty parent and `branchvalues: total`.

**Other uses**
- Performance map (a market map), size by weight and color by signed change, e.g. revenue sized and colored by growth. `marker.colors: ?{ <change> }` with a diverging `marker.colorscale` (RdBu) and `marker.cmid: 0` so zero sits on the neutral color.

**Placement:** `large` height, 12 of 12 columns, as a `breakdown`; pair with `detail_table_below`, `kpi_strip_above`.
**Mobile:** Full width with one level fewer in `maxdepth`; labels on small tiles disappear first.

**Example** (`treemap`)

```yaml
models:
  - name: revenue_nodes
    sql: >-
      select borough as id, borough as label, '' as parent, sum(revenue) as revenue from zone_revenue group by all
      union all select borough || '/' || zone, zone, borough, sum(revenue) from zone_revenue group by all
insights:
  - name: revenue-by-borough-and-zone
    props:
      type: treemap
      ids: ?{ ${ref(revenue_nodes).id} }
      labels: ?{ ${ref(revenue_nodes).label} }
      parents: ?{ ${ref(revenue_nodes).parent} }
      values: ?{ sum(${ref(revenue_nodes).revenue}) }
      branchvalues: total
      maxdepth: 2
```
<!-- rules:end -->
