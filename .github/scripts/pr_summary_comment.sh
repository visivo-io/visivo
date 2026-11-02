#!/usr/bin/env bash
set -euo pipefail

source .diff_stats.env

# === Parse Python coverage for changed backend files ===
PY_COVERAGE_ROWS=""
if [ -f coverage-python.json ] && [ -s .be_prod_files.txt ]; then
  while IFS= read -r filepath; do
    [ -z "$filepath" ] && continue
    COV_PCT=$(python3 -c "
import json, sys
with open('coverage-python.json') as f:
    data = json.load(f)
target = '${filepath}'
for key, val in data.get('files', {}).items():
    if key.endswith(target) or key.endswith(target.lstrip('./')):
        summary = val.get('summary', {})
        total = summary.get('num_statements', 0)
        covered = summary.get('covered_lines', 0)
        pct = round(100 * covered / total, 1) if total > 0 else 100.0
        print(pct)
        sys.exit(0)
print('N/A')
" 2>/dev/null || echo "N/A")

    if [ "$COV_PCT" = "N/A" ]; then
      PY_COVERAGE_ROWS="${PY_COVERAGE_ROWS}| \`${filepath}\` | No data | :grey_question: |
"
    else
      IS_LOW=$(python3 -c "print('YES' if float('${COV_PCT}') < 50 else 'NO')" 2>/dev/null || echo "NO")
      if [ "$IS_LOW" = "YES" ]; then
        PY_COVERAGE_ROWS="${PY_COVERAGE_ROWS}| \`${filepath}\` | ${COV_PCT}% | :warning: Low |
"
      else
        PY_COVERAGE_ROWS="${PY_COVERAGE_ROWS}| \`${filepath}\` | ${COV_PCT}% | :white_check_mark: |
"
      fi
    fi
  done < .be_prod_files.txt
fi

# === Parse JS coverage for changed frontend files ===
JS_COVERAGE_ROWS=""
if [ -f coverage-js/coverage-summary.json ] && [ -s .fe_prod_files.txt ]; then
  while IFS= read -r filepath; do
    [ -z "$filepath" ] && continue
    RELATIVE_PATH=$(echo "$filepath" | sed 's|^viewer/||')
    COV_PCT=$(python3 -c "
import json, sys
with open('coverage-js/coverage-summary.json') as f:
    data = json.load(f)
target = '${RELATIVE_PATH}'
for key, val in data.items():
    if key == 'total':
        continue
    if key.endswith(target) or target in key:
        pct = val.get('lines', {}).get('pct', 'N/A')
        print(pct)
        sys.exit(0)
print('N/A')
" 2>/dev/null || echo "N/A")

    if [ "$COV_PCT" = "N/A" ]; then
      JS_COVERAGE_ROWS="${JS_COVERAGE_ROWS}| \`${filepath}\` | No data | :grey_question: |
"
    else
      IS_LOW=$(python3 -c "print('YES' if float('${COV_PCT}') < 50 else 'NO')" 2>/dev/null || echo "NO")
      if [ "$IS_LOW" = "YES" ]; then
        JS_COVERAGE_ROWS="${JS_COVERAGE_ROWS}| \`${filepath}\` | ${COV_PCT}% | :warning: Low |
"
      else
        JS_COVERAGE_ROWS="${JS_COVERAGE_ROWS}| \`${filepath}\` | ${COV_PCT}% | :white_check_mark: |
"
      fi
    fi
  done < .fe_prod_files.txt
fi

# === Compute totals ===
TOTAL_PROD_ADD=$((BE_PROD_ADD + FE_PROD_ADD))
TOTAL_PROD_DEL=$((BE_PROD_DEL + FE_PROD_DEL))
TOTAL_PROD_FILES=$((BE_PROD_FILES + FE_PROD_FILES))
TOTAL_TEST_ADD=$((BE_TEST_UNIT_ADD + BE_TEST_INT_ADD + BE_TEST_E2E_ADD + FE_TEST_UNIT_ADD + FE_TEST_E2E_ADD))
TOTAL_TEST_DEL=$((BE_TEST_UNIT_DEL + BE_TEST_INT_DEL + BE_TEST_E2E_DEL + FE_TEST_UNIT_DEL + FE_TEST_E2E_DEL))
TOTAL_TEST_FILES=$((BE_TEST_UNIT_FILES + BE_TEST_INT_FILES + BE_TEST_E2E_FILES + FE_TEST_UNIT_FILES + FE_TEST_E2E_FILES))

# === Build PR comment markdown ===
cat > /tmp/pr_comment.md << 'HEADER'
<!-- pr-summary -->
## PR Change Summary

### Production Code Changes
HEADER

cat >> /tmp/pr_comment.md << EOF
| Category | Files | Lines Added | Lines Removed |
|----------|------:|------------:|--------------:|
| **Backend (Python)** | ${BE_PROD_FILES} | +${BE_PROD_ADD} | -${BE_PROD_DEL} |
| **Frontend (JS/React)** | ${FE_PROD_FILES} | +${FE_PROD_ADD} | -${FE_PROD_DEL} |
| **Total Production** | **${TOTAL_PROD_FILES}** | **+${TOTAL_PROD_ADD}** | **-${TOTAL_PROD_DEL}** |

### Testing Code Changes

| Category | Files | Lines Added | Lines Removed |
|----------|------:|------------:|--------------:|
| Backend Unit | ${BE_TEST_UNIT_FILES} | +${BE_TEST_UNIT_ADD} | -${BE_TEST_UNIT_DEL} |
| Backend Integration | ${BE_TEST_INT_FILES} | +${BE_TEST_INT_ADD} | -${BE_TEST_INT_DEL} |
| Backend E2E/Sandbox | ${BE_TEST_E2E_FILES} | +${BE_TEST_E2E_ADD} | -${BE_TEST_E2E_DEL} |
| Frontend Unit | ${FE_TEST_UNIT_FILES} | +${FE_TEST_UNIT_ADD} | -${FE_TEST_UNIT_DEL} |
| Frontend E2E | ${FE_TEST_E2E_FILES} | +${FE_TEST_E2E_ADD} | -${FE_TEST_E2E_DEL} |
| **Total Testing** | **${TOTAL_TEST_FILES}** | **+${TOTAL_TEST_ADD}** | **-${TOTAL_TEST_DEL}** |
EOF

if [ "$OTHER_FILES" -gt 0 ]; then
  cat >> /tmp/pr_comment.md << EOF

> **Other files** (config, docs, scripts): ${OTHER_FILES} files (+${OTHER_ADD} / -${OTHER_DEL})
EOF
fi

# === Coverage gap section ===
if [ -n "$PY_COVERAGE_ROWS" ] || [ -n "$JS_COVERAGE_ROWS" ]; then
  cat >> /tmp/pr_comment.md << 'COVSECTION'

### Unit Test Coverage — Changed Production Files
COVSECTION

  if [ -n "$PY_COVERAGE_ROWS" ]; then
    cat >> /tmp/pr_comment.md << EOF

**Backend (Python)**
| File | Line Coverage | Status |
|------|-------------:|--------|
${PY_COVERAGE_ROWS}
EOF
  fi

  if [ -n "$JS_COVERAGE_ROWS" ]; then
    cat >> /tmp/pr_comment.md << EOF

**Frontend (JS/React)**
| File | Line Coverage | Status |
|------|-------------:|--------|
${JS_COVERAGE_ROWS}
EOF
  fi
fi

cat >> /tmp/pr_comment.md << 'FOOTER'

---
<sub>Generated by PR Summary workflow</sub>
FOOTER
