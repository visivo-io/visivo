#!/bin/bash
# Run sandbox endpoint tests against an isolated visivo serve instance.
# Uses port 8001 to avoid conflicting with user's dev server on 8000.
#
# Usage: bash scripts/run_sandbox_tests.sh [--port PORT]

set -e

PORT="${1:-8001}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
INTEGRATION_DIR="$PROJECT_DIR/test-projects/integration"
VENV_ACTIVATE="$PROJECT_DIR/venv12/bin/activate"

# Check if venv12 exists
if [ ! -f "$VENV_ACTIVATE" ]; then
    echo "ERROR: venv12 not found at $VENV_ACTIVATE"
    echo "Create it with: python3.12 -m venv venv12 && source venv12/bin/activate && pip install -e ."
    exit 1
fi

# Activate venv
source "$VENV_ACTIVATE"

# Check if port is already in use
if lsof -i ":$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "Port $PORT is already in use — running tests against existing server"
    python "$PROJECT_DIR/tests/sandbox/test_sandbox_endpoints.py" --port "$PORT"
    exit $?
fi

# Start visivo serve in background
echo "Starting visivo serve on port $PORT..."
cd "$INTEGRATION_DIR"
visivo serve --port "$PORT" &
SERVE_PID=$!

# Cleanup on exit
cleanup() {
    if [ -n "$SERVE_PID" ] && kill -0 "$SERVE_PID" 2>/dev/null; then
        echo "Stopping server (PID $SERVE_PID)..."
        kill "$SERVE_PID" 2>/dev/null
        wait "$SERVE_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT

# Wait for server to be ready
echo "Waiting for server to be ready..."
for i in $(seq 1 30); do
    if curl -s "http://localhost:$PORT/data/project.json" >/dev/null 2>&1; then
        echo "Server ready on port $PORT"
        break
    fi
    if ! kill -0 "$SERVE_PID" 2>/dev/null; then
        echo "ERROR: Server process died"
        exit 1
    fi
    sleep 1
done

# Check if server actually started
if ! curl -s "http://localhost:$PORT/data/project.json" >/dev/null 2>&1; then
    echo "ERROR: Server did not become ready within 30 seconds"
    exit 1
fi

# Run sandbox tests
cd "$PROJECT_DIR"
python tests/sandbox/test_sandbox_endpoints.py --port "$PORT"
EXIT_CODE=$?

exit $EXIT_CODE
