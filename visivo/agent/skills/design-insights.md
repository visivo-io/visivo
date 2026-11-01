---
name: design-insights
summary: Decide what is worth showing before how; propose the semantic layer, then a varied set of insights.
tools: [score_candidates]
---

# Design insights

"Build something interesting" is a choice of *what* to show. Five bar charts
of the same metric is the failure this prevents.

1. Write the model, then call `score_candidates` with `models: [<model>]`.
   It profiles the model itself, so do not copy cards into the call. It answers with
   the GROUP BY queries worth running (`stats_wanted`, each `expression` and
   `by_expression` already in the source's SQL); run them with
   `query_source` and call again with `stats` (`groups: [{model, by, metric,
   grain?, rows}]`, `by` two columns for a cross-tab; `correlations:
   [{model, columns: [a, b], r, method}]`, or `pairs` where it asks for them).
2. Write `semantic_layer` before any insight: its metrics and dimensions go
   under their model (`write_model`), relations with `write_relation`.
   Insights then read `${ref(model).name}`, so a number means one thing on
   every chart and in the Explorer.
3. Pass each candidate's `request` to `recommend_charts`, its
   `input_candidates` to `recommend_inputs`, the set to `recommend_layout`,
   and `preview_insight` before each `write_insight`. Tell the user each
   `why`; put the `detail_table` last.

<!-- rules:start -->
| column | metrics | why |
|---|---|---|
| identifier | `count_distinct` | an id is counted, never summed or averaged |
| numeric_continuous, numeric_discrete (additive) | `sum`; `avg`; `median` for `avg` on a heavy tail | the total is the business number; the average is the sanity check |
| numeric_continuous, numeric_discrete (not additive, or unknown) | `avg`; `median` for `avg` on a heavy tail | a sum of rates, prices or scores is meaningless |
| boolean | `rate` | a boolean is a rate |
| time | `avg` of the time between two of them | time is the axis; two time columns give an elapsed-time metric |
| categorical, text, geo_region, geo_point | — | a label is grouped by or counted, never aggregated |

Every model also gets `count(*)`. A heavy tail is skew above 1 or p99 above 5× the median. The lead total (cross-tabs, maps, the first queries) has the strongest measured signal; before stats it is the first whose column names money or volume (amount, revenue, sales, fare, total, price, cost, quantity, units); with no total, the row count.
- **Pairing:** time with ≤1 categorical; two categoricals up to 480 cells chart, up to 10000 pivot when the smaller has at most 11 values, past that the larger becomes an input; an identifier is never a dimension, only the detail table's key.
- **Split vs input:** up to 7 values, split; 8–20, `top_n_other` when the top 5 hold ≥80 % of rows, else an input; above 20, an input or the table. Time never splits.
- **Reductions** (each is a proposed dimension, written once):
  - `top_n_other` (top 5, at most 7, + Other): a categorical at the input threshold whose top values hold most rows, kept as a split;
  - `bucket` (10 bins): a continuous column used as a dimension;
  - `regrain` (12–600 points): a time axis with too many points at its natural grain;
  - `collapse_rare` (under 2 % → Other): a part-of-whole chart (pie, funnel, flow), so every slice or node keeps a visible mark;
  - `clip_p99`: a distribution with a heavy tail.
- **Signals:** variance (CoV); trend, the better of a line (|slope| × R²) and a level change (a V, U or step: moving-average strength × swing, full at 20 % of the mean); concentration (Gini, top-3 share); correlation (|r| on values clipped at p99, or Spearman on pairs; a scatter from 0.5, a comparison across bands from 0.3, ×0.2 from 0.95 as one column is likely computed from the other); cross-tabs (Cramér's V, ×0 when one column predicts the other, λ ≥ 0.8); seasonality (lag 24 at hour, lag 7 at day, lag 12 at month); anomalies (|z| > 3). Nulls over 30 % ×0.5; a constant metric ×0.
- **Portfolio:** ≤7 with the detail table, each scoring at least 0.2: ≤1 kpi (kpi), ≤1 trend (trend), ≤2 breakdown (compare/rank/composition/geo), ≤1 spread (distribution/relationship); the KPI set holds 2–4 metrics. A family already chosen scores ×0.6, a dimension already used ×0.7.
<!-- rules:end -->
