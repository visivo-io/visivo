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

# --- Second class: a FRONTEND base that ignores PLAYWRIGHT_BASE_URL ---------
#
# The check above only catches backend addresses. The same isolation break can
# happen on the browser side: a helper defining its own base URL from some
# other env var falls back to :3001 whenever that var isn't set, so every spec
# using it drives the SHARED sandbox no matter what PLAYWRIGHT_BASE_URL says.
#
# Real instance (found by a builder agent after the backend fix had landed):
#
#     export const BASE = process.env.VIS_CANVAS_BASE || 'http://localhost:3001';
#
# in `helpers/workspace.mjs` — 15 specs call its `openWorkspace()`, and all of
# them silently navigated to :3001 while their own sandbox sat idle. It is
# exactly the bug the backend fix addressed, in a file the backend-port regex
# can't see (its literal is a 3xxx port, not an 8xxx one).
#
# Rule, deliberately narrow: only a base that FALLS BACK TO :3001 — the shared
# sandbox — must consult PLAYWRIGHT_BASE_URL.
#
# Many specs legitimately declare their own base against a UNIQUE port
# (`VIS_CANVAS_DND_BASE || 'http://localhost:3008'`). That is the documented
# dedicated-per-spec-sandbox topology, not a bug: those specs bring their own
# sandbox on their own port and are meant to ignore the ambient one. Flagging
# them would put ~39 legitimate files in the report, and a check that cries
# wolf gets switched off — which would cost more than the bug it prevents.
#
# Falling back to :3001 is different in kind: :3001 is the SHARED sandbox, so
# an unset env var silently routes the spec onto whatever else is using it.
base_hits=$(grep -rnE "^ *(export )?const [A-Za-z_]*BASE[A-Za-z_]* *=.*localhost:3001" "$E2E_DIR" \
    --include='*.mjs' \
    | grep -v "/helpers/sandbox.mjs:" \
    | grep -vE "^[^:]+:[0-9]+: *(//|\*)" \
    || true)

offenders=""
while IFS= read -r line; do
    [ -z "$line" ] && continue
    file="${line%%:*}"
    rest="${line#*:}"
    lineno="${rest%%:*}"
    # Read the declaration plus the two following lines — these are commonly
    # wrapped by prettier across several lines.
    decl=$(sed -n "${lineno},$((lineno + 2))p" "$file")
    case "$decl" in
        *PLAYWRIGHT_BASE_URL*) ;;
        *process.env*) offenders="${offenders}${file}:${lineno}: ${decl%%$'\n'*}"$'\n' ;;
    esac
done <<< "$base_hits"

if [ -n "$offenders" ]; then
    echo "Frontend base URL(s) in viewer/e2e that ignore PLAYWRIGHT_BASE_URL —"
    echo "specs using these drive the SHARED sandbox whichever one you asked for:"
    echo
    echo "$offenders"
    echo "Import { BASE_URL } from '../helpers/sandbox.mjs', or include"
    echo "PLAYWRIGHT_BASE_URL in the fallback chain."
    exit 1
fi

echo "e2e sandbox isolation: clean (backend ports and frontend bases both honor the sandbox)."
