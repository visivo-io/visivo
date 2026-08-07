# Nuitka spike (VIS-1190) — findings

**Result: a Nuitka `--standalone` build of the Visivo CLI works.** It compiles,
links, and is functionally faithful to the interpreted CLI. The historical
sqlglot fear did not materialize. See `visivo/build_nuitka.py` for the build.

Environment: macOS arm64, pyenv CPython 3.14.6, Nuitka **4.1.3**, clang 21.

## What it took to build (four fixes from a naive `--standalone`)

1. **Nuitka must be >= 4.x.** The repo pins `nuitka = "^2.7.6"` (2.8.10). On 2.8.10
   the build failed twice — `--enable-plugin=pydantic` is not a valid plugin
   (pydantic_core is handled automatically now), and pyenv's `--enable-shared`
   CPython tripped static-libpython detection. `pip install -U 'nuitka>=4.1'`
   fixed both. **Bumping the pin cleanly (without the lock re-resolving and
   downgrading redshift/snowflake/bigquery/tornado) is left to VIS-1192.**
2. **`--static-libpython=no`** — required for pyenv's shared CPython. CI's Python
   flavor may not need it; keep it conditional in the real pipeline.
3. **No `--enable-plugin=pydantic`** — there is no such plugin in 4.x; pydantic_core
   is bundled automatically. (matplotlib self-activated its plugin too.)
4. **The binary cannot be named `visivo`.** In standalone, Nuitka compiles the
   `visivo` package into `<dist>/visivo/` (where `importlib.resources.files("visivo")`
   resolves data), and an executable named `visivo` collides with that dir
   (`FATAL: data file ... 'visivo' conflicts with executable 'visivo'`). Built as
   `visivo-app`; presenting the final `visivo` command (symlink/wrapper) is a
   packaging step for VIS-1192. PyInstaller sidesteps this by nesting under
   `_internal/`.

## What works (smoke, against the built binary)

- `--version`, `--help`, `init` (scaffold), `compile`.
- `run` against a seeded DuckDB file — **identical output to the interpreted CLI**
  (a bare model with no consumer writes only schemas; verified interpreted does
  the same, so it's faithful, not a Nuitka gap).
- `serve` — HTTP 200, serves the bundled React viewer (`<div id="root">`),
  "Initial Data Refresh Complete." This proves `importlib.resources.files("visivo")`
  resolves the bundled `viewers/` and `schema/` data under Nuitka.
- The risky native/dynamic deps all load: **pydantic_core, jsonschema_rs, sqlglot,
  duckdb, matplotlib, snowflake.connector, socketio**. sqlglot was a non-issue
  (27.29.0, pure-Python, no `sqlglotrs`) — as predicted.

## Caveats / follow-ups

- **Python 3.14 is only *experimental* in Nuitka 4.1.3** (it recommends 3.13).
  The build worked on 3.14 anyway, but the **release + runner builds should target
  3.13** (the runner already runs 3.13). Feeds VIS-1192/1193.
- **Size is large: 270 MB binary, 859 MB dist folder.** Heavy deps (matplotlib,
  snowflake, pandas, duckdb, plotly) dominate. This matters for the runner
  image-size goal (VIS-1193) — measure vs PyInstaller and trim
  (`--nofollow-import-to` for genuinely-unused packages, drop matplotlib if the
  CLI never renders with it, etc.).
- **`plotly` package-data was not located** ("Failed to locate package directory of
  'plotly'", non-fatal). Charts weren't exercised end-to-end (serve renders the
  React viewer, not plotly.py figures). **Verify a chart/insight-bearing project**
  before trusting the build for real projects.
- **First-run was 31 s** — macOS Gatekeeper scanning the unsigned 859 MB dist.
  Warm `--version` is ~2.5 s. Distribution needs code-signing/notarization on mac.

## Startup numbers (macOS arm64, warm)

| | `--version` wall-clock |
|---|---|
| Nuitka binary (warm) | ~2.5–2.8 s |
| `poetry run visivo` (interpreted) | ~6.3 s |

**~2.5 s is dominated by the eager import of all 14 subcommands** in
`command_line.py` — Nuitka compiles that graph but can't skip it. **VIS-1191
(lazy-load subcommands) is the bigger startup lever** and is freezer-independent.
A fair Nuitka-vs-PyInstaller comparison (build PyInstaller too) is the next
measurement, on Linux, once lazy-loading lands.
