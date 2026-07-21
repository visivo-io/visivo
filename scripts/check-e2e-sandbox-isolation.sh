#!/bin/bash
#
# check-e2e-sandbox-isolation.sh — guardrail against cross-sandbox e2e traffic.
#
# Playwright specs drive the browser at the FRONTEND (`PLAYWRIGHT_BASE_URL`) but
# assert against the BACKEND directly via `page.request.*`, including afterEach
# cleanup that DELETEs the records the spec created. Those two addresses must
# belong to the SAME sandbox.
#
# 34 spec files used to derive the backend address per-file with the port pinned
# to 8001:
#
#     const apiBase = `${u.protocol}//${u.hostname}:8001`;
#     const API = BASE_URL.replace(':3001', ':8001');   // a no-op off :3001
#
# so an agent on its own sandbox (`PLAYWRIGHT_BASE_URL=http://localhost:3062`)
# drove :3062 in the browser while every backend read, write, and cleanup DELETE
# went to :8001 — a different sandbox. That corrupts both runs, and it is nearly
# invisible: the foreign sandbox just loses records mid-test, and the local run's
# "backend-asserted" claims describe a project it never touched. It was found
# when five gate failures turned out to be a concurrent agent's cleanup deleting
# the gate's own explorations.
#
# The fix is `viewer/e2e/helpers/sandbox.mjs`, which derives the backend address
# from the frontend one. This script fails if a spec reintroduces a literal
# backend port in code.
#
# Scope / exclusions:
#   - Only scans `viewer/e2e`.
#   - Skips the shared helper itself (it owns the fallback literal).
#   - Skips comment lines (`//`, ` * `) — docs may cite ports freely.
#
# Usage (run from the visivo/ repo root):
#   bash scripts/check-e2e-sandbox-isolation.sh
#
# Exit codes: 0 = clean, 1 = at least one hardcoded backend port found.
#
# NOTE: intentionally NOT wired into package.json (that needs approval).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
E2E_DIR="$ROOT_DIR/viewer/e2e"

if [ ! -d "$E2E_DIR" ]; then
    echo "ERROR: $E2E_DIR not found — run this from the visivo/ repo root."
    exit 1
fi

# Backend ports follow the 8xxx convention paired with a 3xxx frontend.
hits=$(grep -rnE "localhost:8[0-9]{3}|:8[0-9]{3}\`|':8[0-9]{3}'" "$E2E_DIR" \
    --include='*.mjs' \
    | grep -v "/helpers/sandbox.mjs:" \
    | grep -vE "^[^:]+:[0-9]+: *(//|\*)" \
    || true)

if [ -n "$hits" ]; then
    echo "Hardcoded backend port(s) found in viewer/e2e — these send backend"
    echo "traffic to a fixed sandbox regardless of PLAYWRIGHT_BASE_URL:"
    echo
    echo "$hits"
    echo
    echo "Import { apiBase } (or { API }) from '../helpers/sandbox.mjs' instead."
    exit 1
fi

echo "e2e sandbox isolation: clean (no hardcoded backend ports)."
