from typing import Literal, Optional, Any
from visivo.models.sources.source import ServerSource
from pydantic import Field, PrivateAttr
from visivo.logger.logger import Logger
import json

RedshiftType = Literal["redshift"]


class RedshiftSource(ServerSource):
    """
    RedshiftSources hold the connection information to Amazon Redshift data sources.

    !!! example

        === "Basic Username/Password"

            ``` yaml
                sources:
                  - name: redshift_source
                    type: redshift
                    database: dev
                    host: my-cluster.abcdefghij.us-east-1.redshift.amazonaws.com
                    port: 5439
                    username: {% raw %}{{ env_var('REDSHIFT_USER') }}{% endraw %}
                    password: {% raw %}{{ env_var('REDSHIFT_PASSWORD') }}{% endraw %}
                    db_schema: public
            ```

        === "IAM Authentication"

            ``` yaml
                sources:
                  - name: redshift_source
                    type: redshift
                    database: dev
                    host: my-cluster.abcdefghij.us-east-1.redshift.amazonaws.com
                    port: 5439
                    username: {% raw %}{{ env_var('REDSHIFT_USER') }}{% endraw %}
                    cluster_identifier: my-cluster
                    region: us-east-1
                    iam: true
                    db_schema: public
            ```

    !!! note

        Recommended environment variable use is covered in the [sources overview.](/topics/sources/)
    """

    type: RedshiftType
    cluster_identifier: Optional[str] = Field(
        None, description="The cluster identifier for IAM authentication."
    )
    region: Optional[str] = Field(
        None, description="The AWS region where your Redshift cluster is located."
    )
    iam: Optional[bool] = Field(
        False, description="Use IAM authentication instead of username/password."
    )
    ssl: Optional[bool] = Field(True, description="Use SSL connection to Redshift.")
    connection_pool_size: Optional[int] = Field(
        1, description="The pool size that is used for this connection."
    )

    _connection: Any = PrivateAttr(default=None)

    def get_connection(self):
        """Get a connection using the redshift-connector."""
        try:
            import redshift_connector
        except ImportError:
            raise ImportError(
                "redshift-connector is required for Redshift sources. "
                "Install it with: pip install redshift-connector"
            )

        connection_params = {
            "host": self.host,
            "port": self.port or 5439,
            "database": self.database,
            "user": self.username,
        }

        # Add password if not using IAM
        if not self.iam and self.password:
            connection_params["password"] = self.get_password()

        # Add IAM-specific parameters
        if self.iam:
            connection_params["is_iam"] = True
            if self.cluster_identifier:
                connection_params["cluster_identifier"] = self.cluster_identifier
            if self.region:
                connection_params["region"] = self.region

        # Add SSL configuration
        if self.ssl:
            connection_params["ssl"] = True
            connection_params["sslmode"] = "require"

        return redshift_connector.connect(**connection_params)

    def connect(self):
        """Context manager for database connections."""
        return RedshiftConnection(source=self)

    def read_sql(self, query: str):
        """Execute a SQL query and return results as a list of dictionaries."""
        with self.connect() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(query)
                columns = [desc[0] for desc in cursor.description]
                rows = cursor.fetchall()

                # Convert to list of dictionaries
                result_data = []
                for row in rows:
                    row_dict = {}
                    for i, col in enumerate(columns):
                        value = row[i]
                        # Convert complex types to JSON strings for consistency
                        if isinstance(value, (dict, list)):
                            value = json.dumps(value)
                        row_dict[col] = value
                    result_data.append(row_dict)

                return result_data
            finally:
                cursor.close()

    def list_databases(self):
        """Return list of databases for Redshift cluster."""
        try:
            with self.connect() as connection:
                cursor = connection.cursor()
                try:
                    # Query to get databases in Redshift
                    query = """
                    SELECT datname 
                    FROM pg_database 
                    WHERE datistemplate = false 
                    AND datallowconn = true
                    ORDER BY datname
                    """

                    cursor.execute(query)
                    rows = cursor.fetchall()
                    return [r[0] for r in rows]
                finally:
                    cursor.close()
        except Exception as e:
            Logger.instance().error(
                f"Error listing databases for Redshift source '{self.name}': {str(e)}"
            )
            # Re-raise to allow proper error handling in UI
            raise e

    def introspect(self):
        """Introspect the Redshift database to get schema information."""
        schemas_dict = {}

        try:
            with self.connect() as connection:
                cursor = connection.cursor()

                # Get all schemas
                schema_query = """
                SELECT schema_name 
                FROM information_schema.schemata 
                WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY schema_name
                """

                cursor.execute(schema_query)
                schemas = [row[0] for row in cursor.fetchall()]

                for schema in schemas:
                    tables_dict = {}

                    # Get tables for this schema
                    table_query = """
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_schema = %s AND table_type = 'BASE TABLE'
                    ORDER BY table_name
                    """

                    cursor.execute(table_query, (schema,))
                    tables = [row[0] for row in cursor.fetchall()]

                    for table in tables:
                        # Get columns for this table
                        column_query = """
                        SELECT column_name, data_type, is_nullable 
                        FROM information_schema.columns 
                        WHERE table_schema = %s AND table_name = %s
                        ORDER BY ordinal_position
                        """

                        cursor.execute(column_query, (schema, table))
                        columns = [
                            {"name": row[0], "type": row[1], "nullable": row[2] == "YES"}
                            for row in cursor.fetchall()
                        ]

                        tables_dict[table] = columns

                    schemas_dict[schema] = tables_dict

                cursor.close()

        except Exception as e:
            Logger.instance().error(f"Error introspecting Redshift source '{self.name}': {str(e)}")
            raise e

        return schemas_dict

    def get_dialect(self):
        return "redshift"


class RedshiftConnection:
    """Context manager for Redshift connections using redshift-connector."""

    def __init__(self, source):
        self.source = source
        self.connection = None

    def __enter__(self):
        self.connection = self.source.get_connection()
        return self.connection

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.connection:
            self.connection.close()
