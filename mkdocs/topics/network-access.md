# Network Access

Visivo is built to work without an internet connection. Installing it is the
only step that needs one: after that, `visivo compile`, `visivo run`,
`visivo serve`, `visivo test` and `visivo dist` all work offline, against
whatever sources you can reach.

This page lists the exceptions, so you know what to expect on a disconnected
laptop or behind a proxy that only allows your own hosts.

## Works offline

| | |
| -- | -- |
| The CLI | `compile`, `run`, `serve`, `test`, `dist`, `init` |
| The viewer | Dashboards, charts, tables, inputs, the editor and its SQL autocomplete |
| Local sources | DuckDB, SQLite, CSV and Excel files on disk |
| Static builds | A `visivo dist` bundle serves from any static host with no outbound calls |

Everything the browser needs is served from your own Visivo process. The SQL
editor, the DuckDB engine the viewer runs queries in, and the hot-reload channel
are all part of the install.

## Needs the network

### Map tiles

Map charts draw their background from a tile service — `carto-positron` by
default, with `mapbox`, `stadiamaps` and `arcgisonline` available as theme
styles. A world basemap is tens of gigabytes, so it is not something an install
can carry.

Offline, a map chart still plots its data and shows **"Map background
unavailable"** on the chart. Nothing fails silently, and the rest of the
dashboard is unaffected.

To avoid the dependency entirely, use a chart type that does not need a
basemap — `choropleth` and `scattergeo` draw their own geography from Plotly's
built-in outlines.

### The agent

`visivo agent` and the agent tab send your prompt and the project context to a
model provider. There is no local model, so the agent needs a connection and an
API key. Everything else in `visivo serve` works without it.

Screenshots the agent takes of your dashboards need a headless browser. A
`pip install 'visivo[screenshot]'` downloads it once on first use; a packaged
build cannot download it and says so, pointing at
`PLAYWRIGHT_BROWSERS_PATH`.

### Visivo Cloud

`visivo deploy`, `visivo archive` and `visivo authorize` talk to
`app.visivo.io`. These are the commands whose whole purpose is to put a
dashboard somewhere other people can see it, so a connection is inherent to
what they do.

### Your own data sources

A warehouse source — Snowflake, BigQuery, Postgres, MySQL, Redshift — is
reached over the network by definition. Local file sources are not.

### Excel uploads

Reading a `.xlsx` file uses DuckDB's `excel` extension, which DuckDB fetches
from `extensions.duckdb.org` the first time it is needed and then caches in
`~/.duckdb/extensions/`. If it cannot be fetched, the upload says so and
suggests CSV, which needs nothing.

### Telemetry

Anonymous usage events go to Visivo unless you turn them off. They are
fire-and-forget: nothing waits on them and nothing fails when they cannot be
sent. See [Telemetry](telemetry.md) to opt out with `visivo telemetry off`.
