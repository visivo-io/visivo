#!/bin/bash
# Manage the isolated docs sandbox (MkDocs site) for Claude Code testing.
# Defaults to port 8003 to avoid conflicting with the user's dev servers
# (8000/3000) and the other sandboxes (8001/3001, 8002/3002).
#
# Env-var overrides (all optional):
#   VISIVO_DOCS_PORT   default 8003
#
# Usage:
#   bash scripts/docs_sandbox.sh start             — gen (docs_gen.sh steps 1-3) + mkdocs serve
#   bash scripts/docs_sandbox.sh start --no-gen    — skip generation, just serve
#   bash scripts/docs_sandbox.sh start --static    — full docs_gen.sh, then http.server on mkdocs_build
#   bash scripts/docs_sandbox.sh stop              — stop the docs server
#   bash scripts/docs_sandbox.sh status            — check if the docs server is running
#   bash scripts/docs_sandbox.sh test              — start, link-crawl + Playwright docs suite, stop
#   bash scripts/docs_sandbox.sh restart           — stop then start

set -e

DOCS_PORT="${VISIVO_DOCS_PORT:-8003}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VIEWER_DIR="$PROJECT_DIR/viewer"
PID_DIR="$PROJECT_DIR/.sandbox-docs"

docs_pid_file="$PID_DIR/docs.pid"

mkdir -p "$PID_DIR"

# Optional flags for `start` / `restart` / `test`
NO_GEN=false
STATIC=false
for arg in "${@:2}"; do
    case "$arg" in
        --no-gen) NO_GEN=true ;;
        --static) STATIC=true ;;
        *)
            echo "Unknown flag: $arg"
            echo "Usage: bash scripts/docs_sandbox.sh {start|stop|status|test|restart} [--no-gen] [--static]"
            exit 1
            ;;
    esac
done

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

run_gen() {
    if [ "$NO_GEN" = true ]; then
        echo "Skipping docs generation (--no-gen)"
        return 0
    fi
    if [ "$STATIC" = true ]; then
        # Static mode serves mkdocs_build/, so run the FULL pipeline (incl. build).
        bash "$SCRIPT_DIR/docs_gen.sh"
    else
        # mkdocs serve builds on startup, so only run gen steps 1-3.
        bash "$SCRIPT_DIR/docs_gen.sh" --skip-build
    fi
}

start_docs() {
    if is_port_in_use "$DOCS_PORT"; then
        echo "Docs server already running on :$DOCS_PORT"
        return 0
    fi

    run_gen

    if [ "$STATIC" = true ]; then
        if [ ! -d "$PROJECT_DIR/mkdocs_build" ]; then
            echo "ERROR: mkdocs_build/ not found — run bash scripts/docs_gen.sh first"
            exit 1
        fi
        echo "Starting static docs server on :$DOCS_PORT..."
        # Redirect the WHOLE subshell (not just the server command) and detach
        # stdin, so the background server holds no reference to the caller's
        # stdout pipe — otherwise `docs_sandbox.sh start | tee/tail` never
        # sees EOF and hangs after the script exits.
        (
            cd "$PROJECT_DIR"
            exec python3 -m http.server "$DOCS_PORT" --directory mkdocs_build
        ) > "$PID_DIR/mkdocs.log" 2>&1 < /dev/null &
        echo $! > "$docs_pid_file"
    else
        echo "Starting mkdocs serve on :$DOCS_PORT..."
        (
            cd "$PROJECT_DIR"
            export PYTHONPATH="$PROJECT_DIR"
            exec poetry run mkdocs serve -a "127.0.0.1:$DOCS_PORT"
        ) > "$PID_DIR/mkdocs.log" 2>&1 < /dev/null &
        echo $! > "$docs_pid_file"
    fi

    # Wait for ready — mkdocs serve rebuilds the whole site before listening,
    # so allow up to 90s (the reference build runs ~30-60s on a laptop).
    for i in $(seq 1 90); do
        if curl --head --silent --fail "http://127.0.0.1:$DOCS_PORT" >/dev/null 2>&1; then
            echo "Docs server ready on :$DOCS_PORT"
            return 0
        fi
        sleep 1
    done

    echo "ERROR: docs server did not become ready within 90s — see $PID_DIR/mkdocs.log"
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

run_link_crawl() {
    if ! command -v wget >/dev/null 2>&1; then
        echo "ERROR: wget is required for the link crawl — brew install wget"
        return 1
    fi
    echo "==> Link crawl: wget --recursive --spider http://127.0.0.1:$DOCS_PORT/ ..."
    local crawl_log="$PID_DIR/crawl.log"
    local crawl_status=0
    # --spider downloads nothing; mirror .rwx/test_docs.yml's grep filtering
    # (drop the per-URL "... 200 OK", unlink, and .tmp.tmp noise lines).
    (cd "$PID_DIR" && wget --recursive --no-verbose --spider "http://127.0.0.1:$DOCS_PORT/" > crawl.log 2>&1) \
        || crawl_status=$?
    grep -v -E 'OK$|^unlink|\.tmp\.tmp' "$crawl_log" || true
    if [ "$crawl_status" -ne 0 ]; then
        echo "ERROR: link crawl failed (wget exit $crawl_status) — broken links above (full log: $crawl_log)"
        return 1
    fi
    echo "Link crawl passed"
}

run_playwright() {
    local config="$VIEWER_DIR/playwright.docs.config.mjs"
    if [ ! -f "$config" ]; then
        echo "No viewer/playwright.docs.config.mjs found — skipping Playwright docs suite"
        return 0
    fi
    echo "==> Playwright docs suite..."
    (
        cd "$VIEWER_DIR"
        source ~/.nvm/nvm.sh
        nvm use
        VISIVO_DOCS_PORT="$DOCS_PORT" npx playwright test --config playwright.docs.config.mjs --reporter=list
    )
}

cmd_start() {
    start_docs
    echo ""
    echo "Docs sandbox ready:"
    echo "  Docs: http://127.0.0.1:$DOCS_PORT"
}

cmd_stop() {
    stop_process "$docs_pid_file" "docs server"
    # Also kill by port in case PIDs are stale
    stop_by_port "$DOCS_PORT" "docs server"
    echo "Docs sandbox stopped"
}

cmd_status() {
    echo "Docs sandbox status:"
    if is_port_in_use "$DOCS_PORT"; then
        echo "  Docs: RUNNING on :$DOCS_PORT"
    else
        echo "  Docs: STOPPED"
    fi
}

cmd_test() {
    local exit_code=0
    start_docs || exit_code=1
    if [ "$exit_code" -eq 0 ]; then
        run_link_crawl || exit_code=1
        run_playwright || exit_code=1
    fi
    cmd_stop
    if [ "$exit_code" -eq 0 ]; then
        echo "Docs sandbox test PASSED"
    else
        echo "Docs sandbox test FAILED"
    fi
    exit "$exit_code"
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
        echo "Usage: bash scripts/docs_sandbox.sh {start|stop|status|test|restart} [--no-gen] [--static]"
        exit 1
        ;;
esac
