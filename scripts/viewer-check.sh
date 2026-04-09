#!/bin/bash
# Run viewer unit tests and lint. Use from the visivo/ directory:
#   bash scripts/viewer-check.sh
# Or with a test pattern:
#   bash scripts/viewer-check.sh explorerNewStore

cd "$(dirname "$0")/../viewer" || exit 1

source ~/.nvm/nvm.sh
nvm use

if [ -n "$1" ]; then
  echo "=== Running tests matching: $1 ==="
  yarn test --watchAll=false --testPathPattern="$1"
else
  echo "=== Running all tests ==="
  yarn test --watchAll=false
fi

TEST_EXIT=$?

echo ""
echo "=== Running lint ==="
yarn lint

LINT_EXIT=$?

if [ $TEST_EXIT -ne 0 ] || [ $LINT_EXIT -ne 0 ]; then
  echo ""
  echo "FAILED: tests=$TEST_EXIT lint=$LINT_EXIT"
  exit 1
fi

echo ""
echo "ALL PASSED"
