#!/usr/bin/env bash
set -euo pipefail

COMMENT_ID=$(gh api --paginate "repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments" \
  --jq '.[] | select(.body | contains("<!-- pr-summary -->")) | .id' | sed -n 1p)

if [ -z "$COMMENT_ID" ] || ! gh api "repos/${GITHUB_REPOSITORY}/issues/comments/${COMMENT_ID}" \
  -X PATCH -F "body=@/tmp/pr_comment.md" --silent; then
  gh pr comment "$PR_NUMBER" -R "$GITHUB_REPOSITORY" -F /tmp/pr_comment.md
fi
