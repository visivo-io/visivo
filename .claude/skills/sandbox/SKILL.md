---
name: sandbox
description: Start, stop or test the isolated visivo sandbox on ports 8001 (backend) and 3001 (frontend). Use whenever a running server is needed for testing; never start servers by hand.
---

# Sandbox

The sandbox keeps Claude's servers off the developer's ports (8000 and 3000). One script manages it, run from the `visivo/` repo root:

```bash
bash scripts/sandbox.sh start    # backend :8001 + frontend :3001
bash scripts/sandbox.sh stop
bash scripts/sandbox.sh status
bash scripts/sandbox.sh test     # start backend, run endpoint tests, stop
bash scripts/sandbox.sh restart
```

## Steps

1. `bash scripts/sandbox.sh status`
2. If not running, `bash scripts/sandbox.sh start` and wait for "Sandbox ready".
3. Use `http://localhost:8001` (API) and `http://localhost:3001` (viewer). Point the Playwright MCP at `:3001`, never `:3000`.
4. Logs: `.sandbox/backend.log`, `.sandbox/frontend.log`. PIDs are tracked in `.sandbox/`.

## Rules

- Never start a server on 8000 or 3000.
- Never start servers with ad-hoc commands. Always use the script.
- Parallel sandboxes: set `VISIVO_SANDBOX_BACKEND_PORT`, `VISIVO_SANDBOX_FRONTEND_PORT` and `VISIVO_SANDBOX_NAME` before the script.
