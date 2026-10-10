---
name: metric_switcher
summary: Two measures on the same grain and dimension.
---

# Metric Switcher

**When:** two measures on the same grain and dimension.

**Wiring:** `y: CASE WHEN '${ref(I).value}' = '<A>' THEN <aggA> ELSE <aggB> END`

**Verified against:** `test-projects/integration/insights.visivo.yml:87`

**Unverified end to end:** preview the insight with `input_values` before writing it.

**Watch for:** the axis title stays static because chart layout cannot read inputs; say the unit in the input label.
