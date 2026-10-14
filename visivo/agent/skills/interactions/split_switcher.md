---
name: split_switcher
summary: Two or more `few` categoricals the reader would compare by in turn.
---

# Split Switcher

**When:** two or more `few` categoricals the reader would compare by in turn.

**Wiring:** `split: CASE WHEN '${ref(I).value}' = '<A>' THEN ${ref(M).A} ELSE ${ref(M).B} END`

**Verified against:** `test-projects/integration/insights.visivo.yml:89`

**Watch for:** every CASE branch must return the same type; cast to VARCHAR when mixing.
