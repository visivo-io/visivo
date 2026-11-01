---
name: flow
summary: Flow of an additive quantity from one set of categories to another, as weighted links between nodes.
family: flow
---

# Flow charts

Read this after `recommend_charts` names the family and before `write_insight`. Generated from the trace rules; do not edit by hand.

<!-- rules:start -->
**Traces**
- `sankey` (preferred): Flow of an additive quantity from one set of categories to another, as weighted links between nodes.
- `parcats` (niche): Parallel sets; ribbons show how rows split across several categorical attributes in turn. Sankey without node indices.

**Use when**
- Two categoricals that are a from→to pair (pickup borough → dropoff borough, channel → plan, stage → outcome) and an additive metric for the link weight.
- `intent: flow` or `semantics.ordered_stages` with branching (a funnel that splits).
- A modest number of nodes per side and of links, after the small links are collapsed.
- Several categorical attributes of the same rows (borough → payment type → company) and the question is how the population splits across them.
- Each attribute has 2–7 values and a count or additive metric weights the ribbons.
- A sankey-like view where the axes are attributes, not stages of a flow, so building node/link indices would be artificial.

**Avoid when**
- The two categoricals are not a flow; borough × payment type is a heatmap, not a sankey.
- Too many links to follow; collapse the smallest into Other or filter with an input.
- A non-additive weight; an average cannot be split along links.
- Self-loops or cycles (A → A); Plotly draws them badly, so filter `source <> target`.
- A true from→to flow between nodes of one kind (pickup borough → dropoff borough); sankey models it, parcats repeats the categories per axis.
- An attribute with too many values; ribbons fray into slivers, so `collapse_rare` to Other first.
- Only two attributes and exact figures wanted; a heatmap or pivot table of the cross-tab reads better.
- Numeric axes; use parcoords, since parcats treats every distinct number as its own category.

**Data shape:** 1 metric; 2–3 dimensions; 2–15 values on the main dimension (categorical, geo_region, boolean).

**Limits:** 1 series ideal, 1 at most; over the limit, repair with `collapse_rare`, `input_filter`.

**Gotchas**
- `link.source`/`link.target` are **integer indices into `node.label`**, not names: build a node table with `row_number() - 1` and join the flows to it.
- `node.label` must be a column from the same model as the links, ordered exactly as the indices assume; a hard-coded list drifts from the data.
- Node labels on both sides must be distinct: 'Manhattan' as pickup and as dropoff need two nodes (prefix them) or every flow becomes a self-loop.
- A `split` draws one sankey per value on top of each other; ignore the shape card's split advice here.
- Plotly's default `node.pad` and `node.thickness` (20 px each) crowd a diagram with many nodes; drop both to 10–15 px.
- Weight goes in `counts`, not `line.color`: a value bound only to `line.color` colors the ribbons, but each row still counts once.
- Without `counts` and an aggregate the trace receives every raw row; bind `counts: ?{ count(*) }` so the query groups by the dimensions.
- Category order on each axis is first-seen; pass `dimensions[].categoryorder: category ascending` or sort in SQL so axes are stable across refreshes.
- `split` overlays one parcats per value on the same domain; put the attribute on an axis instead.
- `line.colorscale` applies only to numeric `line.color`; color-name strings ignore the scale and bypass the theme.

**Variations**
- When the flow has three stages: chain them: links for stage1→stage2 and stage2→stage3 in one model, with node indices shared.
- When a categorical of 2–7 values describes the links: `link.color` from a CASE (the legitimate color case).
- When many small links clutter the diagram: `collapse_rare` in SQL, folding the smallest links into Other.

**Other uses**
- Migration between two snapshots, e.g. customers by plan tier last quarter → this quarter, with churned as its own node. One node per tier per snapshot (prefix `node.label` with the period); `link.source` is the old tier's index, `link.target` the new one's, `link.value: ?{ count(*) }`.

**Placement:** `large` height, 12 of 12 columns, as a `hero`; pair with `detail_table_below`, `kpi_strip_above`.
**Mobile:** Full width and `large`; keep few nodes a side or the labels overlap.

**Example** (`sankey`)

```yaml
insights:
  - name: borough-flows
    props:
      type: sankey
      node:
        label: ?{ ${ref(flows).node_label} }
      link:
        source: ?{ ${ref(flows).source_idx} }
        target: ?{ ${ref(flows).target_idx} }
        value: ?{ ${ref(flows).rides} }
```
<!-- rules:end -->
