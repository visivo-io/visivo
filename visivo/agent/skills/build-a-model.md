---
name: build-a-model
summary: Turn a table into a model an insight can use.
---

# Build a model from a table

1. `list_sources` to find the source, `describe_source` for its tables and
   columns, `get_schema('models')` if you have not written one this session.
2. Write SQL that selects from the table.
3. `infer_columns` to see the columns the SQL will produce, then
   `validate_model` before `write_model`.

## Alias every column in the SELECT

This is the mistake that costs the most time, because nothing rejects it.

```sql
-- WRONG: the second column is inferred as "col_1"
select customer_id, sum(amount) from orders group by 1

-- RIGHT
select customer_id as customer_id, sum(amount) as total_amount
from orders group by 1
```

An unaliased expression gets a positional name, so the model validates, the
run succeeds, and the column an insight refers to does not exist. The failure
surfaces far from its cause.

## The source is a ref, not a name

```yaml
source: ${ref(orders_warehouse)}
```
