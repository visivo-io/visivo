# Use Cases

Visivo brings software-engineering practices — version control, testing, code review, and
CI/CD — to business intelligence. Two audiences get the most out of it.

## For Engineers: Visivo as a DevOps Unlock

If you already ship code, Visivo fits your existing workflow:

- **BI-as-code.** Dashboards are YAML in your repo, reviewed in pull requests like anything else.
- **Preview every change.** Deploy each PR to its own [stage](cloud/deploy-and-stages.md) so
  reviewers see the visual impact next to the diff.
- **Test your data.** Write [tests](topics/testing.md) that fail CI when a query breaks, so
  bad data never reaches a stakeholder's dashboard.
- **Lives in your stack.** Drop Visivo into your dbt™, Django, or Rails project and build
  visualizations directly on top of your models.

## For Analytics: Visivo as a BI Solution

If your job is answering questions with data, Visivo gives you durable, trustworthy dashboards:

- **One source of truth.** Define [metrics and dimensions](concepts/semantic-layer.md) once
  in the semantic layer; every chart computes them the same way.
- **Interactive exploration.** Add [Inputs](concepts/input.md) so stakeholders filter and
  slice without asking you for a new chart.
- **Connect your warehouse.** Read directly from PostgreSQL, Snowflake, BigQuery, Redshift,
  and more — see [Sources](topics/sources.md).
- **Share with the team.** Push to [Visivo Cloud](cloud/index.md) and send a link.

## Where to go next

- [Get Started](index.md) — run your first dashboard.
- [Concepts](concepts/index.md) — the six core objects.
- [Tutorials](how_tos.md) — step-by-step guides.
