# Static Distribution

`visivo dist` builds your project into a **self-contained static bundle** — a folder of
HTML, JavaScript, JSON, and data files that renders your dashboards with no Visivo
server behind it. You can host the folder anywhere static files can live: S3, GitHub
Pages, Netlify, Cloudflare Pages, an nginx directory, or an internal file share.
"Self-contained" means no server of yours has to run — not that the page never talks to
the network; see [what the bundle fetches](#external-requests).

```bash
visivo run    # execute the project's queries and materialize the data
visivo dist   # package the viewer + that data into ./dist
```

`visivo dist` packages the output of the **last `visivo run`** — always run first. It
does not execute a single query of its own; it copies what the run left in `target/`.
Options:

| Option | Does |
|--------|------|
| `--dist-dir` | Where to write the bundle (default `dist`) |
| `--deployment-root` | Path prefix when hosting under a sub-path, e.g. `--deployment-root /reports` for `example.com/reports` |

!!! danger "`visivo dist` reports success even when there is nothing to package"

    Run `visivo dist` before `visivo run` and the command prints an error **and then
    reports success anyway**:

    ```
    Creating distribution for project in folder...
    Error creating dist. Try running `visivo run` to ensure your project is up to date.
    Message: No run output found at '<project>/target/main'. Run `visivo run` before `visivo dist`., set STACKTRACE=true to see full error
    Created dist folder: <project>/dist
    ```

    It **exits `0`**. What it leaves behind is not a working bundle:

    - **First time** — `dist/` holds an empty `data/` directory and nothing else: no
      `index.html`, no viewer, no data.
    - **Any later time** — a bundle from an earlier run is left **completely
      untouched**, and the success line is printed over it. The command has no way to
      tell you that you just "rebuilt" a stale bundle.

    This bites hardest in [CI/CD](ci-cd.md), where a failed or skipped `visivo run`
    will not stop the `dist` step from claiming success and the deploy step from
    publishing yesterday's numbers. Until the command exits non-zero, gate it yourself:

    ```bash
    visivo run
    visivo dist
    test -s dist/index.html || { echo "dist bundle is empty — did visivo run succeed?"; exit 1; }
    ```

    (Known bug: the `dist` phase catches this error, logs it, and returns normally
    instead of failing the command.)

The result is a folder shaped like this:

```
dist/
├── index.html            # the viewer application
├── assets/               # viewer JS/CSS, including DuckDB-WASM
├── _redirects            # SPA fallback rule (Netlify-style)
└── data/
    ├── project.json          # project envelope
    ├── dashboards.json       # every dashboard, with its full layout config
    ├── dashboards/<name>.json
    ├── insights.json         # per-insight metadata + client-side query
    ├── inputs.json
    └── files/<name>.parquet  # the materialized query results
```

(Plus a few small bookkeeping files the viewer reads: `error.json`,
`project_history.json`, and an empty `traces.json` left over from 1.x.)

## What works

A static bundle is not a screenshot — it is the real viewer running on pre-computed
data:

- **Dashboards render fully.** Charts, tables, and markdown all work, laid out exactly
  as they do under `visivo serve`.
- **Interactivity works.** [Inputs](inputs.md) and insight
  [interactions](interactivity.md) — filter, sort, split — execute **in the browser**,
  in DuckDB-WASM, against the parquet files in the bundle. Changing a dropdown re-runs
  the insight's client-side query and never touches your database. It does not touch
  your host either, once the data files and the DuckDB parquet extension have loaded —
  and that extension comes from the public internet, not the bundle
  ([details](#external-requests)).
- **Any static host.** No runtime, no database driver, no environment variables. The
  `--deployment-root` flag rewrites every asset and data URL so the bundle works from a
  sub-path.
- **Deep links.** The bundle ships a `_redirects` file with the single-page-app
  fallback rule (`/* → /index.html 200`), so `example.com/my-dashboard` resolves
  directly on hosts that honor it (Netlify, Cloudflare Pages).

## What degrades

- **Data is frozen at `visivo run` time.** The bundle is a snapshot. Nothing in it ever
  queries your sources again — to refresh the numbers you re-run
  `visivo run && visivo dist` and re-upload the folder (typically on a schedule in
  [CI/CD](ci-cd.md)).
- **Interactivity is bounded by the shipped data.** Filters, sorts, and splits
  recompute over the parquet in the bundle; an input can never pull rows that the run
  didn't materialize.
- **Deep links depend on the host.** On hosts that don't read `_redirects`, configure
  the equivalent rewrite yourself (for nginx:
  `try_files $uri /index.html;`) — otherwise only the root URL loads and dashboard
  links 404 on refresh.
- **"Self-contained" is about servers, not about the network.** The bundle needs no
  server of yours, but the browser rendering it still reaches the public internet — for
  the DuckDB parquet extension on every dashboard, and for basemap assets on geo
  charts. See [what the bundle fetches](#external-requests) before planning an
  air-gapped deployment.

## What is impossible

- **Live queries.** There is no path from the bundle to your database at view time —
  by design. Viewers see the snapshot, nothing else.
- **Editing.** The in-browser workspace, the Explorer, and every authoring surface
  require the `visivo serve` server. A dist bundle is strictly view-only.
- **Alerts.** [Alerts](../reference/configuration/Alert/index.md) fire during
  `visivo run`, not from the bundle.
- **Access control.** The bundle has no login and no permissions — protecting it is
  entirely up to the host (see the warning below).
- **Cloud features.** Stages, deployment history, teams, and sharing controls belong to
  [`visivo deploy` and Visivo Cloud](deployments.md), not to static bundles.

## Your data ships in the bundle { #data-exposure }

!!! danger "A dist bundle contains the query results themselves"

    `visivo dist` ships the **results** of your queries as static files. Everything
    under `dist/data/files/` is a parquet file holding the full result set of a model,
    insight, or input query — every row, **including columns no chart displays**. The
    JSON manifests also carry your dashboard configurations and models' SQL text.

    **Anyone who can fetch the files can read the data.** There is no login in front of
    a static bundle, and "nobody knows the URL" is not protection. Before publishing
    one, either be comfortable treating every row of the underlying result sets as
    public to its audience, or put the files behind access control you provide —
    a VPN, reverse-proxy authentication, or your host's protected-site feature.

    What the bundle does **not** contain: credentials for sources defined at the top
    level of your project — the normal pattern. A model's `source: ${ref(my_db)}` ships
    as that unresolved string, and `${ env_var(...) }` templates ship unresolved too;
    connection details are only used while `visivo run` executes the queries. One
    caveat: a source defined **inline inside a model** is embedded in the bundle's JSON
    along with the model — so define sources at the top level and keep secrets in
    environment variables, and nothing sensitive ships.

    If you need authenticated hosting with the serving handled for you, that is what
    [Visivo Cloud](../cloud/index.md) is for.

Bundle size follows the same rule: the folder grows with the rows your run
materializes. Aggregating in your models — pushing `GROUP BY`s into the SQL instead of
shipping raw rows — keeps bundles small *and* limits what a bundle can expose.

## What the bundle fetches from the internet { #external-requests }

A dist bundle is self-contained in the sense that matters for hosting: no server, no
database driver, no runtime. It is **not** free of outbound requests. Load one with the
browser's network panel open and three things come from outside your origin:

| Fetched from | When | If it cannot be reached |
|--------------|------|-------------------------|
| `extensions.duckdb.org` — `<version>/wasm_eh/parquet.duckdb_extension.wasm` | **Every dashboard**, the first time DuckDB-WASM reads a parquet file | Charts draw their frame, axes, and title with **no data in them** |
| `cdn.plot.ly` — TopoJSON (e.g. `un/world_110m.json`) | Dashboards with `scattergeo` or `choropleth` insights | No country/coastline outlines |
| `basemaps.cartocdn.com` — style JSON, sprites, glyphs, vector tiles | Dashboards with `scattermap`, `densitymap`, or `choroplethmap` insights | Points plot over a blank background |

The first row is the one to plan around, because it applies to **every** bundle, not
just map-shaped ones: DuckDB-WASM ships in the bundle, but its parquet extension does
not — it is downloaded on demand. Blocking that host and reloading a plain bar-chart
dashboard renders an empty plot: the title and axes are there and every series is gone.
There is no configuration today that points the viewer at a different extension
repository, so an air-gapped or egress-filtered network needs `extensions.duckdb.org`
reachable — through an allowlist entry, a caching proxy, or a mirror that answers for
it — before a bundle will show data.

Everything else is same-origin: the viewer JS/CSS, the DuckDB-WASM binaries and their
workers, the JSON manifests, and the parquet files all come from the bundle. No webfont
CDN is contacted; the UI uses fonts that ship with it or are already on the machine.

## Trying it locally

Any static file server can preview a bundle:

```bash
cd dist
python -m http.server 8000
```

Then open `http://localhost:8000`. (Deep links into dashboards need the SPA fallback,
which `http.server` does not provide — navigate from the root page.)

## When to reach for `dist`

| You want | Use |
|----------|-----|
| Local development with hot reload and editing | `visivo serve` |
| Hosted dashboards with auth, stages, and sharing | [`visivo deploy`](deployments.md) → Visivo Cloud |
| Dashboards inside your own infrastructure, no server to operate | `visivo dist` → any static host |
| Dashboards in an air-gapped or locked-down environment | `visivo dist` — but the browser still fetches the DuckDB parquet extension, so read [what the bundle fetches](#external-requests) first |
