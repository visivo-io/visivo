#!/bin/bash
# One-shot docs generation + build pipeline for the MkDocs site.
#
# Pipeline:
#   1. Preflight  — verify the poetry env can import visivo + mkdocs-material
#   2. Schema     — write generate_schema() straight to mkdocs/assets/visivo_schema.json
#                   (fast, ~2s). --ci-parity instead runs the schema pytest and copies
#                   the NEWEST tmp/**/visivo_schema.json, matching .rwx/test_docs.yml.
#   3. Markdown   — poetry run python mkdocs/src/write_mkdocs_markdown_files.py
#                   (NOTE: this rewrites the committed mkdocs.yml nav in place)
#   4. Build      — PYTHONPATH=$PWD poetry run mkdocs build, teed to tmp/docs/build_stdout.txt
#   5. Spellcheck — fail on any "WARNING -  mkdocs_spellcheck" line in the build output
#
# Usage:
#   bash scripts/docs_gen.sh                 — full pipeline (fast schema path)
#   bash scripts/docs_gen.sh --ci-parity     — schema via pytest + tmp copy (CI parity)
#   bash scripts/docs_gen.sh --strict        — pass -s to mkdocs build (warnings fatal)
#   bash scripts/docs_gen.sh --skip-build    — steps 1-3 only (no build, no spellcheck)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

CI_PARITY=false
STRICT=false
SKIP_BUILD=false
for arg in "$@"; do
    case "$arg" in
        --ci-parity)  CI_PARITY=true ;;
        --strict)     STRICT=true ;;
        --skip-build) SKIP_BUILD=true ;;
        *)
            echo "Unknown flag: $arg"
            echo "Usage: bash scripts/docs_gen.sh [--ci-parity] [--strict] [--skip-build]"
            exit 1
            ;;
    esac
done

# --- 1. Preflight -----------------------------------------------------------
if ! poetry run python -c "import visivo, material" >/dev/null 2>&1; then
    echo "ERROR: the poetry env cannot import visivo and/or mkdocs-material."
    echo "Remediation:"
    echo "  poetry env use /opt/homebrew/bin/python3.12 && poetry install --with dev"
    exit 1
fi

# --- 2. Schema --------------------------------------------------------------
if [ "$CI_PARITY" = true ]; then
    echo "==> Schema (--ci-parity): running tests/parsers/test_schema_generator.py..."
    poetry run pytest tests/parsers/test_schema_generator.py
    # CI uses `find tmp -name visivo_schema.json -exec cp {}` which grabs ANY match;
    # locally tmp/ can hold stale schemas from old runs, so copy only the NEWEST.
    newest_schema=$(find tmp -name visivo_schema.json -print0 2>/dev/null \
        | xargs -0 ls -t 2>/dev/null | head -n 1)
    if [ -z "$newest_schema" ]; then
        echo "ERROR: schema test passed but produced no tmp/**/visivo_schema.json"
        exit 1
    fi
    cp "$newest_schema" mkdocs/assets/visivo_schema.json
    echo "Copied $newest_schema -> mkdocs/assets/visivo_schema.json"
else
    echo "==> Schema (fast path): writing mkdocs/assets/visivo_schema.json..."
    poetry run python -c "from visivo.parsers.schema_generator import generate_schema; from pathlib import Path; Path('mkdocs/assets/visivo_schema.json').write_text(generate_schema())"
fi

# --- 3. Markdown generation -------------------------------------------------
echo "==> Generating reference markdown (rewrites mkdocs.yml nav in place)..."
poetry run python mkdocs/src/write_mkdocs_markdown_files.py
if ! git diff --quiet mkdocs.yml; then
    echo ""
    echo "#####################################################################"
    echo "# mkdocs.yml nav was rewritten by write_mkdocs_markdown_files.py.   #"
    echo "# If your change intends nav updates, COMMIT the mkdocs.yml diff.   #"
    echo "# Otherwise restore the committed nav:  git checkout -- mkdocs.yml  #"
    echo "#####################################################################"
    echo ""
fi

if [ "$SKIP_BUILD" = true ]; then
    echo "==> Skipping mkdocs build + spellcheck (--skip-build)"
    echo "docs_gen complete (steps 1-3)"
    exit 0
fi

# --- 4. Build ---------------------------------------------------------------
mkdir -p tmp/docs
build_args=()
if [ "$STRICT" = true ]; then
    build_args+=(-s)
fi
echo "==> Building docs (mkdocs build ${build_args[*]})..."
PYTHONPATH="$PROJECT_DIR" poetry run mkdocs build "${build_args[@]}" 2>&1 \
    | tee tmp/docs/build_stdout.txt
build_status=${PIPESTATUS[0]}
if [ "$build_status" -ne 0 ]; then
    echo "ERROR: mkdocs build failed (exit $build_status) — see tmp/docs/build_stdout.txt"
    exit "$build_status"
fi

# --- 5. Spellcheck gate -----------------------------------------------------
if grep -q "WARNING -  mkdocs_spellcheck" tmp/docs/build_stdout.txt; then
    echo ""
    echo "ERROR: spelling errors were found in the docs build:"
    grep "WARNING -  mkdocs_spellcheck" tmp/docs/build_stdout.txt | head -n 20
    echo "Fix the misspellings, or add legitimately-introduced words to mkdocs/known_words.txt"
    exit 1
fi

echo "docs_gen complete — build green, spellcheck clean (output: mkdocs_build/)"
