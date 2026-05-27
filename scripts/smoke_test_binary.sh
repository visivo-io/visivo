#!/bin/bash
# Smoke-test the PyInstaller-built Visivo binary.
#
# Unit tests (e.g. tests/commands/test_version.py) invoke the CLI through
# Click's CliRunner *in the dev Python environment*. They import visivo from
# source against a consistent set of installed dependencies, so they cannot
# catch defects that only exist in the bundled artifact -- for example a
# compiled extension (jsonschema_rs.abi3.so) that was bundled at a different
# version than its pure-Python __init__.py, which fails at import time with
# "cannot import name 'EmailOptions'".
#
# This script runs the ACTUAL built executable so import-time breakage in the
# bundle fails the release build instead of shipping to users.
#
# Usage:
#   bash scripts/smoke_test_binary.sh [path-to-dist-dir]
# Defaults to dist/visivo (PyInstaller --onedir output).

set -euo pipefail

DIST_DIR="${1:-dist/visivo}"

if [ -f "$DIST_DIR/visivo.exe" ]; then
  BIN="$DIST_DIR/visivo.exe"
elif [ -f "$DIST_DIR/visivo" ]; then
  BIN="$DIST_DIR/visivo"
else
  echo "ERROR: no built visivo binary found in '$DIST_DIR'." >&2
  echo "Run 'poetry run build' first." >&2
  exit 1
fi

echo "Smoke-testing built binary: $BIN"

# `--version` and `--help` both force command_line.py to import every
# subcommand (serve, run, compile, ...), which transitively imports the full
# model tree and native extensions. Any bundled import error surfaces here.
echo "--- visivo --version ---"
version_output="$("$BIN" --version)"
echo "$version_output"
if ! echo "$version_output" | grep -q "visivo, version"; then
  echo "ERROR: '--version' did not print expected output." >&2
  exit 1
fi

echo "--- visivo --help ---"
"$BIN" --help >/dev/null

echo "Smoke test passed: built binary starts and imports cleanly."
