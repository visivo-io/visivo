---
name: threshold_highlight
summary: A numeric measure with a target, limit or SLA.
---

# Threshold Highlight

**When:** a numeric measure with a target, limit or SLA.

**Wiring:** `marker.color: CASE WHEN ${ref(M).C} >= ${ref(I).value} THEN '<accent>' ELSE '<muted>' END`

**Verified against:** `test-projects/integration/insights.visivo.yml:234-244`

**Watch for:** the one legitimate reason to set insight color; do not also filter on the threshold or the bars above it vanish.
