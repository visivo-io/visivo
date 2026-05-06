#!/bin/bash
# Wrapper around scripts/sandbox.sh that points the sandbox at the
# save-flow-immediate-write fixture on ports :3019/:8019. Used by
# the Branch 9 e2e spec to validate the immediate-write save behavior
# on a fresh project (no models / insights / dashboards).
#
# Usage: bash scripts/sandbox-save-flow.sh {start|stop|status|test|restart}

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

export VISIVO_SANDBOX_BACKEND_PORT="${VISIVO_SANDBOX_BACKEND_PORT:-8019}"
export VISIVO_SANDBOX_FRONTEND_PORT="${VISIVO_SANDBOX_FRONTEND_PORT:-3019}"
export VISIVO_SANDBOX_PROJECT_DIR="$PROJECT_DIR/test-projects/save-flow-immediate-write"
export VISIVO_SANDBOX_NAME="save-flow"

bash "$SCRIPT_DIR/sandbox.sh" "$@"
