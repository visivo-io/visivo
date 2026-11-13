# Project files and source credentials

The API behind shared onboarding's **Upload a file** and **Connect a database** steps (VIS-1802).
`visivo serve` (Flask) and Visivo Cloud (Django) implement the same requests and responses, so the
viewer has one code path. Until VIS-1762, VIS-1764, VIS-1755 and VIS-1758 land, both servers answer
every route below with `501`.

| urls.js key | Method and path | Served by |
| -- | -- | -- |
| `projectFiles` | `GET /api/project-files/?ext=` | studio, cloud |
| `projectFileUploads` | `POST /api/project-files/uploads/` | studio, cloud |
| `projectFileUploadContent` | `PUT /api/project-files/uploads/{uploadId}/content/` | studio (cloud returns a signed storage URL instead) |
| `projectFileUploadComplete` | `POST /api/project-files/uploads/{uploadId}/complete/` | studio, cloud |
| `sourceCredentials` | `POST /api/source-credentials/` | studio, cloud |

## Common rules

- **Project scope.** Every request carries `?project_id=` when the viewer knows it (`withProjectId`).
  Cloud requires it and answers `400` without it. Studio serves one project and ignores it. The
  server decides where files and credentials go. No request names a directory, a destination or a
  storage key.
- **Paths.** File paths are project-relative with forward slashes, for example `files/sales.csv`.
  Locally they resolve against the served project root, never the process working directory.
- **Errors.** Every non-2xx response is `{"error": "<sentence for the user>", "code": "<code>"}`.
  The viewer shows `error` as written and branches only on `code`.
- **Permissions.** Writing needs the Editor role or higher. A Viewer gets `403 forbidden` on every
  route except `GET /api/project-files/`. Studio has no roles.
- **Secrets.** Credential values appear only in the `POST /api/source-credentials/` request body.
  No response, job input, job result, log line or telemetry event contains one.

### Error codes

| Status | `code` | When |
| -- | -- | -- |
| 400 | `invalid_request` | A required field is missing or malformed |
| 400 | `unsupported_format` | The file extension is not in `formats` |
| 403 | `forbidden` | The user may not write to this project |
| 404 | `not_found` | Unknown upload, file, version or job, or one from another project |
| 409 | `upload_closed` | Content sent to an upload that is already complete or expired |
| 409 | `content_missing` | `complete` called before all bytes arrived |
| 413 | `too_large` | Declared or received size exceeds `max_bytes` (100 MB) |
| 422 | `size_mismatch` | Received bytes differ from the declared `size` |
| 422 | `checksum_mismatch` | Received bytes differ from the declared `sha256` |
| 501 | `not_implemented` | The server does not implement this route yet |

## Shared shapes

**FileVersion**: one immutable file.

```json
{
  "path": "files/sales.csv",
  "filename": "sales.csv",
  "original_filename": "Sales Q3.csv",
  "version_id": "fv_01J…",
  "format": "csv",
  "size": 48213,
  "sha256": "9f2c…",
  "created_at": "2026-11-10T21:04:11Z"
}
```

- `filename` is the sanitized name: the basename only, characters outside `A-Za-z0-9._-` replaced
  with `_`, no leading dot, at most 120 characters, extension lowercased.
- A completed file is never overwritten. If `files/sales.csv` exists, the next upload of
  `sales.csv` becomes `files/sales-2.csv`. A path therefore names one version for its whole life.
  Cloud stores private objects keyed by `version_id` behind the same logical path.
- `version_id` is opaque. It is `null` in a listing for a file that did not arrive through upload,
  such as one copied into the project folder by hand.

**Format**: one entry in the capability list a server advertises.

```json
{
  "format": "csv",
  "label": "CSV",
  "extensions": [".csv", ".tsv"],
  "source_type": "duckdb",
  "options": ["header", "delimiter", "encoding"]
}
```

`source_type` is the source the viewer creates for the file: `duckdb` for tabular files, and the
file's own type for a `.duckdb` or `.sqlite` database. `options` are the reader settings that source
type takes. A server lists a format only when it can read it, and the
viewer accepts exactly the extensions listed. The target set is CSV, Parquet, Lance, XLSX, DuckDB
and SQLite; each joins the list when a real fixture test passes.

## Routes

### `GET /api/project-files/?ext=csv,xlsx`

Lists the project's data files and the formats the server can read. `ext` is an optional
comma-separated list of extensions without dots. Locally the listing walks the project root,
skipping ignored and hidden paths and anything that resolves outside the root.

`200`:

```json
{
  "files": [FileVersion],
  "formats": [Format],
  "max_bytes": 104857600
}
```

### `POST /api/project-files/uploads/`

Starts an upload and reserves its path.

Request:

```json
{"filename": "Sales Q3.csv", "size": 48213, "content_type": "text/csv", "sha256": "9f2c…"}
```

`filename` and `size` are required. `content_type` and `sha256` are optional; when `sha256` is
sent, `complete` verifies it.

`201`:

```json
{
  "upload_id": "up_01J…",
  "version_id": "fv_01J…",
  "path": "files/sales_q3.csv",
  "expires_at": "2026-11-10T22:04:11Z",
  "transfer": {"method": "PUT", "url": "…", "headers": {"Content-Type": "text/csv"}}
}
```

The viewer sends the raw bytes with `transfer.method` to `transfer.url`, adding exactly
`transfer.headers`. Studio's `url` is `/api/project-files/uploads/{uploadId}/content/`. Cloud's is
a signed storage URL, so the bytes do not pass through Django.

Errors: `400 invalid_request`, `400 unsupported_format`, `403 forbidden`, `413 too_large`.

### `PUT /api/project-files/uploads/{uploadId}/content/` (studio)

Body: the file's bytes. `204` with no body.

Errors: `404 not_found`, `409 upload_closed`, `413 too_large`.

### `POST /api/project-files/uploads/{uploadId}/complete/`

Checks the received bytes against the declared size and checksum and makes the file permanent.
Repeating it for a completed upload returns the same response.

`200`: `{"file": FileVersion}`

Errors: `404 not_found`, `409 content_missing`, `422 size_mismatch`, `422 checksum_mismatch`.
An upload that is never completed is discarded after `expires_at`, and its path is freed.

### Creating a source from a file

There is no import route. After `complete`, the viewer creates the source with the routes every
source uses:

1. It picks a free source name and builds the config from the file's `path` and its format's
   `source_type`.
2. It saves the config as a draft with `POST /api/sources/{name}/`. Nothing is committed.
3. It may check that the file reads with `POST /api/source-connections/`.

### `POST /api/source-credentials/`

Stores a source form's typed credentials and returns the config to test and save instead.

Request:

```json
{
  "source": {"name": "warehouse", "type": "postgresql", "host": "db.example.com",
             "username": "analyst", "password": "typed value"}
}
```

`200`:

```json
{
  "source": {"name": "warehouse", "type": "postgresql", "host": "db.example.com",
             "username": "${env.WAREHOUSE_USERNAME}", "password": "${env.WAREHOUSE_PASSWORD}"},
  "credentials": [
    {"field": "password", "reference": "${env.WAREHOUSE_PASSWORD}",
     "storage": "project_env", "created": true}
  ]
}
```

- Credential fields are `username`, `password` and `credentials_base64`.
- A field whose value is already a reference, or is empty, is returned unchanged and not stored.
  A masked value (`**********`) means "keep the current credential" and is also returned unchanged.
- `storage` is `project_env` (studio: the project's `.env`, which is kept out of Git) or
  `account_secret` (cloud: the account's secret store). `created` is false when an identical
  value was already stored under that reference.
- A name used by another source's credential is never overwritten. The server picks a new name,
  such as `WAREHOUSE_PASSWORD_2`, and returns it in `reference`.
- The viewer then sends the returned `source`, never the typed one, to `POST /api/source-connections/`
  and `POST /api/sources/{name}/`.

Errors: `400 invalid_request`, `403 forbidden`.

## Django route names

For `core/api/apps/deploys/urls.py`:

| Path | Name |
| -- | -- |
| `api/project-files/` | `project_file_list` |
| `api/project-files/uploads/` | `project_file_upload_list` |
| `api/project-files/uploads/<str:upload_id>/complete/` | `project_file_upload_complete` |
| `api/source-credentials/` | `source_credentials` |
