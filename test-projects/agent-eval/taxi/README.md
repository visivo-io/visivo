# agent-dogfood

The project the agent eval runs against: one DuckDB source and nothing else,
so every run starts from a raw connection.

`taxi.duckdb` holds a seeded 150,000-trip sample of NYC TLC yellow-cab trips
for January to March 2024 (`yellow_trips`) and the zone lookup (`taxi_zones`).
The data is public domain. Build it with:

```bash
bash scripts/agent_eval/datasets/taxi/seed.sh
```
