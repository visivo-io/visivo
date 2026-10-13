---
name: metrics-and-dimensions
summary: Where a metric or dimension belongs — nested or standalone.
---

# Metrics and dimensions

**Nested under a model** when the expression only makes sense for that model's
columns. This is the common case and keeps the definition next to the data it
reads.

**Standalone** when it is shared across models, or references more than one.

Both are addressed the same way from a chart or insight, so choosing wrong is
not fatal — but a nested definition moves with its model and a standalone one
does not, which matters when the model is renamed or removed.

Ask `get_schema('metrics')` / `get_schema('dimensions')` before authoring one:
the fields differ from a model's and the difference is easy to assume wrong.
