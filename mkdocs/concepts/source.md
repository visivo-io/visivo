# Source

A **Source** is a connection to where your data lives. It is the entry point of every
Visivo project: before you can model or visualize anything, Visivo needs to know how to
reach the database or file that holds your data.

## Why it matters

Sources keep connection details in one place and out of your queries. You define a Source
once, then reference it from your [Models](model.md) — so credentials, hosts, and
connection options live in a single, version-controlled, environment-aware definition.

Visivo connects to a broad set of databases and file formats:

- **SQL databases**: PostgreSQL, MySQL, Snowflake, BigQuery, Redshift, ClickHouse, SQLite
- **File-based**: DuckDB, CSV, Excel

## Minimal example

```yaml title="project.visivo.yml"
sources:
  - name: warehouse
    type: postgresql
    host: ${env.DB_HOST}
    database: analytics
    username: ${env.DB_USERNAME}
    password: ${env.DB_PASSWORD}
```

A [Model](model.md) then reads from this Source:

```yaml
models:
  - name: orders
    source: ${ref(warehouse)}
    sql: select * from public.orders
```

!!! tip "Keep secrets out of your repo"
    Use `${env.VAR_NAME}` for any credential rather than committing it.
    See [Environment Variables](../topics/environment-variables.md).

## Learn more

- [Sources guide](../topics/sources.md) — connecting to each supported database and file type.
- [Environment Variables](../topics/environment-variables.md) — managing credentials safely.
- Reference: [Sources configuration](../reference/configuration/Sources/PostgresqlSource/index.md)
  for every field of every Source type.
