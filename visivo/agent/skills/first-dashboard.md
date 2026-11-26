---
name: first-dashboard
summary: Read first when asked for a dashboard from a just-uploaded file, a just-connected database or an example project.
---

# Build a first dashboard

The person just opened an example, imported a file or connected a database.
They want one working dashboard. A small dashboard that builds is better than
a big one that fails.

1. `list_sources`, `list_models` and `list_dashboards`. Find the route below.
2. Follow that route.
3. Build two to five visuals: a KPI row, then the charts that answer the
   question. Use `chart-from-an-insight` and `design-a-dashboard`.
4. `check_runs`. Fix every failure before you reply.
5. Reply in three lines or fewer: what you built, the source table and what
   you filtered out. Say that the dashboard is a draft to review.

## Route 1: Example

The project already has sources, models and a dashboard.

- Use the models that exist. Do not write a second model of the same table.
- Do not change the example's source or its committed dashboard.
- Add a new dashboard with the name the person gives, or a short new name.
- The example tables are small. Model them without a filter.

## Route 2: Imported file

The import made one source and one table from the file. Use that source
as it is.

**The imported file keeps its stable reference:**

- Do not change the source. Do not call `write_source` for it.
- Do not write a second source for the same file, or a `csv` source that
  reads the original.
- Do not rename, move or copy the file, or type its path into model SQL.
- Give each model `source: ${ref(<source>)}` and `select` from the
  imported table by its name.

Imported files are messy. Before you write a model, read the table with
`preview_table` and `profile_columns`. Then fix these in the model SQL:

- Column names with spaces, capitals or symbols. Quote the original name
  and give it a snake_case alias.
- Numbers or dates stored as text, for example `$1,204.50`, `1.204,50`,
  `03/04/2024` or `N/A`. Use `try_cast` after you remove the symbols.
  Check the result with `query_source`.
- Total, subtotal or blank rows mixed with the data. Filter them out.
- Wide tables with one column per month or year. Use `unpivot` to make
  one row per period.
- Header rows above the data, which give columns such as `column0`. Name
  each column from the rows you previewed.

## Route 3: New database

The database can have many tables, and the person did not say which.

- Read `describe_source` once. Pick at most three related tables that
  share keys and contain dates or amounts.
- Skip tables whose names show staging, backups, logs or system data.
- If the person names a table or a question, use it.

## Large sources

A build writes every row that a model returns, and the browser reads them.
So check the size before you write a model:

1. Count the rows with `query_source`: `select count(*) as row_count from <table>`.
2. A table with more than 1,000,000 rows needs an aggregated model. Group
   by the time grain and the categories the dashboard shows. Keep each
   model under 100,000 rows.
3. Do not run `select *` without a `limit` on a large table.
4. If `describe_source` reports more than 30 tables, do not profile each
   one. Pick from the table and column names.
5. Tell the person the grain you chose, for example "one row per day and
   payment type".
