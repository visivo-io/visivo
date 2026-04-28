#!/bin/bash
# Manage the isolated sandbox environment for Claude Code testing.
# Defaults to port 8001 (backend) / 3001 (frontend) pointed at
# test-projects/integration, to avoid conflicting with user's dev
# servers on 8000/3000.
#
# Env-var overrides (all optional):
#   VISIVO_SANDBOX_BACKEND_PORT   default 8001
#   VISIVO_SANDBOX_FRONTEND_PORT  default 3001
#   VISIVO_SANDBOX_PROJECT_DIR    default <repo>/test-projects/integration
#   VISIVO_SANDBOX_NAME           default "" (used as PID/log dir suffix)
#
# Usage:
#   bash scripts/sandbox.sh start    — Start backend + frontend
#   bash scripts/sandbox.sh stop     — Stop both servers
#   bash scripts/sandbox.sh status   — Check if servers are running
#   bash scripts/sandbox.sh test     — Start servers, run endpoint tests, stop servers
#   bash scripts/sandbox.sh restart  — Stop then start

set -e

BACKEND_PORT="${VISIVO_SANDBOX_BACKEND_PORT:-8001}"
FRONTEND_PORT="${VISIVO_SANDBOX_FRONTEND_PORT:-3001}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
INTEGRATION_DIR="${VISIVO_SANDBOX_PROJECT_DIR:-$PROJECT_DIR/test-projects/integration}"
VIEWER_DIR="$PROJECT_DIR/viewer"
VENV_ACTIVATE="$PROJECT_DIR/venv12/bin/activate"
# Fall back to poetry's .venv if venv12 isn't present.
if [ ! -f "$VENV_ACTIVATE" ] && [ -f "$PROJECT_DIR/.venv/bin/activate" ]; then
    VENV_ACTIVATE="$PROJECT_DIR/.venv/bin/activate"
fi
# Keep PID dirs per-sandbox-name so multiple sandboxes can coexist.
SANDBOX_NAME="${VISIVO_SANDBOX_NAME:-}"
if [ -n "$SANDBOX_NAME" ]; then
    PID_DIR="$PROJECT_DIR/.sandbox-$SANDBOX_NAME"
else
    PID_DIR="$PROJECT_DIR/.sandbox"
fi

backend_pid_file="$PID_DIR/backend.pid"
frontend_pid_file="$PID_DIR/frontend.pid"

mkdir -p "$PID_DIR"

is_port_in_use() {
    lsof -i ":$1" -sTCP:LISTEN -t >/dev/null 2>&1
}

get_pid() {
    local pid_file="$1"
    if [ -f "$pid_file" ]; then
        local pid
        pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            echo "$pid"
            return 0
        fi
        rm -f "$pid_file"
    fi
    return 1
}

start_backend() {
    if is_port_in_use "$BACKEND_PORT"; then
        echo "Backend already running on :$BACKEND_PORT"
        return 0
    fi

    if [ ! -f "$VENV_ACTIVATE" ]; then
        echo "ERROR: venv12 not found at $VENV_ACTIVATE"
        exit 1
    fi

    echo "Starting backend on :$BACKEND_PORT..."
    (
        source "$VENV_ACTIVATE"
        cd "$INTEGRATION_DIR"
        STACKTRACE=true visivo serve --port "$BACKEND_PORT" > "$PID_DIR/backend.log" 2>&1
    ) &
    echo $! > "$backend_pid_file"

    # Wait for ready
    for i in $(seq 1 30); do
        if curl -s "http://localhost:$BACKEND_PORT/data/project.json" >/dev/null 2>&1; then
            echo "Backend ready on :$BACKEND_PORT"
            return 0
        fi
        sleep 1
    done

    echo "ERROR: Backend did not become ready within 30s"
    return 1
}

start_frontend() {
    if is_port_in_use "$FRONTEND_PORT"; then
        echo "Frontend already running on :$FRONTEND_PORT"
        return 0
    fi

    echo "Starting frontend on :$FRONTEND_PORT..."
    (
        cd "$VIEWER_DIR"
        source ~/.nvm/nvm.sh
        nvm use
        VITE_BACKEND_PORT=$BACKEND_PORT VITE_PORT=$FRONTEND_PORT yarn start:local > "$PID_DIR/frontend.log" 2>&1
    ) &
    echo $! > "$frontend_pid_file"

    # Wait for ready
    for i in $(seq 1 30); do
        if curl -s "http://localhost:$FRONTEND_PORT" >/dev/null 2>&1; then
            echo "Frontend ready on :$FRONTEND_PORT"
            return 0
        fi
        sleep 1
    done

    echo "ERROR: Frontend did not become ready within 30s"
    return 1
}

stop_process() {
    local pid_file="$1"
    local name="$2"
    local pid
    if pid=$(get_pid "$pid_file"); then
        echo "Stopping $name (PID $pid)..."
        kill "$pid" 2>/dev/null || true
        wait "$pid" 2>/dev/null || true
        rm -f "$pid_file"
    else
        echo "$name not running"
    fi
}

stop_by_port() {
    local port="$1"
    local name="$2"
    local pids
    pids=$(lsof -i ":$port" -sTCP:LISTEN -t 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "Stopping $name on :$port (PIDs: $pids)..."
        echo "$pids" | xargs kill 2>/dev/null || true
    fi
}

cmd_start() {
    start_backend
    start_frontend
    echo ""
    echo "Sandbox ready:"
    echo "  Backend:  http://localhost:$BACKEND_PORT"
    echo "  Frontend: http://localhost:$FRONTEND_PORT"
}

cmd_stop() {
    stop_process "$backend_pid_file" "backend"
    stop_process "$frontend_pid_file" "frontend"
    # Also kill by port in case PIDs are stale
    stop_by_port "$BACKEND_PORT" "backend"
    stop_by_port "$FRONTEND_PORT" "frontend"
    echo "Sandbox stopped"
}

cmd_status() {
    echo "Sandbox status:"
    if is_port_in_use "$BACKEND_PORT"; then
        echo "  Backend:  RUNNING on :$BACKEND_PORT"
    else
        echo "  Backend:  STOPPED"
    fi
    if is_port_in_use "$FRONTEND_PORT"; then
        echo "  Frontend: RUNNING on :$FRONTEND_PORT"
    else
        echo "  Frontend: STOPPED"
    fi
}

cmd_test() {
    start_backend
    python "$PROJECT_DIR/tests/sandbox/test_sandbox_endpoints.py" --port "$BACKEND_PORT"
    local exit_code=$?
    cmd_stop
    exit $exit_code
}

cmd_restart() {
    cmd_stop
    sleep 1
    cmd_start
}

case "${1:-status}" in
    start)   cmd_start ;;
    stop)    cmd_stop ;;
    status)  cmd_status ;;
    test)    cmd_test ;;
    restart) cmd_restart ;;
    *)
        echo "Usage: bash scripts/sandbox.sh {start|stop|status|test|restart}"
        exit 1
        ;;
esac
