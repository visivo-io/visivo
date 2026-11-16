# Project files and secrets

The API behind shared onboarding's **Upload a file** and **Connect a database** steps (VIS-1802).
`visivo serve` (Flask) and Visivo Cloud (Django) implement the same requests and responses, so the
viewer has one code path. Studio serves the file listing (VIS-1283). Until VIS-1762, VIS-1764 and
VIS-1755 land, the routes they build answer `501`.

| urls.js key | Method and path | Served by |
| -- | -- | -- |
| `projectFiles` | `GET /api/project-files/?ext=` | studio, cloud |
| `projectFileUploads` | `POST /api/project-files/uploads/` | studio, cloud |
| `projectFileUploadContent` | `PUT /api/project-files/uploads/{uploadId}/content/` | studio (cloud returns a signed storage URL instead) |
| `projectFileUploadComplete` | `POST /api/project-files/uploads/{uploadId}/complete/` | studio, cloud |
| `secrets` | `POST /api/secrets/` | studio, cloud |

## Common rules

- **Project scope.** Every request carries `?project_id=` when the viewer knows it (`withProjectId`).
  Cloud requires it and answers `400` without it. Studio serves one project and ignores it. The
  server decides where files and secrets go. No request names a directory, a destination or a
  storage key.
- **Paths.** File paths are project-relative with forward slashes, for example `files/sales.csv`.
  Locally they resolve against the served project root, never the process working directory.
- **Errors.** Every non-2xx response from a project-file route is `{"error": "<sentence for the user>", "code": "<code>"}`.
  The viewer shows `error` as written and branches only on `code`.
- **Permissions.** Writing a file needs the Editor role or higher. A Viewer gets `403 forbidden` on
  every project-file route except `GET /api/project-files/`. Adding a secret needs an account admin.
  Studio has no roles.
- **Secrets.** A secret value appears only in the `POST /api/secrets/` request body.
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
- `version_id` is opaque. It and `sha256` are `null` in a listing for a file that did not arrive
  through upload, such as one copied into the project folder by hand. For such a file
  `original_filename` equals `filename`, and `created_at` is its last-modified time.

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
comma-separated list of extensions without dots; anything else is `400 invalid_request`. Locally
the listing walks the project root, skipping git-ignored and hidden paths, `target/`, and anything
that resolves outside the root. `formats` is empty until the server can read a file.

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

### `POST /api/secrets/`

Stores one secret value under a name. This is the account secret API Visivo Cloud already serves
(VIS-941, `apps/accounts`); studio serves the same request from the project's `.env`.

Request:

```json
{"key": "WAREHOUSE_PASSWORD", "value": "typed value"}
```

`201`: `{"key": "WAREHOUSE_PASSWORD"}`. Cloud also returns the secret's `id` and audit fields.

- `key` is an environment variable name: `^[A-Za-z_][A-Za-z0-9_]*$`.
- An existing key is never overwritten. It answers `409`.
- Studio writes the value to the project's `.env`, adds `.env` to `.gitignore`, and makes the value
  available to the running server at once. Cloud writes it to the account's secret store, and runs
  receive it as an environment variable.
- Cloud allows account admins only. The person who creates an account is its admin. Anyone else
  gets `404`, as on every account admin route. Cloud finds the account from `?project_id=`.
- Cloud errors keep the account API's shape, `{"errors": …}`. For this route the viewer branches
  on the status, not on `code`.

Errors: `400` (bad key or empty value), `404` (cloud: not an account admin), `409` (key exists).

## Storing a typed credential

The source form never sends a typed secret to a connection test or a draft. Before **Test
connection** and **Save**, the viewer does this for each secret field (`password`,
`credentials_base64`, `private_key_passphrase`) that holds a typed value:

1. Skip a value that is empty, masked (`**********`, "keep the current one") or already a
   `${env.NAME}` reference.
2. Name it `<SOURCE>_<FIELD>` in upper case, with every other character replaced by `_`, for
   example `WAREHOUSE_PASSWORD`. If the name is in the capabilities' `secret_keys`, or the server
   answers `409`, try `WAREHOUSE_PASSWORD_2`, then `_3`.
3. `POST /api/secrets/` with that key and the typed value.
4. Replace the field's value with `${env.WAREHOUSE_PASSWORD}`.

The viewer then sends that config to `POST /api/source-connections/` and `POST /api/sources/{name}/`.
If the server answers `404` or `403`, the form says that only an account admin can add a secret,
and offers the existing secrets instead.

## Django route names

For `core/api/apps/deploys/urls.py`:

| Path | Name |
| -- | -- |
| `api/project-files/` | `project_file_list` |
| `api/project-files/uploads/` | `project_file_upload_list` |
| `api/project-files/uploads/<str:upload_id>/complete/` | `project_file_upload_complete` |

`api/secrets/` already exists as `secret_list` in `core/api/apps/accounts/urls.py`.
