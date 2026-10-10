---
name: global_filter
summary: A column read by two or more insights on the same model.
---

# Global Filter

**When:** a column read by two or more insights on the same model.

**Wiring:** `the same filter expression on EVERY insight whose model carries the column`

**Verified against:** `test-projects/docs-interactivity/project.visivo.yml:30-52`

**Watch for:** a half-wired filter is the canonical failure; nothing propagates by itself.
