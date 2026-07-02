#!/bin/bash
#
# check-no-native-select.sh — guardrail against off-brand native <select> menus.
#
# The viewer's native HTML <select> elements were all replaced by the shared
# brand component `viewer/src/components/common/Select.jsx` (a react-select
# wrapper that portals past popover/canvas clipping so menus show up on screen
# shares). Native <select> is invisible-on-screen-share and off-brand, so this
# script fails (non-zero exit) if any new native `<select` JSX tag is added back
# to viewer/src.
#
# Scope / exclusions:
#   - Only scans `viewer/src`.
#   - Skips test files (*.test.*) — they may reference the string in fixtures.
#   - Skips the wrapper itself (common/Select.jsx) — it's allowed to mention it.
#   - Skips pure documentation references like `<select>` inside JS comments by
#     requiring the match to NOT be inside a `//`/` * ` comment line and to look
#     like a JSX opening tag (`<select` followed by whitespace, newline, or `>`).
#
# Usage (run from the visivo/ repo root):
#   bash scripts/check-no-native-select.sh
#
# Exit codes: 0 = clean, 1 = at least one native <select> found (paths printed).
#
# NOTE: intentionally NOT wired into package.json (that needs approval). Run it
# manually or wire it into CI separately.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT_DIR/viewer/src"

if [ ! -d "$SRC_DIR" ]; then
  echo "check-no-native-select: cannot find $SRC_DIR" >&2
  exit 2
fi

# Match a JSX opening `<select` tag: `<select` immediately followed by a space,
# tab, newline, or `>`. Exclude comment lines (// or leading * ) so doc comments
# that merely mention `<select>` don't trip the guard. Exclude test files and the
# wrapper component.
matches="$(grep -rnE '<select([[:space:]>]|$)' "$SRC_DIR" \
  --include='*.jsx' --include='*.js' --include='*.tsx' --include='*.ts' \
  | grep -vE '\.test\.' \
  | grep -vE '/common/Select\.jsx:' \
  | grep -vE ':[[:space:]]*//' \
  | grep -vE ':[[:space:]]*\*' \
  || true)"

if [ -n "$matches" ]; then
  echo "ERROR: native <select> found in viewer/src. Use the brand <Select> from" >&2
  echo "       components/common/Select.jsx (native <select> is off-brand and" >&2
  echo "       invisible on screen shares):" >&2
  echo "" >&2
  echo "$matches" >&2
  exit 1
fi

echo "OK: no native <select> in viewer/src."
exit 0
