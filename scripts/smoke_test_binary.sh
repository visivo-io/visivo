#!/bin/bash
# Smoke-test the PyInstaller-built Visivo binary by running a REAL command.
#
# Unit tests (e.g. tests/commands/test_version.py) invoke the CLI through
# Click's CliRunner *in the dev Python environment*. They import visivo from
# source against a consistent set of installed dependencies, so they cannot
# catch defects that only exist in the bundled artifact -- for example a
# compiled extension (jsonschema_rs.abi3.so) bundled at a different version
# than its pure-Python __init__.py, which fails at import time with
# "cannot import name 'EmailOptions'".
#
# This script runs the ACTUAL built executable against a real project so that
# both import-time breakage and end-to-end execution failures fail the build
# instead of shipping to users.
#
# Usage:
#   bash scripts/smoke_test_binary.sh [dist-dir] [project-dir]
#   dist-dir     PyInstaller --onedir output  (default: dist/visivo)
#   project-dir  a runnable visivo project     (default: test-projects/docs-examples)

set -euo pipefail

DIST_DIR="${1:-dist/visivo}"
PROJECT_DIR="${2:-test-projects/docs-examples}"

if [ -f "$DIST_DIR/visivo.exe" ]; then
  BIN="$DIST_DIR/visivo.exe"
elif [ -f "$DIST_DIR/visivo" ]; then
  BIN="$DIST_DIR/visivo"
else
  echo "ERROR: no built visivo binary found in '$DIST_DIR'." >&2
  echo "Run 'poetry run build' first." >&2
  exit 1
fi

# Resolve to an absolute path so the binary still works after we cd into the
# project directory.
BIN="$(cd "$(dirname "$BIN")" && pwd)/$(basename "$BIN")"

echo "Smoke-testing built binary: $BIN"

# `--version` forces command_line.py to import every subcommand (serve, run,
# compile, ...), which transitively imports the full model tree and native
# extensions. Any bundled import error surfaces here.
echo "--- visivo --version ---"
version_output="$("$BIN" --version)"
echo "$version_output"
# Click's --version uses sys.argv[0] as the program name, so the executable
# prints "visivo, version X" on Linux/macOS but "visivo.exe, version X" on
# Windows. Accept either, and require a digit after "version " so the
# assertion still catches garbage output.
if ! echo "$version_output" | grep -Eq "visivo(\.exe)?, version [0-9]"; then
  echo "ERROR: '--version' did not print expected output." >&2
  exit 1
fi

# Run a real command against a real project. This exercises the whole pipeline
# (parse -> compile -> DAG -> query execution -> data files), catching bundle
# defects that only manifest during actual execution rather than at startup.
if [ ! -d "$PROJECT_DIR" ]; then
  echo "ERROR: project dir '$PROJECT_DIR' not found." >&2
  exit 1
fi

echo "--- visivo compile (project: $PROJECT_DIR) ---"
( cd "$PROJECT_DIR" && "$BIN" compile )

echo "--- visivo run (project: $PROJECT_DIR) ---"
( cd "$PROJECT_DIR" && "$BIN" run )

echo "Smoke test passed: built binary starts, imports cleanly, and runs a project."
