# Source types

Visivo ships ten built-in [Source](../concepts/source.md) types: seven that use a SQLAlchemy driver (six networked warehouses and databases plus local SQLite), and three file-based sources you query locally with DuckDB. This page is the at-a-glance matrix plus a minimal, copy-pasteable connection example for each.

!!! visivo "Two engine families"
    Under the hood every Source resolves to one of two engines. **SQLAlchemy** sources
    (`postgresql`, `mysql`, `sqlite`, `snowflake`, `bigquery`, `clickhouse`) connect through a
    SQLAlchemy driver; **Redshift** uses the native `redshift-connector`; and **DuckDB**
    sources (`duckdb`, `csv`, `xls`) run queries through an embedded DuckDB engine. You write
    the same SQL either way; Visivo translates dialects with [SQLGlot](https://sqlglot.com).

## The matrix

| :visivo-source:{ .vz-source } Type | Engine | Where the data lives | Key fields |
|------|--------|----------------------|------------|
| `postgresql` | SQLAlchemy (`psycopg2`) | PostgreSQL server | `host`, `port`, `database`, `username`, `password`, `db_schema` |
| `mysql` | SQLAlchemy (`pymysql`) | MySQL server | `host`, `port`, `database`, `username`, `password`, `db_schema` |
| `sqlite` | SQLAlchemy (`pysqlite`) | Local `.db` file | `database` (file path), `attach` |
| `snowflake` | SQLAlchemy (`snowflake`) | Snowflake account | `account`, `warehouse`, `database`, `db_schema`, `role`, `username`, `password` (or key pair) |
| `bigquery` | SQLAlchemy (`bigquery`) | Google BigQuery | `project`, `database` (dataset), `credentials_base64` |
| `redshift` | `redshift-connector` | Amazon Redshift | `host`, `port`, `database`, `username`, `password` (or IAM) |
| `clickhouse` | SQLAlchemy (`clickhouse`) | ClickHouse server / Cloud | `host`, `port`, `database`, `username`, `password`, `protocol`, `secure` |
| `duckdb` | DuckDB | Local `.db` file | `database` (file path), `attach` |
| `csv` | DuckDB | Local `.csv` file | `file` (file path), `delimiter`, `encoding`, `has_header` |
| `xls` | DuckDB | Local spreadsheet file | `file` (file path), `delimiter`, `encoding`, `has_header` |

!!! tip "Credentials belong in environment variables"
    Every credential field accepts the `${env.VAR_NAME}` reference, resolved at run time.
    Keep secrets out of your committed YAML and out of version control. See
    [Environment Variables](environment-variables.md) for how Visivo loads `.env` files and
    where the syntax works.

## SQLAlchemy databases

These connect through a SQLAlchemy driver (Redshift uses the native `redshift-connector`).
Most run on a server you reach over the network; SQLite is the exception, a local `.db` file
that still uses the SQLAlchemy `pysqlite` driver rather than DuckDB. The credential fields
below all accept `${env.VAR_NAME}`.

### PostgreSQL

```yaml title="project.visivo.yml"
sources:
  - name: warehouse
    type: postgresql
    host: ${env.PG_HOST}
    port: 5432
    database: app_db
    username: ${env.PG_USER}
    password: ${env.PG_PASSWORD}
    db_schema: public
```

### MySQL

```yaml title="project.visivo.yml"
sources:
  - name: warehouse
    type: mysql
    host: ${env.MYSQL_HOST}
    port: 3306
    database: app_db
    username: ${env.MYSQL_USER}
    password: ${env.MYSQL_PASSWORD}
```

### Snowflake

`account`, `warehouse`, `role`, and `timezone` all resolve `${env.VAR_NAME}`, so the whole
connection can be environment-driven. Use `password` for basic auth, or `private_key_path`
plus `private_key_passphrase` for key-pair auth (when a key path is set, the password is
ignored).

=== "Password auth"

    ```yaml title="project.visivo.yml"
    sources:
      - name: warehouse
        type: snowflake
        account: ${env.SNOWFLAKE_ACCOUNT}
        warehouse: ${env.SNOWFLAKE_WAREHOUSE}
        database: DEV
        db_schema: PUBLIC
        role: ${env.SNOWFLAKE_ROLE}
        username: ${env.SNOWFLAKE_USER}
        password: ${env.SNOWFLAKE_PASSWORD}
    ```

=== "Key-pair auth"

    ```yaml title="project.visivo.yml"
    sources:
      - name: warehouse
        type: snowflake
        account: ${env.SNOWFLAKE_ACCOUNT}
        warehouse: ${env.SNOWFLAKE_WAREHOUSE}
        database: DEV
        db_schema: PUBLIC
        username: ${env.SNOWFLAKE_USER}
        private_key_path: /path/to/rsa_key.p8
        private_key_passphrase: ${env.SNOWFLAKE_KEY_PASSPHRASE}
    ```

### BigQuery

Datasets are BigQuery's databases, so `database` holds the dataset name. Authenticate with a
base64-encoded service-account key in `credentials_base64`, or set the
`GOOGLE_APPLICATION_CREDENTIALS` environment variable and omit the field.

```yaml title="project.visivo.yml"
sources:
  - name: warehouse
    type: bigquery
    project: my-gcp-project-id
    database: my_dataset
    credentials_base64: ${env.BIGQUERY_BASE64_CREDENTIALS}
```

### Redshift

Redshift uses the native `redshift-connector`. Use `username` + `password` for basic auth,
or set `iam: true` with `cluster_identifier` and `region` for IAM auth.

=== "Username / password"

    ```yaml title="project.visivo.yml"
    sources:
      - name: warehouse
        type: redshift
        host: my-cluster.abcdefghij.us-east-1.redshift.amazonaws.com
        port: 5439
        database: dev
        username: ${env.REDSHIFT_USER}
        password: ${env.REDSHIFT_PASSWORD}
        db_schema: public
    ```

=== "IAM auth"

    ```yaml title="project.visivo.yml"
    sources:
      - name: warehouse
        type: redshift
        host: my-cluster.abcdefghij.us-east-1.redshift.amazonaws.com
        port: 5439
        database: dev
        username: ${env.REDSHIFT_USER}
        iam: true
        cluster_identifier: my-cluster
        region: us-east-1
        db_schema: public
    ```

### ClickHouse

Supports self-hosted ClickHouse and ClickHouse Cloud. The `protocol` field selects `native`
(TCP, the default, port 9000) or `http` (port 8123); set `secure: true` for TLS, which
ClickHouse Cloud requires.

```yaml title="project.visivo.yml"
sources:
  - name: warehouse
    type: clickhouse
    host: your-instance.clickhouse.cloud
    port: 8443
    database: default
    username: default
    password: ${env.CLICKHOUSE_PASSWORD}
    protocol: http
    secure: true
```

### SQLite

A local `.db` file queried through the SQLAlchemy `pysqlite` driver, so no server is needed.
`database` is the path to the file. Use `attach` to make additional SQLite databases
available in the same connection so one Model query can join across them; each attachment
nests a full source under `source`.

```yaml title="project.visivo.yml"
sources:
  - name: local_db
    type: sqlite
    database: local/file/local.db
    attach:
      - schema_name: static
        source:
          name: static_source
          type: sqlite
          database: local/static/local.db
```

## File-based sources (DuckDB)

These need no server. Visivo loads the file into an embedded DuckDB engine and queries it
with SQL like any other table.

### DuckDB

`database` is the path to a local DuckDB file. Use `attach` to make additional DuckDB
databases joinable in a single query; each attachment nests a full source under `source`.

```yaml title="project.visivo.yml"
sources:
  - name: local_duck
    type: duckdb
    database: local/file/database.db
    attach:
      - schema_name: static
        source:
          name: static_duck
          type: duckdb
          database: local/static/static.db
```

### CSV

Query a local CSV file directly. The file is exposed as a view named after the Source, so a
[Model](../concepts/model.md) can `SELECT` from it. Use this for small, version-controlled
datasets; for CSVs produced by a command, use a
[Seed](../reference/configuration/Sources/DuckdbSource/Seed/index.md) on a database Source instead.

```yaml title="project.visivo.yml"
sources:
  - name: products_csv
    type: csv
    file: data/products.csv
    delimiter: ","
    has_header: true

models:
  - name: products
    source: ${ref(products_csv)}
    sql: SELECT * FROM products_csv
```

### Excel

Query a local spreadsheet file. Note the type is `xls` (not `xlsx`).

!!! warning "Excel reading is delimited-text, not native `.xlsx`"
    The Excel source currently loads the file through DuckDB's `read_csv_auto`, the same path
    as the CSV source, so it does **not** yet parse the native `.xlsx` binary format
    ([VIS-971](https://github.com/visivo-io/visivo/issues)). In practice it reads
    delimited-text spreadsheets reliably. For true binary `.xlsx` files, export to CSV first
    and use a `csv` source.

```yaml title="project.visivo.yml"
sources:
  - name: budget_xls
    type: xls
    file: data/budget.csv
    has_header: true

models:
  - name: budget
    source: ${ref(budget_xls)}
    sql: SELECT * FROM budget_xls
```

## Learn more

- [Source](../concepts/source.md): the concept and how Sources fit the object model.
- [Sources overview](sources.md): best practices for one project across many environments.
- [Environment Variables](environment-variables.md): the `${env.VAR_NAME}` syntax in full.
- Reference: every field for every type lives under
  [Sources configuration](../reference/configuration/Sources/PostgresqlSource/index.md).
