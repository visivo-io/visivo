---
name: chart-from-an-insight
summary: Build a chart on top of an insight.
---

# Build a chart from an insight

An insight is the query; a chart is how it is drawn. Build them in that order —
a chart referencing an insight that does not exist yet fails the DAG.

1. `write_insight` first, referring to its model with `${ref(model_name)}`.
2. `get_schema('charts')` — most of a chart's surface is Plotly props, and the
   slice is large. Do not guess at prop names.
3. `write_chart`, referring to the insight with `${ref(insight_name)}`.

## Columns must exist

A chart's props name columns the insight produces. If the insight's SQL did not
alias them (see `build-a-model`), the names will not be what you expect. When
unsure, run and read the result rather than assuming.
