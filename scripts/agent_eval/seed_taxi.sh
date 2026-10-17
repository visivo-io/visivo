#!/bin/bash
# Build test-projects/agent-dogfood/taxi.duckdb from NYC TLC yellow-trip data
# (public domain): a seeded 150,000-trip sample of Q1 2024 plus the zone lookup.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROJECT="$ROOT/test-projects/agent-dogfood"
DOWNLOADS="$(mktemp -d)"
trap 'rm -rf "$DOWNLOADS"' EXIT
BASE="https://d37ci6vzurychx.cloudfront.net"

for month in 01 02 03; do
    curl -sSfL -o "$DOWNLOADS/yellow_2024-$month.parquet" "$BASE/trip-data/yellow_tripdata_2024-$month.parquet"
done
curl -sSfL -o "$DOWNLOADS/taxi_zone_lookup.csv" "$BASE/misc/taxi_zone_lookup.csv"

python - "$DOWNLOADS" "$PROJECT/taxi.duckdb" <<'EOF'
import sys
import duckdb

downloads, target = sys.argv[1], sys.argv[2]
db = duckdb.connect(target)
db.execute(f"""
CREATE OR REPLACE TABLE yellow_trips AS
SELECT * FROM read_parquet('{downloads}/yellow_2024-0*.parquet')
WHERE tpep_pickup_datetime >= '2024-01-01' AND tpep_pickup_datetime < '2024-04-01'
USING SAMPLE 150000 ROWS (reservoir, 42)
""")
db.execute(f"CREATE OR REPLACE TABLE taxi_zones AS SELECT * FROM read_csv_auto('{downloads}/taxi_zone_lookup.csv')")
print(db.execute("SELECT count(*) FROM yellow_trips").fetchone()[0], "trips ->", target)
EOF
