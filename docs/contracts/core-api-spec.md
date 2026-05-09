# Core HTTP API — Contract Spec

This document specifies the HTTP endpoints that the **core** SaaS backend
must implement to serve the Visivo viewer. It is the read-side mirror of a
subset of `visivo/server/views/`.

Conventions (trailing slashes, error shape, list/detail shape, status codes,
query params) are defined in
[`api-conventions.md`](api-conventions.md). Read that first — this document
specifies WHICH endpoints to implement, not the conventions they follow.

## Scope

Core only implements the **read-side** endpoints the viewer needs to render
a deployed project. Editing/Studio endpoints (`*/save/`, `*/validate/`,
`*/delete/`, `/api/publish/`, source-schema-jobs/, sources/databases/, etc.)
are visivo-local only and do not exist on core.

## Authentication

Every request to core MUST be authenticated. The auth scheme is core's
choice (cookie session, bearer token, etc.) and is not specified here.
What this contract requires:

- `?project_id=<id>` MUST be validated against the authenticated user's
  scope. Return `404` if the project doesn't exist OR the user can't see
  it. Do NOT return `403` — that leaks the existence of the project.

The viewer ignores auth headers; whatever cookie/session core uses, the
viewer's existing `fetch()` calls send credentials by default.

## Endpoints

### Projects

#### `GET /api/projects/`

List the projects the authenticated user has access to.

Response 200:
```json
{
  "projects": [
    { "id": "<project_id>", "name": "<project_name>", "status": "published",
      "child_item_names": [], "config": { "defaults": {...} } }
  ]
}
```

In single-project mode (visivo) returns a list with one item. Core may
return many. The viewer reads `id` and `name` of the first match (or the
one matching `?project_id=` if supplied).

#### `GET /api/projects/<project_name>/`

Detail for one project, identified by name within the user's scope.

Response 200: Same shape as a list element above.
Response 404 if not found.

### Defaults

#### `GET /api/defaults/?project_id=<id>`

The project's `defaults` config (source_name, alert_name, levels, etc.).

Response 200: Flat Pydantic dump of the `Defaults` model. Example:
```json
{ "source_name": "snowflake", "alert_name": "slack" }
```

No status wrapper — defaults aren't a named entity. Returns `{}` if the
project has no defaults configured.

### Dashboards

#### `GET /api/dashboards/?project_id=<id>`

List of dashboards for the project.

Response 200:
```json
{
  "dashboards": [
    { "name": "Sales", "status": "published", "child_item_names": [...],
      "config": { "rows": [...], "description": "...", "tags": [...],
                   "level": 0, "type": "internal", "href": null } }
  ]
}
```

Each `config.rows[].items[].chart|table|input|markdown` MUST be a ref string
(`${ref(<name>)}`), not an embedded object. See **Project Intake** below.

External dashboards have `config.type == "external"` and `config.href`
populated; their `config.rows` is typically empty.

#### `GET /api/dashboards/<dashboard_name>/?project_id=<id>`

Detail for one dashboard. Same shape as a list element, plus a top-level
`signed_thumbnail_file_url` sibling key:

```json
{
  "name": "Sales",
  "status": "published",
  "child_item_names": [...],
  "config": {...},
  "signed_thumbnail_file_url": "https://<presigned-s3>/...png" or null
}
```

`signed_thumbnail_file_url` is null when no thumbnail has been uploaded
yet. Visivo returns a relative URL; core SHOULD return an absolute presigned
URL.

#### `GET /api/dashboards/<dashboard_name>.png/?project_id=<id>`

Returns the thumbnail PNG binary. `Content-Type: image/png`.

Either serve the bytes directly OR return a 302 redirect to the presigned
URL. Both are acceptable; the viewer just sets `<img src={url}>`.

Response 404 if no thumbnail exists.

#### `POST /api/dashboards/<dashboard_name>.png/?project_id=<id>`

**NOT IMPLEMENTED ON CORE.** The viewer's `captureDashboardThumbnail`
flow is gated behind `URLContext.environment === 'server'` and never
fires against core. Core thumbnails come exclusively from the deploy
upload flow. If core receives a POST to this URL, return `405 Method
Not Allowed`.

### Charts, Tables, Markdowns, Inputs, Insights, Models

These five resources follow an identical shape:

#### `GET /api/<resource>/?project_id=<id>`

```json
{ "<resource_plural>": [ <detail_object>, ... ] }
```

#### `GET /api/<resource>/<name>/?project_id=<id>`

Canonical detail shape:
```json
{
  "name": "<name>",
  "status": "published",
  "child_item_names": [...],
  "config": { <full Pydantic dump, exclude_none, exclude {file_path, path}> }
}
```

Specifically, the `<resource>` set is:
- `charts` → `{"charts": [...]}`
- `tables` → `{"tables": [...]}`
- `markdowns` → `{"markdowns": [...]}`
- `inputs` → `{"inputs": [...]}`
- `insights` → `{"insights": [...]}`
- `models` → `{"models": [...]}`

For models, the `config` MUST also include a top-level `name_hash` field
matching the value visivo deploy posted (see `deploy_phase.py:268`); the
viewer uses it as the DuckDB table name and as the file lookup key for
`/api/files/<hash>/`.

### Insight Jobs

#### `GET /api/insight-jobs/?insight_names=<a>&insight_names=<b>&run_id=<r>&project_id=<id>`

Bulk-fetch insight metadata + data file URLs.

Response 200: bare JSON array (sanctioned exception — not an envelope):
```json
[
  {
    "id": "<insight_name>",
    "name": "<insight_name>",
    "files": [
      { "name_hash": "m...", "signed_data_file_url": "https://...parquet" }
    ],
    "query": "SELECT ... FROM ?{name_hash}",
    "props_mapping": {...},
    "static_props": {...},
    "props_slices": {...},
    "split_key": "...",
    "type": "scatter"
  }
]
```

If some requested insights aren't found, omit them from the array (don't
404 the whole call). If NONE are found, 404 with
`{"error": "No insight files found for: [<missing>]"}`.

#### `POST /api/insight-jobs/?project_id=<id>`

**Stubbed on core.** Visivo uses this to spawn a sandbox preview re-run.
Core only serves PUBLISHED data, so the POST should:
1. Accept the body (`{insight_names, context_objects, run: true}`).
2. Validate `run === true` and `insight_names` is a non-empty list (400 if not).
3. Synthesize a job_id (e.g. `published-<random>`), record nothing.
4. Return `202 + {"run_instance_id": "<synthetic_job_id>"}`.

#### `GET /api/insight-jobs/<job_id>/?project_id=<id>`

For a synthetic published job, return immediately as completed:
```json
{
  "job_id": "<job_id>",
  "run_id": "<synthetic_job_id>",
  "status": "completed",
  "progress": 1.0,
  "progress_message": "Loaded from publish",
  "result": null
}
```

The viewer's `useInsightsData` polls this endpoint; returning `completed`
immediately lets it move to the file fetch path.

#### `POST /api/insight-jobs/hash/?project_id=<id>`

Compute alpha_hash for a given name. Body: `{"name": "<insight_or_model_name>"}`.
Response 200: `{"name": "<input>", "name_hash": "m..."}`.

The viewer uses this when it needs the hash for a name it didn't get from
a server response (rare, but the contract is here for parity).

### Input Jobs

#### `GET /api/input-jobs/?input_names=<a>&input_names=<b>&run_id=<r>&project_id=<id>`

Same shape as `/api/insight-jobs/` — bare array of input-job objects with
`id`, `name`, `files`, `type`, `structure`, `static_props`, `display`,
`warnings`.

### Files

#### `GET /api/files/<hash>/<run_id>/?project_id=<id>`

Returns the parquet binary for the given hash within the given run.

Either serve the bytes directly or 302 to a presigned URL. Both are
acceptable.

Response 404 with `{"error": "Data file not found for hash: <hash> in run: <run_id>"}`.

`<hash>` is the `name_hash` value (alpha_hash format: lowercase letters,
starts with `m`).

#### `GET /api/files/<hash>/?project_id=<id>`

Convenience alias — defaults `run_id` to `"main"` (or whatever core's
equivalent of "the current published run" is).

### Model Query Jobs

OPTIONAL on core. The viewer uses `/api/model-query-jobs/` for ad-hoc SQL
exploration in the explorer. If core doesn't expose an explorer, you can
either:
- Return `404` for these endpoints (the viewer handles missing endpoints).
- Or stub them to return `400 + {"error": "Ad-hoc model queries are not supported on this deployment"}`.

The viewer's behavior is to gracefully degrade if `model-query-jobs` is
unavailable.

### Model Data

#### `GET /api/models/<model_name>/data/?project_id=<id>`

OPTIONAL on core. This is a probe endpoint — the viewer uses it to decide
whether to render a "no data" state for a chart that's bound to a model
without insight metadata.

Response 200 with one of:
```json
{ "available": false }
```
OR
```json
{ "available": true, "columns": [...], "rows": [...], "row_count": N, "truncated": false }
```

This is a sanctioned exception to the 404-on-missing convention — see
[`api-conventions.md`](api-conventions.md).

If core doesn't have model data accessible for ad-hoc reads, return
`{ "available": false }`.

## Project Intake

When visivo deploys a project to core, the deploy POSTs the full
`project_json` to `POST /api/projects/`. Core's intake handler must split
this blob into individual database rows so the read endpoints can serve
per-resource queries.

### Intake algorithm

1. **Persist the project row** — `id` (generate or use deploy-supplied),
   `name`, `cli_version`, `defaults` from `project_json.defaults`.

2. **Walk every dashboard** in `project_json.dashboards[]`:
   1. For each `dashboard.rows[].items[]` value (chart, table, input, markdown):
      - If it's an embedded object (has `name` + config fields): persist it
        into the corresponding per-resource table, then replace the value
        in the dashboard with a ref string `${ref(<name>)}`.
      - If it's already a ref string: leave as-is (idempotent).
   2. Persist the rewritten dashboard config into the `dashboards` table.

3. **Walk insights inside charts** — after step 2, charts have been
   extracted. Each chart's `config.insights[]` is currently an array of
   embedded insight objects (visivo deploy pre-dereferences). For each
   embedded insight:
   - Persist into the `insights` table.
   - Replace the array entry with `${ref(<insight_name>)}`.
   - Update the corresponding `charts` row.

   Tables similarly may have embedded insights in `config.<insight_field>`;
   apply the same extract-and-rewrite.

4. **Per-asset deploy POSTs** — visivo separately POSTs:
   - `POST /api/dashboards/` — `{name, project_id, config, thumbnail_file_id?}`.
     Use `config` to overwrite/merge the dashboard row from step 2.2.
     Resolve `thumbnail_file_id` to a presigned URL and store on the row.
   - `POST /api/insight-jobs/` — `{name, name_hash, data_file_id, json_file_id, run_id, project_id}`.
     Persist into `insight_jobs` table.
   - `POST /api/input-jobs/` — same shape as insight-jobs.
   - `POST /api/models/` — `{name, name_hash, data_file_id, project_id}`.

5. **Idempotency** — every per-resource record is keyed on
   `(project_id, name)`. Re-running intake for the same project replaces
   prior rows. Use upsert / ON CONFLICT semantics.

### Schema

Suggested minimal table layout:

```
projects(
  id text primary key,
  name text not null,
  slug text,
  owner_id text,
  cli_version text,
  created_at timestamptz default now()
)

project_defaults(
  project_id text references projects(id) primary key,
  config jsonb not null
)

dashboards(
  project_id text references projects(id),
  name text,
  config jsonb not null,             -- {rows: [...], description, tags, level, type, href}
  child_item_names text[],
  thumbnail_url text,                -- presigned, may be null
  created_at timestamptz default now(),
  primary key (project_id, name)
)

charts(
  project_id text references projects(id),
  name text,
  config jsonb not null,             -- {insights: ["${ref(...)}"], layout: {...}}
  child_item_names text[],
  primary key (project_id, name)
)

tables(
  project_id text references projects(id),
  name text,
  config jsonb not null,
  child_item_names text[],
  primary key (project_id, name)
)

markdowns(
  project_id text references projects(id),
  name text,
  config jsonb not null,
  primary key (project_id, name)
)

inputs(
  project_id text references projects(id),
  name text,
  config jsonb not null,
  primary key (project_id, name)
)

insights(
  project_id text references projects(id),
  name text,
  config jsonb not null,             -- {props: {...}, interactions: [...]}
  child_item_names text[],
  primary key (project_id, name)
)

models(
  project_id text references projects(id),
  name text,
  name_hash text not null,
  config jsonb not null,
  parquet_url text,                  -- presigned to the deployed parquet
  primary key (project_id, name)
)

insight_jobs(
  project_id text references projects(id),
  insight_name text,
  run_id text,
  name_hash text not null,
  json_url text,                     -- presigned to insight metadata JSON
  parquet_url text,                  -- presigned to parquet data file
  primary key (project_id, insight_name, run_id)
)

input_jobs(
  project_id text references projects(id),
  input_name text,
  name_hash text not null,
  json_url text,
  parquet_url text,
  primary key (project_id, input_name)
)
```

## Forward Compatibility

When future visivo releases add a new endpoint, the viewer is forward-
compatible: it expects 404/501 to be the gating signal that core hasn't
caught up yet, and degrades gracefully.

When core adds an endpoint visivo doesn't have (e.g. multi-project
dashboards, sharing, comments), expose it under `/api/...` with the
conventions in `api-conventions.md`. The viewer will simply not call it
unless an explicit code path is added.
