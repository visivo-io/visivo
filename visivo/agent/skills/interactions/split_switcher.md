---
name: split_switcher
summary: Two or more categoricals of 2–7 values the reader would compare by in turn.
---

# Split Switcher

**When:** two or more categoricals of 2–7 values the reader would compare by in turn.

**Wiring:** `split: CASE WHEN '${ref(I).value}' = '<A>' THEN ${ref(M).A} ELSE ${ref(M).B} END`

**Verified against:** `test-projects/integration/insights.visivo.yml:89`

**Watch for:** every CASE branch must return the same type; cast to VARCHAR when mixing.
