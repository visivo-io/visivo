# Agent Contract

Two CLI affordances exist so that an LLM agent can author a Visivo project by
reading the grammar instead of guessing at it, and can read command results
structurally instead of scraping log lines.

- `visivo schema` — the project JSON Schema, small enough to put in a prompt.
- `--json` on `visivo compile`, `visivo run` and `visivo test` — one JSON object
  on stdout describing what happened.

Both write to **stdout** and send every human-readable line to **stderr**, so
`visivo schema > core.json` and `visivo compile --json | jq` work unmodified.

---

## `visivo schema`

```bash
visivo schema                  # the core authoring subset (default)
visivo schema -o core.json     # write it to a file
visivo schema --indent 2       # pretty-print
visivo schema --full           # the complete schema, Plotly vocabularies included
visivo schema --props bar      # every Plotly property valid for `props: {type: bar}`
visivo schema --layout         # every Plotly layout property
```

### Why there is a core subset

The schema that ships with Visivo, and that the viewer validates against, is
about 3.3 MB across 103 definitions. Most of that is the Plotly property
vocabulary: the `Layout` definition alone is over 400 KB, and there is one
definition per chart type. No agent can hold that in a prompt.

The core subset is about 90 KB — roughly 23k tokens, small enough to cache in a
system prompt — and describes the objects you actually write in
`project.visivo.yml`: sources, models, metrics, dimensions, relations, insights,
charts, tables, markdowns, inputs, dashboards and tests.

### How the subset is chosen

The subset is derived mechanically every time the command runs, so it cannot
drift from the models. The rule, in full, lives in the module docstring of
`visivo/commands/schema_phase.py`; in short:

1. Build from the Pydantic dump of `Project`, before the vendored Plotly JSON is
   merged in. That single choice prunes every trace-prop definition and the
   large `Layout` — and prunes any Plotly type added in future automatically.
2. Keep only the project fields you author by hand. `dbt`, `alerts`,
   `destinations` and the machine-set bookkeeping fields are out, each with a
   stated reason recorded in the emitted schema itself.
3. Take the transitive `$ref` closure of what is left and drop everything
   unreachable.
4. Delete the fields the CLI fills in — `path`, `file_path`, `project_file_path`,
   `project_dir`, `cli_version` — from every object.
5. Delete Pydantic's auto-generated property titles, which restate the key.
6. Restore the aliases that only carry a trailing underscore because the name is
   a Python keyword, so a test's gate is spelled `if`, as the docs show, and the
   `if_` spelling is marked deprecated.

Nothing dangles as a result. `props` stays an open object that requires `type`,
and `layout` stays an open object; when an agent needs the real Plotly
vocabulary for one chart type it asks for it with `visivo schema --props bar`.

The emitted document carries an `x-visivo-schema` block naming the mode, the CLI
version, what was omitted and why, and the commands that return the omitted
parts.

!!! note "Authoring vs. compiler output"
    Because step 4 removes the machine-set fields and every Visivo object
    forbids unknown keys, the core schema rejects a document that carries them —
    notably the `project.json` written at compile time. Validate hand-written
    YAML with the core schema; validate compiler output with `--full`.

---

## `--json` on compile, run and test

```bash
visivo compile --json
visivo run --json
visivo test --json
```

Each prints exactly one JSON object on stdout and nothing else. The exit code is
unchanged, so `visivo run --json && visivo test --json` still short-circuits.

### The envelope

Every key is always present.

```json
{
  "visivo_json_version": 1,
  "command": "compile",
  "success": true,
  "cli_version": "2.1.1",
  "duration_ms": 812,
  "result": { },
  "errors": [ ]
}
```

| Key | Meaning |
| --- | --- |
| `visivo_json_version` | Bumped when the shape changes in a way a consumer would notice. |
| `command` | `compile`, `run` or `test`. |
| `success` | Whether the command achieved what it was asked to do. |
| `cli_version` | The CLI that produced the document. |
| `duration_ms` | Wall clock for the command body. |
| `result` | Command-specific; see below. |
| `errors` | Always a list, empty on success. |

### Errors

Each entry has the same seven keys. Any of `name`, `file`, `line`,
`object_path` and `details` may be `null` when the CLI genuinely does not know
the value, so a consumer can index without guarding.

```json
{
  "code": "bad_reference",
  "name": "revenue_by_month",
  "message": "The reference \"ref(orders)\" does not point to an object.",
  "file": "project.visivo.yml",
  "line": 31,
  "object_path": "project.insights[0]",
  "details": null
}
```

`code` is the machine-readable kind: a Pydantic error type such as
`bad_reference` or `extra_forbidden` for configuration problems, `job_failed`
for a query that did not run, `test_failed` for a failing assertion, and
`cli_error` for a usage or YAML-syntax problem.

### `compile` result

What the CLI actually parsed, so an agent can confirm the object it just wrote
was picked up:

```json
{
  "project_name": "EV Sales",
  "working_dir": "/work",
  "output_dir": "/work/target",
  "objects": { "models": ["ev_sales"], "insights": ["units_by_quarter"], "…": [] },
  "object_counts": { "models": 1, "insights": 1 }
}
```

### `run` result

One entry per job the DAG runner executed, with the runner's alignment padding
removed:

```json
{
  "project_name": "EV Sales",
  "output_dir": "/work/target",
  "jobs": [
    {
      "name": "units_by_quarter",
      "type": "Insight",
      "success": false,
      "summary": "Failed job for insight units_by_quarter",
      "error": "Column 'quarter' not found on model 'ev_sales'.",
      "artifact": "target/insights/units_by_quarter/query.sql"
    }
  ],
  "job_counts": { "succeeded": 2, "failed": 1, "total": 3 }
}
```

Every failed job also appears in `errors` with `"code": "job_failed"`.

A `--json` run reports **every** failing job in one pass rather than stopping at
the first failing dashboard, which is the one behavioral difference from a
plain `visivo run`.

### `test` result

```json
{
  "project_name": "EV Sales",
  "output_dir": "/work/target",
  "tests": [
    { "test_id": "project.tests[0]", "name": "quarters-present", "passed": true, "message": null }
  ],
  "test_counts": { "passed": 1, "failed": 0, "total": 1 }
}
```

Every failing assertion also appears in `errors` with `"code": "test_failed"`.

---

## A minimal agent loop

```bash
visivo schema -o core.json          # read the grammar once, cache it
# ...write project.visivo.yml against it...
visivo compile --json || exit 1     # errors carry name, file and line
visivo run --json
visivo test --json
```
