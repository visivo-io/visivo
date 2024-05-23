### Run Postgres:

`docker run --name postgres -p 5434:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres postgres:latest`

`visivo run -t local-postgres --threads 1`