# Running in the Cloud

When you deploy or commit a project, Visivo Cloud **runs it for you** — it
executes your models against your sources, builds the insight and input data,
and publishes the result. This page covers how that run works, what software the
run environment ships, and the isolation model around it, so you know what your
project code can rely on.

## From commit to live

A cloud run is the same `visivo run` you know locally, executed on Visivo's
infrastructure:

1. **You commit** — from the cloud editor, or by pushing with
   [`visivo deploy`](deploy-and-stages.md).
2. **Visivo assembles your project** from its stored resources and starts a run.
3. **The runner executes it** — models query your sources, seeds run their
   commands, and the insight/input data is built.
4. **Artifacts are published** — the new version goes
   [live at its URL](hosting-and-sharing.md) with fresh data and thumbnails.

Full runs happen on **commit**. While you're editing, cheap schema and
reference validation runs continuously, so you get feedback without waiting on a
warehouse.

## The run environment

The runner is the execution environment for **your code**: a
[seed](../topics/sources.md)'s command runs arbitrary shell/Python, and a model's
SQL runs arbitrary queries. Like a CI runner, it carries common tooling — but a
deliberately **curated subset**, not a full CI image. The image is spun up per
run, and a fat image would slow every run's start, so it stays slim.

| Software | Version |
| --- | --- |
| Python | 3.13 |
| Node.js + npm | 24.x |
| Visivo | matches the version serving your dashboards |
| Warehouse drivers | Snowflake, BigQuery, DuckDB, Redshift, ClickHouse, Postgres, MySQL (bundled with Visivo) |
| Shell tooling | `git`, `curl`, `wget`, `ca-certificates`, `build-essential` |

!!! note "Curated, not comprehensive"

    A hosted CI runner like GitHub's `ubuntu-latest` ships ~30&nbsp;GB of
    languages and tools. The Visivo runner installs only what a project run
    needs, so if your seed shells out to something exotic, install it in the seed
    command itself (e.g. `pip install`, `npm i`, or `apt` are not preinstalled
    beyond the list above). The
    [runner image](https://github.com/visivo-io/core/blob/main/runner/Dockerfile)
    is the source of truth for the exact manifest.

## Isolation and credentials

Because the runner executes your code, each run is **sandboxed and holds no
standing cloud credential** — there is nothing ambient for code to reach for.

**What your project code can rely on:**

- **Your account's source secrets.** Store them as
  [account secrets](../topics/environment-variables.md) and reference them as
  `${ env.NAME }` in your source config; Visivo injects them into the run's
  environment. This is also how a cloud source authenticates — a literal password
  in a source config is rejected in the cloud.
- **The tooling above**, and outbound access to the **internet and your
  warehouses**.

**What a run cannot do:**

- Reach **another account's data** — runs are isolated from one another, and the
  runner has no credential that spans accounts.
- Reach Visivo's **infrastructure** — no cluster metadata, no internal services;
  outbound is limited to the public internet and your warehouses.
- Persist anything between runs, or run without **bounded CPU, memory, and
  process limits**.

A run naturally has access to **its own** account's credentials — it needs them
to query your warehouses — so treat your seed and model code as trusted with your
own data, exactly as you would a local `visivo run`. What's protected is the
boundary between *accounts*, not between your code and your own sources.
