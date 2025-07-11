# Connect Your Data

Now that you've built your first dashboard with sample data, let's connect Visivo to your real databases. This guide covers connecting to popular databases and best practices for managing connections.

## Supported Databases

Visivo has native support for these databases:

<div class="grid cards" markdown>

-   ![PostgreSQL](../assets/source-logos/postgres.png){ style="height:40px" } **PostgreSQL**
    
    Most common choice for production applications

-   ![MySQL](../assets/source-logos/mysql.png){ style="height:40px" } **MySQL**
    
    Popular open-source database

-   ![Snowflake](../assets/source-logos/snowflake.png){ style="height:40px" } **Snowflake**
    
    Cloud data warehouse

-   ![BigQuery](../assets/source-logos/bigquery.png){ style="height:40px" } **BigQuery**
    
    Google's serverless data warehouse

-   ![DuckDB](../assets/source-logos/duckdb.png){ style="height:40px" } **DuckDB**
    
    In-process analytical database

-   ![SQLite](../assets/source-logos/sqlite.png){ style="height:40px" } **SQLite**
    
    Lightweight file-based database

</div>

## Quick Connection Examples

### PostgreSQL

```yaml
sources:
  - name: production_db
    type: postgresql
    host: localhost
    port: 5432
    database: myapp
    username: ${env_var('POSTGRES_USER')}
    password: ${env_var('POSTGRES_PASSWORD')}
    # Optional: SSL configuration
    sslmode: require
```

### MySQL

```yaml
sources:
  - name: analytics_mysql
    type: mysql
    host: mysql.example.com
    port: 3306
    database: analytics
    username: ${env_var('MYSQL_USER')}
    password: ${env_var('MYSQL_PASSWORD')}
```

### Snowflake

```yaml
sources:
  - name: snowflake_dw
    type: snowflake
    account: ${env_var('SNOWFLAKE_ACCOUNT')}
    warehouse: COMPUTE_WH
    database: ANALYTICS
    db_schema: PUBLIC
    username: ${env_var('SNOWFLAKE_USER')}
    password: ${env_var('SNOWFLAKE_PASSWORD')}
```

### BigQuery

```yaml
sources:
  - name: bigquery_analytics
    type: bigquery
    project: my-gcp-project
    dataset: analytics
    # Authentication via service account
    credentials_file: ${env_var('GOOGLE_APPLICATION_CREDENTIALS')}
```

### DuckDB

```yaml
sources:
  - name: local_duckdb
    type: duckdb
    database: analytics.duckdb
    # Optional: attach other databases
    attachments:
      - path: /data/sales.parquet
        alias: sales_data
        type: parquet
```

## Step-by-Step: Connect PostgreSQL

Let's walk through connecting to a PostgreSQL database:

### 1. Test Your Connection

First, verify you can connect outside of Visivo:

```bash
psql -h localhost -U myuser -d mydatabase -c "SELECT 1"
```

### 2. Set Up Environment Variables

Create a `.env` file in your project root:

```bash
# .env
POSTGRES_HOST=localhost
POSTGRES_USER=myuser
POSTGRES_PASSWORD=mypassword
POSTGRES_DB=mydatabase
```

!!! warning "Security Note"
    Never commit `.env` files to version control! Add `.env` to your `.gitignore`.

### 3. Configure the Source

Update your `project.visivo.yml`:

```yaml
sources:
  - name: main_db
    type: postgresql
    host: ${env_var('POSTGRES_HOST')}
    port: 5432
    database: ${env_var('POSTGRES_DB')}
    username: ${env_var('POSTGRES_USER')}
    password: ${env_var('POSTGRES_PASSWORD')}
```

### 4. Test the Connection

Create a simple model to test:

```yaml
models:
  - name: connection_test
    source_name: main_db
    sql: "SELECT current_timestamp as test_time, version() as pg_version"

traces:
  - name: test_trace
    model: ${ref(connection_test)}
    props:
      type: table
      cells:
        values:
          - ?{test_time}
          - ?{pg_version}
```

Run `visivo serve` and check if the table displays correctly.

## Managing Multiple Environments

Use environment variables to switch between dev/staging/prod:

```yaml
sources:
  - name: main_db
    type: postgresql
    host: ${env_var('DB_HOST')}
    database: ${env_var('DB_NAME')}
    username: ${env_var('DB_USER')}
    password: ${env_var('DB_PASSWORD')}
    # Environment-specific settings
    pool_size: ${env_var('DB_POOL_SIZE', '5')}  # Default to 5
```

Then use different `.env` files:
- `.env.development`
- `.env.staging`
- `.env.production`

Load the appropriate file:
```bash
export $(cat .env.development | xargs) && visivo serve
```

## Connection Best Practices

### 1. Use Read Replicas
For production dashboards, connect to read replicas:

```yaml
sources:
  - name: analytics_replica
    type: postgresql
    host: ${env_var('REPLICA_HOST')}  # Point to read replica
    # ... rest of configuration
```

### 2. Set Connection Limits
Prevent overwhelming your database:

```yaml
sources:
  - name: main_db
    type: postgresql
    # ... connection details
    pool_size: 10  # Maximum concurrent connections
    pool_timeout: 30  # Seconds to wait for connection
```

### 3. Use Specific Schemas
Limit access to only required schemas:

```yaml
sources:
  - name: analytics_db
    type: postgresql
    database: production
    db_schema: analytics  # Only access analytics schema
    # ... rest of configuration
```

### 4. Query Timeouts
Set reasonable timeouts to prevent long-running queries:

```yaml
models:
  - name: heavy_calculation
    source_name: main_db
    timeout: 300  # 5 minute timeout
    sql: |
      -- Complex query here
```

## Working with Cloud Databases

### AWS RDS
```yaml
sources:
  - name: rds_postgres
    type: postgresql
    host: mydb.123456.us-east-1.rds.amazonaws.com
    port: 5432
    database: analytics
    username: ${env_var('RDS_USER')}
    password: ${env_var('RDS_PASSWORD')}
    sslmode: require
```

### Google Cloud SQL
```yaml
sources:
  - name: cloud_sql
    type: postgresql
    # Using Cloud SQL Proxy
    host: 127.0.0.1
    port: 5433  # Proxy port
    database: analytics
    username: ${env_var('CLOUD_SQL_USER')}
    password: ${env_var('CLOUD_SQL_PASSWORD')}
```

### Azure Database
```yaml
sources:
  - name: azure_postgres
    type: postgresql
    host: myserver.postgres.database.azure.com
    port: 5432
    database: analytics
    username: ${env_var('AZURE_USER')}@myserver
    password: ${env_var('AZURE_PASSWORD')}
    sslmode: require
```

## Troubleshooting Connections

### Common Issues

1. **Connection Refused**
   - Check if database is running
   - Verify hostname and port
   - Check firewall rules

2. **Authentication Failed**
   - Verify username/password
   - Check database permissions
   - Ensure user has SELECT access

3. **SSL/TLS Errors**
   - Add `sslmode: require` or `sslmode: disable`
   - Check certificate configuration

4. **Timeout Errors**
   - Increase `pool_timeout`
   - Check network connectivity
   - Verify database performance

### Debug Mode

Enable debug logging to see connection details:

```bash
DEBUG=true visivo serve
```

### Test Queries

Use these queries to verify your connection:

```sql
-- PostgreSQL/MySQL
SELECT current_timestamp, current_user, version();

-- Snowflake
SELECT current_timestamp(), current_user(), current_version();

-- BigQuery
SELECT current_timestamp(), session_user();
```

## Security Best Practices

### 1. Never Hardcode Credentials
Always use environment variables:

```yaml
# ❌ Bad
password: "my-secret-password"

# ✅ Good
password: ${env_var('DB_PASSWORD')}
```

### 2. Use Least Privilege
Create read-only database users:

```sql
-- PostgreSQL example
CREATE USER visivo_reader WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE analytics TO visivo_reader;
GRANT USAGE ON SCHEMA public TO visivo_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO visivo_reader;
```

### 3. Rotate Credentials
Regularly update passwords and use secret management tools:
- AWS Secrets Manager
- HashiCorp Vault
- Azure Key Vault

### 4. Monitor Access
Log and audit dashboard queries:

```yaml
sources:
  - name: main_db
    type: postgresql
    # ... connection details
    application_name: "visivo_${env_var('ENVIRONMENT')}"
```

## Next Steps

Now that you're connected to real data:

1. **[Create Models](../howto/data-modeling.md)** - Transform your raw data
2. **[Build Charts](../gallery/index.md)** - Visualize your data
3. **[Add Interactivity](../tutorials/adding-interactivity.md)** - Make dashboards dynamic
4. **[Deploy Dashboards](../howto/cloud-deploy.md)** - Share with your team

## Quick Reference

### Connection String Templates

```yaml
# PostgreSQL
postgresql://user:password@host:port/database

# MySQL
mysql://user:password@host:port/database

# Snowflake
snowflake://user:password@account/database/schema?warehouse=WH

# SQLite
sqlite:///path/to/database.db
```

### Required Permissions

| Database | Required Permissions |
|----------|---------------------|
| PostgreSQL | CONNECT, USAGE, SELECT |
| MySQL | SELECT |
| Snowflake | USAGE on warehouse, database, schema; SELECT on tables |
| BigQuery | BigQuery Data Viewer role |
| DuckDB | Read access to file |

---

_Having connection issues?_ Join our [Community Slack](https://visivo-community.slack.com) for help!