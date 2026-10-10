---
name: cascading_options
summary: Two hierarchical categoricals (country → city, borough → zone).
---

# Cascading Options

**When:** two hierarchical categoricals (country → city, borough → zone).

**Not supported today.** an options query may reference one model and runs before anything is selected

**Instead:** one autocomplete over parent || ' / ' || child, or two independent filters with a warning that impossible pairs empty the chart
