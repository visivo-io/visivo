---
name: verify
description: Run the right test layers for the files changed in this repo. Use after any edit in visivo/ and before declaring work done.
---

# Verify

All commands run from the `visivo/` repo root.

## Steps

1. Find the changed files: `git diff --name-only HEAD` plus `git status --porcelain` for untracked files.
2. Classify them:
   - Python under `visivo/` → Python tests and the Black check.
   - JS or JSX under `viewer/` → viewer tests and lint.
   - Anything under `visivo/server/views/` or a manager → also the sandbox endpoint tests.
   - UI components → also a Playwright visual check.
   - Anything under `visivo/models/` → regenerate the schema.
3. Run the layers that apply.

### Python

```bash
poetry run pytest tests/ -x --tb=short -q
poetry run black --check --target-version py312 .
```

If Black reports unformatted files in your changed paths, run `poetry run black .` and re-check.

### Pydantic models

```bash
python -m visivo.generate_project_schema_json
```

Commit the regenerated `visivo/src/visivo_project_schema.json` with the model change.

### Viewer

```bash
bash scripts/viewer-check.sh            # all tests and lint
bash scripts/viewer-check.sh <pattern>  # one component
```

### Server views or managers

```bash
bash scripts/sandbox.sh test
```

### UI components

Start the sandbox (`bash scripts/sandbox.sh start`), then with the Playwright MCP open `http://localhost:3001`, check the console for errors, take a screenshot on desktop and mobile widths, and confirm no blank panels and no dark-on-dark or light-on-light combinations.

4. Report:

```
## Verify Results
- Unit tests (Python): PASS/FAIL (n tests)
- Unit tests (JS): PASS/FAIL (n tests)
- Lint: PASS/FAIL
- Black: PASS/FAIL
- Schema regenerated: YES/NO/N/A
- Sandbox: PASS/FAIL/SKIPPED
- Visual: PASS/FAIL/SKIPPED
- Overall: PASS/FAIL
```

## Rules

- Never dismiss a failure as pre-existing. Fix it.
- Never declare work done with a failing layer.
