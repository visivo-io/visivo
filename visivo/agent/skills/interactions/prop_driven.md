---
name: prop_driven
summary: A presentation choice (lines vs markers, orientation, line shape).
---

# Prop Driven

**When:** a presentation choice (lines vs markers, orientation, line shape).

**Wiring:** `mode: ${ref(I).value}`

**Verified against:** `test-projects/integration/insights.visivo.yml:156-160`

**Watch for:** insight props only; chart `layout` (barmode, yaxis.type) is never substituted, and the input name must be snake_case.

**Never on:** `layout.*`, `barmode`, `yaxis.type`.
