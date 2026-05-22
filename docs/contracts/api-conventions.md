# Visivo HTTP API — Response Shape Conventions

This document is the source of truth for the JSON shapes Visivo's Flask
backend (`visivo/server/views/`) returns. The separate **core** SaaS repo
mirrors the read-side endpoints listed here and MUST match these shapes
exactly so the same React viewer build can run against either backend.

## Object endpoints — canonical envelope

Every per-resource detail GET (`GET /api/<resource>/<name>/`) and every
element of a per-resource list GET (`GET /api/<resource>/`) returns this
envelope:

```json
{
  "id": "<resource_name>",
  "name": "<resource_name>",
  "status": "new|modified|published|deleted|null",
  "child_item_names": ["dep_a", "dep_b"],
  "config": { <full Pydantic dump, exclude_none=True, exclude={file_path, path}> }
}
```

| Field | Notes |
|---|---|
| `id` | Object identifier. **Flask backends** (visivo CLI / Studio) emit `id == name` because there is no database — only one project is loaded at a time and names are unique within it. **Django backends** (core / cloud) emit the row's UUID primary key for `id` and keep `name` as the human-readable label. Viewer code must treat `id` as opaque and never assume it equals `name`. |
| `name` | The user-facing name of the object — what the user typed in YAML. |
| `status` | One of `new`, `modified`, `published`, `deleted`, or `null`. Cloud should always emit `"published"` (no draft cache concept exists in deploys). |
| `child_item_names` | Array of names of objects this one references. Always a list, never `null`; empty array when there are no dependencies. |
| `config` | Full Pydantic model dump of the resource. Internal fields `file_path` and `path` are stripped before serialization. |

The shape is enforced by `ObjectManager._serialize_object()`
(`visivo/server/managers/object_manager.py:255`) and locked by tests in
`tests/server/managers/test_object_manager.py::TestSerializeObjectShape`.

### Per-resource sibling keys

Some resources attach extra keys at the SAME level as `id`/`name`/`status`
— never inside `config`. Currently:

| Resource | Extra sibling key | Purpose |
|---|---|---|
| `dashboards` (list and detail GET) | `signed_thumbnail_file_url` | Thumbnail URL or `null` if none on disk. Present on every list element AND on detail responses — the cards page renders straight from the list response without a follow-up per-dashboard fetch. |

Adding a new sibling key for a resource is a **breaking change for that
endpoint**. New keys SHOULD live inside `config` if they are part of the
resource's user-authored configuration; sibling keys are reserved for
server-computed metadata that doesn't fit inside the model dump (signed
URLs, status snapshots, etc.).

### List response envelope

List endpoints wrap an array of objects under a single key keyed by the
resource plural:

```json
{ "<resource_plural>": [ <object_envelope>, <object_envelope>, ... ] }
```

Examples: `{"dashboards": [...]}`, `{"insights": [...]}`,
`{"model_jobs": [...]}`. Each element is exactly the same shape as a detail
GET would return.

### Project endpoint exception

`GET /api/projects/<name>/` and the elements of `GET /api/projects/`
return:

```json
{ "id": "...", "name": "...", "status": "...", "config": { "defaults": {...} } }
```

Same envelope as objects, except **no `child_item_names`** field. Project
is a container, not a child-bearing object — its `child_item_names` would
just be the entire project tree, which every per-resource endpoint already
covers.

## Run-status endpoints — flat envelope

Endpoints that return the status of an asynchronous run
(`/api/insight-jobs/<run_id>/`, `/api/source-schema-jobs/<run_id>/`)
return a flat shape with no `config` wrapper:

```json
{
  "run_id": "<uuid>",
  "object_type": "insight|source_schema",
  "status": "queued|running|completed|failed|cancelled",
  "progress": 0.0,
  "progress_message": "...",
  "created_at": "<iso8601>",
  "started_at": "<iso8601 | null>",
  "completed_at": "<iso8601 | null>",
  "error": "<string | null>",
  "error_details": { ... },
  "result": { ... }
}
```

`result` is only present when `status == "completed"`.

The path token is `<run_id>` everywhere; the response field is `run_id`
to match. The previous `run_instance_id` field name was redundant
(the `_id` suffix already implies the identifier).

The naming "run" rather than "job" mirrors the
`PreviewRunManager` module docstring: a **run** is a wrapper that
executes many **jobs** in a DAG. We name the wrapper because that's the
identity callers poll on.

### Model-query-jobs is different

`GET /api/model-query-jobs/<job_id>/` is intentionally NOT renamed. The
`ModelQueryJob` class has BOTH a `job_id` (the work unit identifier)
and a `run_id` (the target directory the query writes to). Both fields
are real and distinct, so renaming would lose information.

## Job-list endpoints — bare arrays

The three job-list endpoints share a single contract shape:
`(project_id, names[])`. All three return bare JSON arrays — no
envelope.

```
GET /api/insight-jobs/?project_id=<id>&insight_names=...
GET /api/input-jobs/?project_id=<id>&input_names=...
GET /api/model-jobs/?project_id=<id>&model_names=...
```

```json
[
  {
    "id": "<insight_name on Flask, UUID on Django>",
    "name": "<insight_name>",
    "name_hash": "m...",
    "files": [ {"name_hash": "m...", "signed_data_file_url": "..."} ],
    "query": "SELECT ...",
    "props_mapping": {...},
    "static_props": {...},
    "props_slices": {...},
    "split_key": "...",
    "type": "scatter"
  }
]
```

This is a sanctioned exception to the list-envelope convention because
these endpoints don't return the canonical detail shape — each element is
operational data, not the resource's authored configuration.

### `run_id` is Flask-only

Visivo Flask accepts an optional `?run_id=<dir>` query param to look up
job data under `target/<run_id>/insights/<name>.json` (defaults to
`main`). This supports Studio's preview-job flow where a fresh run dir
is created per preview.

**Django (core) does not accept `run_id`** on any of the three list
endpoints. The cloud has no per-run namespacing concept — every deploy
is its own `Project` row, so insight/input/model data is uniquely
identified by `(project_id, name)`. Django silently drops the
parameter if the viewer sends it. Callers that need to behave
identically against both backends can simply omit `run_id` (Flask
defaults to `main`).

## Singleton endpoint exception

`GET /api/defaults/` returns a bare Pydantic dump of the `Defaults`
model:

```json
{ "source_name": "snowflake", "alert_name": "slack" }
```

No `id`/`name`/`status`/`child_item_names`/`config` wrapper. Defaults
isn't a named entity — it's a singleton on the project — so the envelope
fields would all be empty or redundant.

## Error response shape

Every non-2xx response uses:

```json
{ "error": "<human-readable message>" }
```

Always the key `error`, never `message` / `detail` / `reason`. Today some
view modules still emit `message` on error paths (insight-jobs,
input-jobs, source-schema-jobs, sources, dashboard, project, file, data
views) — these are pending cleanup.

Where an endpoint returns a SUCCESS payload that includes a human message
(e.g. `POST .../save/` returning `{"message": "Saved"}`), `message` is
the right key. The rule is `error` for failure responses only.

## Status codes

| Situation | Code |
|---|---|
| Successful GET / POST / DELETE | 200 |
| Created (POST that creates a new persistent resource) | 201 |
| Async run accepted | 202 |
| Validation failed (Pydantic `ValidationError`, missing required field) | 400 |
| Auth required / failed (cloud-only) | 401 |
| Forbidden (cloud-only) | 403 |
| Resource not found | 404 |
| Unhandled exception | 500 |

Detail GET on a missing name → `404` with `{"error": "<resource> '<name>' not found"}`.
Never `200` with `null`/`{}` — the one exception is `/api/models/<name>/data/`,
which is a probe endpoint and returns `200 + {"available": false}` by design.

## URL conventions

- **Trailing slash required** on every `/api/*` route.
- **Resource paths are kebab-case**: `/api/insight-jobs/`,
  `/api/csv-script-models/`, `/api/source-schema-jobs/`.
- **Path params are snake_case**: `<dashboard_name>`, `<insight_name>`,
  `<run_id>`.
- **Sub-actions are verb suffixes**: `/save/`, `/validate/`. DELETE on the
  bare resource path is also fine.

## Query params

- **`project_id`**: every read endpoint silently accepts and ignores
  `?project_id=...`. In single-project mode (visivo serve) the param is
  unused. In multi-tenant mode (core) the param resolves the project;
  missing/invalid → 404.
- **`run_id`**: file/job-list endpoints (`/api/files/<hash>/`,
  `/api/insight-jobs/?...`, `/api/input-jobs/?...`) accept
  `?run_id=<dir>` to select a target run directory. Defaults to
  `DEFAULT_RUN_ID` (`"main"`).
- **Plural batch params**: pluralized and repeated, never comma-joined:
  `?insight_names=a&insight_names=b`.

Note: The `?run_id=<dir>` query param (named directory) and the
`<run_id>` path token on run-status endpoints (a UUID) refer to two
different concepts that happen to share a name. Context disambiguates:
the path token always resolves to a UUID-format run instance; the query
param always resolves to a named directory like `"main"` or
`"preview-<source>"`.
