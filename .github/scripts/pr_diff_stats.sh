#!/usr/bin/env bash
set -euo pipefail

git fetch origin main
git diff --numstat origin/main...HEAD > /tmp/numstat.txt

BE_PROD_ADD=0; BE_PROD_DEL=0; BE_PROD_FILES=0
FE_PROD_ADD=0; FE_PROD_DEL=0; FE_PROD_FILES=0
BE_TEST_UNIT_ADD=0; BE_TEST_UNIT_DEL=0; BE_TEST_UNIT_FILES=0
BE_TEST_INT_ADD=0; BE_TEST_INT_DEL=0; BE_TEST_INT_FILES=0
BE_TEST_E2E_ADD=0; BE_TEST_E2E_DEL=0; BE_TEST_E2E_FILES=0
FE_TEST_UNIT_ADD=0; FE_TEST_UNIT_DEL=0; FE_TEST_UNIT_FILES=0
FE_TEST_E2E_ADD=0; FE_TEST_E2E_DEL=0; FE_TEST_E2E_FILES=0
OTHER_ADD=0; OTHER_DEL=0; OTHER_FILES=0

> /tmp/be_prod_files.txt
> /tmp/fe_prod_files.txt

while IFS=$'\t' read -r added deleted filepath; do
  [ "$added" = "-" ] && continue

  # Resolve git rename syntax "dir/{old => new}/file" → "dir/new/file"
  # so existence checks below match the post-rename location.
  if echo "$filepath" | grep -q '{.* => .*}'; then
    filepath=$(echo "$filepath" | sed 's|{[^}]* => \([^}]*\)}|\1|')
  fi

  if echo "$filepath" | grep -qE '^tests/integration/'; then
    BE_TEST_INT_ADD=$((BE_TEST_INT_ADD + added))
    BE_TEST_INT_DEL=$((BE_TEST_INT_DEL + deleted))
    BE_TEST_INT_FILES=$((BE_TEST_INT_FILES + 1))
  elif echo "$filepath" | grep -qE '^tests/sandbox/'; then
    BE_TEST_E2E_ADD=$((BE_TEST_E2E_ADD + added))
    BE_TEST_E2E_DEL=$((BE_TEST_E2E_DEL + deleted))
    BE_TEST_E2E_FILES=$((BE_TEST_E2E_FILES + 1))
  elif echo "$filepath" | grep -qE '^tests/'; then
    BE_TEST_UNIT_ADD=$((BE_TEST_UNIT_ADD + added))
    BE_TEST_UNIT_DEL=$((BE_TEST_UNIT_DEL + deleted))
    BE_TEST_UNIT_FILES=$((BE_TEST_UNIT_FILES + 1))
  elif echo "$filepath" | grep -qE '^viewer/e2e/'; then
    FE_TEST_E2E_ADD=$((FE_TEST_E2E_ADD + added))
    FE_TEST_E2E_DEL=$((FE_TEST_E2E_DEL + deleted))
    FE_TEST_E2E_FILES=$((FE_TEST_E2E_FILES + 1))
  elif echo "$filepath" | grep -qE '^viewer/src/.*\.test\.(js|jsx)$'; then
    FE_TEST_UNIT_ADD=$((FE_TEST_UNIT_ADD + added))
    FE_TEST_UNIT_DEL=$((FE_TEST_UNIT_DEL + deleted))
    FE_TEST_UNIT_FILES=$((FE_TEST_UNIT_FILES + 1))
  elif echo "$filepath" | grep -qE '^visivo/.*\.py$'; then
    BE_PROD_ADD=$((BE_PROD_ADD + added))
    BE_PROD_DEL=$((BE_PROD_DEL + deleted))
    BE_PROD_FILES=$((BE_PROD_FILES + 1))
    # Skip deleted files — coverage lookup has nothing to report on them.
    [ -f "$filepath" ] && echo "$filepath" >> /tmp/be_prod_files.txt
  elif echo "$filepath" | grep -qE '^viewer/src/'; then
    FE_PROD_ADD=$((FE_PROD_ADD + added))
    FE_PROD_DEL=$((FE_PROD_DEL + deleted))
    FE_PROD_FILES=$((FE_PROD_FILES + 1))
    # Skip deleted files — coverage lookup has nothing to report on them.
    [ -f "$filepath" ] && echo "$filepath" >> /tmp/fe_prod_files.txt
  else
    OTHER_ADD=$((OTHER_ADD + added))
    OTHER_DEL=$((OTHER_DEL + deleted))
    OTHER_FILES=$((OTHER_FILES + 1))
  fi
done < /tmp/numstat.txt

cat > .diff_stats.env << STATSEOF
BE_PROD_ADD=${BE_PROD_ADD}
BE_PROD_DEL=${BE_PROD_DEL}
BE_PROD_FILES=${BE_PROD_FILES}
FE_PROD_ADD=${FE_PROD_ADD}
FE_PROD_DEL=${FE_PROD_DEL}
FE_PROD_FILES=${FE_PROD_FILES}
BE_TEST_UNIT_ADD=${BE_TEST_UNIT_ADD}
BE_TEST_UNIT_DEL=${BE_TEST_UNIT_DEL}
BE_TEST_UNIT_FILES=${BE_TEST_UNIT_FILES}
BE_TEST_INT_ADD=${BE_TEST_INT_ADD}
BE_TEST_INT_DEL=${BE_TEST_INT_DEL}
BE_TEST_INT_FILES=${BE_TEST_INT_FILES}
BE_TEST_E2E_ADD=${BE_TEST_E2E_ADD}
BE_TEST_E2E_DEL=${BE_TEST_E2E_DEL}
BE_TEST_E2E_FILES=${BE_TEST_E2E_FILES}
FE_TEST_UNIT_ADD=${FE_TEST_UNIT_ADD}
FE_TEST_UNIT_DEL=${FE_TEST_UNIT_DEL}
FE_TEST_UNIT_FILES=${FE_TEST_UNIT_FILES}
FE_TEST_E2E_ADD=${FE_TEST_E2E_ADD}
FE_TEST_E2E_DEL=${FE_TEST_E2E_DEL}
FE_TEST_E2E_FILES=${FE_TEST_E2E_FILES}
OTHER_ADD=${OTHER_ADD}
OTHER_DEL=${OTHER_DEL}
OTHER_FILES=${OTHER_FILES}
STATSEOF

cp /tmp/be_prod_files.txt .be_prod_files.txt
cp /tmp/fe_prod_files.txt .fe_prod_files.txt
