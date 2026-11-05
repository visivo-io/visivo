---
name: join-models-safely
summary: Write a relation, and a chart that reads two models, without counting a row twice (fan-out).
tools: [write_relation]
---

# Join models safely

A relation is a plain SQL join. When one `accounts` row matches 18
`subscriptions_monthly` rows, the join repeats that `accounts` row 18 times.
A SUM, COUNT or AVG of an `accounts` column across the join is then too
high, and nothing fails. This is fan-out.

## Before you write the relation

1. Find the key of each model: the column that is unique per row. Check it
   with `query_source`: `select count(*), count(distinct account_id) from accounts`.
2. Join on that key. One side of the condition must be unique.
3. `write_relation` measures both sides and returns `cardinality`
   (`one_to_one`, `one_to_many` or `many_to_many`). If it is
   `many_to_many`, do not keep it: write a model with one row per key on
   one side, and relate to that model.

## When a chart reads both models

The "one" side is the side whose key is unique. The "many" side repeats it.

| Measure | Grouped or filtered by | Write |
|---|---|---|
| a many-side column (`sum(mrr)`) | a one-side column (`industry`) | a plain SUM is correct |
| one-side rows (accounts) | a many-side column (`plan`) | `count(distinct ${ref(accounts).account_id})`, never `count(...)` |
| a one-side SUM or AVG (`avg(company_size)`) | a many-side column | a model at one row per key first (aggregate the many side to the key, then join), never a SUM across the join |

- Put each metric on the model whose rows it counts. A count metric on the
  one side that may be read across a join uses COUNT(DISTINCT key).
- If one model holds all the columns a chart needs, do not join.
- A many side that is a snapshot per period (one row per account per
  month) is not additive over time. Filter it to one period before you sum
  a level such as MRR or seats.

## Check one number

After `preview_insight`, compare one total with the same number from the
base table alone (`query_source`, no join). If they differ, the join fans
out. A `write_insight` or `preview_insight` warning that names fan-out
means the number is wrong: fix it before you write the dashboard.
