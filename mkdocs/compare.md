# Compare

How does Visivo differ from the BI tools you already know? In short: Visivo treats business
intelligence like software. Your dashboards are code, version controlled, testable, and
deployed through CI/CD — not click-built in a GUI that lives outside your stack.

## Visivo vs. traditional BI

| | Traditional BI (Tableau, Looker, Power BI, Metabase, …) | Visivo |
|---|---|---|
| **Definition** | Built in a GUI; configuration is hard or impossible to version | YAML, version controlled in git |
| **Review** | No diff, no pull request | Reviewed like any code change |
| **Testing** | None — breaking changes surface in production | [Tests](topics/testing.md) gate deploys in CI |
| **Environments** | Usually one shared instance | Named [stages](cloud/deploy-and-stages.md) for dev / CI / production |
| **Data access** | You hand the vendor credentials to *pull* your data | **You push** data with `visivo run` / `visivo deploy` |
| **Lives** | Outside your transformation stack | Right alongside your dbt™ / Django / Rails project |

## Why BI belongs in version control

When dashboards are not version controlled, it's unclear which charts depend on which
models, breaking changes go undetected until someone stumbles across them, and there is no
clean way to promote a change through environments. Visivo solves this by sitting in your
stack and building visualizations on top of your data as **testable, reviewable code** — no
more complicated to use than a GUI tool. The full argument is in our
[Viewpoint](viewpoint.md).

## Detailed comparisons

For side-by-side breakdowns against specific vendors, see the comparison pages on the
Visivo marketing site:

- [All comparisons](https://www.visivo.io/comparison-list)

## Learn more

- [Viewpoint](viewpoint.md) — the opinions behind Visivo.
- [Use Cases](use_cases.md) — Visivo for engineers and for analysts.
- [Get Started](index.md) — try it in 90 seconds.
