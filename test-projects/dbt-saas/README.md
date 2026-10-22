# dbt-saas

A dbt-duckdb project with no Visivo project in it. It tests how Visivo picks up a dbt project that a person brings.

- Staging views over the agent-eval `saas` tables, and two marts: `fct_mrr` and `dim_accounts`.
- The marts build into the `analytics` schema, not `main`.
- `models/marts/schema.yml` has column descriptions and Lightdash-style metrics in column `meta`.
- `dbt_project.yml` does not set `target-path`, as current dbt projects do not.

Build it:

1. Build `saas.duckdb` with `scripts/agent_eval/datasets/saas/` (see `scripts/agent_eval/README.md`) and copy it here.
2. Run `uvx --from dbt-duckdb dbt build --profiles-dir .`
