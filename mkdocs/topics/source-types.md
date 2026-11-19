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
| `duckdb` | DuckDB | Local `.db` file, or a DuckLake | `database` (file path or DuckLake), `attach` |
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

When Visivo only reads data, it attaches the file read-only. Thus two processes can read the
same file. If an attachment fails, Visivo stops and names the attachment.

#### DuckLake

A [DuckLake](https://ducklake.select) keeps its catalog in a database and its data in Parquet
files. To read one, set `database` to the DuckLake: an object with a `catalog`. The example
uses a PostgreSQL catalog and data files in Amazon S3.

```yaml title="project.visivo.yml"
sources:
  - name: lake
    type: duckdb
    database:
      catalog:
        host: ${env.LAKE_CATALOG_HOST}
        port: 5432
        database: ducklake
        username: ${env.LAKE_CATALOG_USER}
        password: ${env.LAKE_CATALOG_PASSWORD}
      data_path: s3://my-bucket/lake/
      storage:
        type: s3
        key_id: ${env.AWS_ACCESS_KEY_ID}
        secret: ${env.AWS_SECRET_ACCESS_KEY}
        region: us-east-1

models:
  - name: orders_by_region
    sql: select region, sum(amount) as total from orders group by 1
```

The DuckLake is the default database of the Source. A Model reads a table as `orders` or
`main.orders`. The full name is `lake.main.orders`: Visivo always attaches the DuckLake of
`database` under the name `lake`.

##### Join a DuckLake with a DuckDB file

To use a DuckLake together with a DuckDB file, or with a second DuckLake, put it in `attach`.
An attachment takes a `ducklake` block with the same fields. A Model reads its tables as
`<schema_name>.<schema>.<table>`.

```yaml title="project.visivo.yml"
sources:
  - name: sales
    type: duckdb
    database: local/sales.duckdb
    attach:
      - schema_name: lake
        ducklake:
          catalog: ducklake:sqlite:local/catalog.sqlite

models:
  - name: orders_with_regions
    sql: >
      select r.name, sum(o.amount) as total
      from lake.main.orders o join regions r on r.code = o.region
      group by 1
```

`attach` also works when `database` is a DuckLake.

##### Storage credentials

`storage` holds the credentials for the object store of the data files. Its `type` must agree
with the scheme of `data_path`. A local `data_path`, or a public bucket, needs no `storage`.

=== "Amazon S3"

    ```yaml
    sources:
      - name: lake
        type: duckdb
        database:
          catalog: ducklake:sqlite:local/catalog.sqlite
          data_path: s3://my-bucket/lake/
          storage:
            type: s3
            key_id: ${env.AWS_ACCESS_KEY_ID}
            secret: ${env.AWS_SECRET_ACCESS_KEY}
            region: us-east-1
    ```

    For a store that is S3-compatible, add `endpoint` (host and port, without `https://`),
    and usually `url_style: path`. Set `use_ssl: false` if the store uses http. Temporary
    credentials also take a `session_token`.

=== "Google Cloud Storage"

    ```yaml
    sources:
      - name: lake
        type: duckdb
        database:
          catalog: ducklake:sqlite:local/catalog.sqlite
          data_path: gs://my-bucket/lake/
          storage:
            type: gcs
            key_id: ${env.GCS_HMAC_KEY_ID}
            secret: ${env.GCS_HMAC_SECRET}
    ```

    DuckDB reads `gs://` and `gcs://` paths with an
    [HMAC key](https://cloud.google.com/storage/docs/authentication/hmackeys). It does not
    accept a service account key file. Give the key a role that can read the bucket.

=== "Azure"

    ```yaml
    sources:
      - name: lake
        type: duckdb
        database:
          catalog: ducklake:sqlite:local/catalog.sqlite
          data_path: az://my-container/lake/
          storage:
            type: azure
            connection_string: ${env.AZURE_STORAGE_CONNECTION_STRING}
    ```

    As an alternative to `connection_string`, set `account_name` with `tenant_id`,
    `client_id` and `client_secret` for a service principal. With `account_name` only,
    DuckDB uses the Azure credential chain of the machine (environment variables, a managed
    identity, the Azure CLI). The `data_path` starts with `az://` or `abfss://`.

Visivo's tests write and read a DuckLake through `type: s3` (against an S3-compatible
server) and through `type: azure` with a `connection_string` (against the Azurite
emulator). For `type: gcs`, and for the Azure service principal and credential chain, the
tests check only the `CREATE SECRET` statement that Visivo gives to DuckDB. They do not read
from a real bucket.

##### Rules

- **Read-only.** Visivo attaches a DuckLake read-only. Set `read_only: false` only when a
  query or a [Seed](../reference/configuration/Sources/DuckdbSource/Seed/index.md) must write
  to the DuckLake. A Seed on a read-only DuckLake fails with a message that names the Source.
- **Catalog.** `catalog` is a PostgreSQL connection, as in the first example, or a
  `ducklake:` URI. A `ducklake:` URI is for a catalog in a DuckDB or SQLite file only, for
  example `ducklake:sqlite:local/catalog.sqlite`. Visivo refuses a URI that can hold
  credentials.
- **Data path.** The catalog stores the data path when the DuckLake is created. An existing
  DuckLake does not need `data_path`. With `storage`, `data_path` also sets which paths the
  credentials read. If more than one DuckLake in a Source has `storage`, each one must have
  a `data_path`.
- **Names.** Visivo puts `schema_name` in double quotes. A name with other characters than
  letters, numbers and underscores also needs double quotes in a query, for example
  `"my-lake".main.orders`. A name cannot be the name of the primary database, or `temp` or
  `system`. When `database` is a DuckLake, an attachment cannot have the name `lake`.
- **Snapshots.** Set `snapshot_version` to read the DuckLake as of one snapshot.
- **Secrets.** The catalog `password` and the `storage` fields `secret`, `session_token`,
  `connection_string` and `client_secret` must be `${env.VAR}` references. Visivo refuses the
  value itself. Visivo reads each `${env.VAR}` value when it connects. It creates the
  credentials as temporary DuckDB secrets on the connection, and it does not write them to
  disk.
- **Errors.** If the DuckLake or an attachment fails to connect, Visivo stops and names the
  Source and the attachment. The message does not contain a password or a storage secret.
- **Extensions.** DuckDB downloads the `ducklake` extension on first use. It also downloads
  `postgres` for a PostgreSQL catalog, `sqlite` for a SQLite file catalog, `httpfs` for an
  S3 or Google Cloud Storage data path, and `azure` for an Azure data path. Thus the first
  connection needs network access.

!!! note "DuckLake format versions"

    The DuckDB version in your Visivo install sets the DuckLake format that Visivo can read.
    DuckDB 1.5.2 and later 1.5 releases read format 1.0. DuckDB 2.0 reads formats 1.0 and 1.1.
    DuckDB 1.5 cannot open a format 1.1 catalog. Run `visivo --version` and
    `python -c "import duckdb; print(duckdb.__version__)"` to see what you have.

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
