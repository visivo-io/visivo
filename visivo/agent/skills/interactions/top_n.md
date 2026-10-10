---
name: top_n
summary: A `many`/`high` categorical ranked by a measure.
---

# Top N

**When:** a `many`/`high` categorical ranked by a measure.

**Wiring:** `filter: ${ref(M).rank_col} <= ${ref(I).value}`

**Verified against:** `test-projects/integration/insights.visivo.yml:243`

**Watch for:** the rank must be a precomputed column in the model (dense_rank() over the measure); a global rank combined with a region filter is "global top-N within region", not "top-N in region".
