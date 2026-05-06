# Visivo HTTP API Conventions

This document is the source of truth for HTTP behavior across every endpoint
under `visivo/server/views/`. It exists so that:

1. Visivo's own views are internally consistent (today they are mostly but not entirely).
2. The separate **core** SaaS repo can mirror the read-side endpoints visivo exposes,
   knowing the contract is fixed.

If you are adding a new view module or endpoint, follow these conventions
exactly. If an existing endpoint deviates from this doc, fix the endpoint,
not the doc — unless the endpoint represents a deliberate exception captured
in the **Sanctioned Exceptions** section below.

A per-route audit table sits at the bottom of this document; it is the source
data the conventions were derived from.

## Conventions

### URL shape

- **Trailing slash is required** on every `/api/*` route.
  `Y` for `/api/dashboards/<name>/`. Routes without trailing slashes (e.g.
  `/api/insight-jobs/hash`, `/api/explorer/`, `/api/schema/`,
  `/api/error/`, `/api/project/`, `/api/project_history/`) are violations.
- **Resource paths are kebab-case** (`/api/insight-jobs/`,
  `/api/csv-script-models/`, `/api/local-merge-models/`,
  `/api/source-schema-jobs/`, `/api/model-query-jobs/`).
- **Path params are snake_case** (`<dashboard_name>`, `<insight_name>`,
  `<run_id>`).
- **Sub-actions are `/<verb>/`** at the end of a resource path
  (`/save/`, `/validate/`, `/delete/`). DELETE on the bare resource path
  (`DELETE /api/charts/<chart_name>/`) is also accepted; do not use a
  `/delete/` POST when DELETE on the resource works.

### Query params

- **`project_id`**: every read endpoint silently accepts and ignores
  `?project_id=...`. In single-project (visivo serve) mode the param is
  unused — there is exactly one project loaded. In core (multi-tenant)
  mode the param resolves the project; missing/invalid → 404.
  Adding accept-and-ignore in visivo means the viewer's per-store fetchers
  can append `?project_id=...` unconditionally without a code branch.
- **`run_id`**: any endpoint that touches `target/<run_id>/` accepts
  `?run_id=...`, defaulting to `DEFAULT_RUN_ID` (`"main"`) from
  `visivo/constants.py`. This currently applies to `/api/files/<hash>/`,
  `/api/insight-jobs/`, `/api/input-jobs/`. Other endpoints don't read it.
- **Plural batch params** are pluralized (`?insight_names=a&insight_names=b`,
  `?input_names=...`) and appear repeated. Don't use comma-joined values.

### Response: detail GET shape

Every detail GET (`GET /api/<resource>/<name>/`) returns the canonical
serialized object shape from
[`object_manager.ObjectManager._serialize_object`](../../visivo/server/managers/object_manager.py)
(line 255):

```json
{
  "name": "<resource_name>",
  "status": "new|modified|published|deleted|null",
  "child_item_names": ["dep_a", "dep_b"],
  "config": {<full Pydantic model dump, exclude_none=True, exclude={file_path, path}>}
}
```

Per-resource extras (e.g. `signed_thumbnail_file_url` on dashboard detail)
are added as **sibling keys** to the four canonical keys above, never inside
`config`.

On core, `status` is always `"published"` — there is no draft/cache concept.

### Response: list GET shape

Every list GET (`GET /api/<resource>/`) returns a single-key envelope keyed
by the resource name (plural):

```json
{ "<resource_plural>": [<detail_object>, <detail_object>, ...] }
```

Examples: `{"dashboards": [...]}`, `{"insights": [...]}`,
`{"models": [...]}`, `{"projects": [...]}`. Each element is the same shape
as a detail GET would return.

The `input-jobs`, `insight-jobs`, and `source-schema-jobs` list endpoints
use bare arrays (`[...]`) today — these are sanctioned exceptions because
they aren't manager-backed and don't return the canonical detail shape.
See **Sanctioned Exceptions**.

### Response: error shape

Every endpoint that returns a non-2xx response uses:

```json
{ "error": "<human-readable message>" }
```

— always the key `error`, always a string value.

Today many endpoints (most of `dashboard_views.py`, all job endpoints,
introspection endpoints in `sources_views.py`, parts of `project_views.py`,
`source_schema_jobs_views.py`, `file_views.py`) emit `{"message": "..."}`
instead. **These are violations** and must be migrated to `{"error": "..."}`
in the Phase 0 fix commit.

Where an endpoint also returns a success message (e.g. `POST .../save/`
returning `{"message": "Saved"}`), `message` for SUCCESS payloads is
acceptable — the rule is `error` for failure responses only.

### HTTP status codes

| Situation | Code |
|---|---|
| Successful GET / POST / DELETE | 200 |
| Created (POST that creates a new persistent resource) | 201 (rare today; most POSTs are saves to a cache and return 200) |
| Validation failed (Pydantic `ValidationError`, missing required field) | 400 |
| Auth required / failed | 401 (out of scope for visivo single-user mode; relevant for core) |
| Forbidden (auth ok, not allowed) | 403 (relevant for core only) |
| Resource not found | 404 |
| Conflict / business-rule violation | 409 |
| Unhandled exception | 500 |

**Specifically:**
- Detail GET on a missing name → `404` with `{"error": "<resource> '<name>' not found"}`. Never `200` with `null`/`{}`/`{"available": false}`. Two endpoints currently violate this (`model_data_views.py:9` and `file_views.py:24` return `200+empty`); they need to return `404`.
- POST validate on a config that fails Pydantic validation → `400`.
- Catch-all `except Exception` → `500` with `{"error": str(e)}`.

### Logging on errors

Every catch block that returns a non-2xx response logs the error with
`Logger.instance().error(f"...: {str(e)}")` before returning. Don't
silently swallow exceptions, even at 500.

## Sanctioned Exceptions

The following endpoints intentionally deviate from the conventions above.
Any other deviations are bugs.

### `/api/files/<hash>/` and `/api/files/<hash>/<run_id>/`

- Returns the raw parquet/JSON binary on success, not JSON. Error responses
  still use the canonical `{"error": "..."}` JSON shape.

### `/api/dashboards/<name>.png/`

- Returns image/png binary on GET success. Accepts multipart upload on POST.
  Error responses still use the canonical JSON shape.

### `/api/explorer/`, `/api/schema/`, `/api/error/`, `/api/project_history/`

- Return raw artifact JSON files from `target/`. They predate the convention.
  Treat as legacy artifact endpoints; do not use as a model for new endpoints.
  Their lack of trailing slash is grandfathered for backward compatibility
  but should be fixed in the Phase 0 normalization commit.

### `/api/project/`

- Returns the full bulk project JSON. **Being deprecated** in favor of the
  per-resource endpoints. Do not add features to it. Will be removed once
  `loadProject` is slimmed (see plan Phase A.2 / E.3).

### Job endpoint list responses

`GET /api/input-jobs/`, `GET /api/insight-jobs/`, and the
`source-schema-jobs/` list variants return bare JSON arrays rather than
the `{<resource>: [...]}` envelope. They are not manager-backed and don't
emit the canonical `_serialize_object` shape — each element is a job-status
object with `name`, `status`, `signed_data_file_url`, etc. Keep the bare
array for now; if the contract grows new top-level fields (pagination, etc.)
migrate to the envelope at that point.

### Catch-all `/` route in `data_views.py`

- Serves the viewer SPA HTML/assets. Not an API route. Trailing slash
  rule does not apply.

## Phase 0 Fix List

The following changes are required to bring visivo's existing views into
compliance. These are pure cleanups — no behavior change visible to a
correctly-written client.

### 1. Migrate `message` → `error` on error responses

**Affected files:**
- `visivo/server/views/dashboard_views.py` — every `jsonify({"message": ...})` on an error path becomes `jsonify({"error": ...})`. Success responses that say `{"message": "Saved..."}` stay as-is.
- `visivo/server/views/insight_jobs_views.py` — same.
- `visivo/server/views/input_jobs_views.py` — same.
- `visivo/server/views/source_schema_jobs_views.py` — same.
- `visivo/server/views/sources_views.py` — the introspection endpoints (lines 16, 26, 41, 54, 71, 88, 109, 130) that use `message`.
- `visivo/server/views/project_views.py` — the POST routes that use `message` on errors.
- `visivo/server/views/file_views.py` — error path uses `message`.
- `visivo/server/views/data_views.py` — `/api/explorer/`, `/api/schema/` use `message`.
- `visivo/server/views/model_query_jobs_views.py` — verify error key.

### 2. Fix `200+empty` returns on missing resources

- `visivo/server/views/model_data_views.py:9` — when the parquet file doesn't exist, currently returns `200 + {"available": false}`. Change to `404 + {"error": "Model data for '<model_name>' not found"}`.
- Audit `file_views.py` similarly — confirm 404 on missing file (the audit suggests it already does for `<run_id>` variant; verify the bare-hash variant too).

### 3. Fix missing trailing slashes

Add trailing slashes to:
- `data_views.py:10` — `/api/explorer/` → already has one. Verify.
- `data_views.py:18` — `/api/schema/` → already has one. Verify.
- `data_views.py:28` — `/api/error/`
- `data_views.py:36` — `/api/project/`
- `data_views.py:47` — `/api/project_history/`
- `insight_jobs_views.py:82` — `/api/insight-jobs/hash` → `/api/insight-jobs/hash/`

The audit table flagged some of these as `Y` for trailing slash and some as
`N`; re-check before changing — slashes may already be in place and the
audit's `N` came from a `request.path` mismatch, not the route declaration.

### 4. Add `?project_id=` accept-and-ignore stubs

Every detail / list / write endpoint should accept the param even if it
ignores it. Today the backend doesn't read it; that's fine — but document
that core implementations MUST resolve it. Phase 0 does not need to wire
anything; this is documentation-only.

### 5. Standardize `?run_id=` handling on jobs/files

Every endpoint that accesses `target/<run_id>/...` should:
- Accept `?run_id=` query param.
- Default to `DEFAULT_RUN_ID` from `visivo/constants.py` when absent.
- Validate that the run_id is a non-empty filename-safe string.

Currently `/api/files/<hash>/` (without `<run_id>` in the path) defaults
to `main` internally — fine. Confirm that `insight-jobs/` and
`input-jobs/` accept `?run_id=` and behave the same. The audit already
shows these read it.

### 6. Status code: missing-resource on `model_data_views`

See item 2.

## Audit data — per-route summary

Source: full per-route audit performed against
`visivo/server/views/*.py` on 2026-05-06.

**Dominant patterns:**
- Trailing slash: `Y` on 99% of routes; 7 violations to fix (see item 3).
- Error key: `error` on ~75% of routes; `message` on ~25% (jobs, dashboards, introspection, file). All `message`-on-error to migrate to `error`.
- Not-found: `404` consistent on detail GETs, except `model_data_views.py:9` (`200+empty`) and arguably `file_views.py:24`.
- Validation error: `400` consistent on POST `/save/` and `/validate/`.
- List shape: `{<resource>: [...]}` consistent across manager-backed CRUD; bare arrays only for job endpoints (sanctioned exception).
- Detail shape: All manager-backed routes call `manager.get_object(...)` which internally invokes `_serialize_object()` (`object_manager.py:255-305`). Routes that bypass it manually:
  - `dashboard_views.py:10` — adds `signed_thumbnail_file_url` as sibling key. Correct per convention.
  - `defaults_views.py:10` — returns flat `model_dump` (no name/status/child_item_names wrapper). Correct: `Defaults` isn't a named entity, has no status.
  - All job-status endpoints — return job-shape, not entity-shape.
- `?project_id=` accepted: 0 endpoints today. Phase 0 doesn't change this; core implements.
- `?run_id=` accepted: file_views (`<run_id>` path variant), insight-jobs, input-jobs.

**Violation counts to fix in Phase 0:**
- 33 `error key = message` on error responses → migrate to `error` key.
- 7 missing trailing slashes → add slash.
- 1 `200+empty` on missing resource (`model_data_views.py:9`) → 404.
- ~85 endpoints to add `request.args.get('project_id')` accept-stub (only required if/when an endpoint needs it; not a universal change).
