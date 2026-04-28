#!/bin/bash
# Thin wrapper around scripts/sandbox.sh that points the sandbox at the
# explorer-publish-e2e test project on ports :3002/:8002, isolated from
# both the user's dev servers (:3000/:8000) and the default Claude sandbox
# (:3001/:8001).
#
# Usage: bash scripts/sandbox-publish.sh {start|stop|status|test|restart}

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

export VISIVO_SANDBOX_BACKEND_PORT=8002
export VISIVO_SANDBOX_FRONTEND_PORT=3002
export VISIVO_SANDBOX_PROJECT_DIR="$PROJECT_DIR/test-projects/explorer-publish-e2e"
export VISIVO_SANDBOX_NAME="publish"

bash "$SCRIPT_DIR/sandbox.sh" "$@"
