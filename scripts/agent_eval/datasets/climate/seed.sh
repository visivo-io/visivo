#!/bin/bash
# Build test-projects/agent-eval/climate/climate.duckdb from Our World in Data's
# CO2 and greenhouse-gas dataset (CC BY 4.0, https://github.com/owid/co2-data):
# one row per country or region per year, 1950 on.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
TARGET="$ROOT/test-projects/agent-eval/climate/climate.duckdb"
DOWNLOADS="$(mktemp -d)"
trap 'rm -rf "$DOWNLOADS"' EXIT

curl -sSfL -o "$DOWNLOADS/owid-co2-data.csv" https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv
mkdir -p "$(dirname "$TARGET")"
rm -f "$TARGET"
python - "$DOWNLOADS/owid-co2-data.csv" "$TARGET" <<'PY'
import sys
import duckdb

source, target = sys.argv[1], sys.argv[2]
db = duckdb.connect(target)
db.execute(f"CREATE TABLE emissions AS SELECT * FROM read_csv_auto('{source}') WHERE year >= 1950")
print(db.execute("SELECT count(*), count(DISTINCT country), min(year), max(year) FROM emissions").fetchone(), "->", target)
PY
