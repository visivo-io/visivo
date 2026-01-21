from typing import Literal, Optional, Any, Dict, List, ClassVar, Set
from visivo.models.sources.source import ServerSource
from pydantic import Field, PrivateAttr
from visivo.logger.logger import Logger
from visivo.query.sqlglot_type_mapper import SqlglotTypeMapper
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

    def get_sqlglot_dialect(self):
        from visivo.query.sqlglot_utils import get_sqlglot_dialect

        return get_sqlglot_dialect(self.get_dialect())

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

    def get_schema(self, table_names: List[str] = None) -> Dict[str, Any]:
        """
        Build SQLGlot schema for Redshift source.

        Args:
            table_names: Optional list of table names to include. If None, includes all tables.

        Returns:
            Dictionary containing:
            - tables: Dict mapping table names to column info
            - sqlglot_schema: SQLGlot MappingSchema for query optimization
            - metadata: Additional metadata about the schema
        """
        from sqlglot.schema import MappingSchema

        try:
            # Initialize result structure
            result = {
                "tables": {},
                "sqlglot_schema": MappingSchema(),
                "metadata": {
                    "source_type": self.type,
                    "source_dialect": "redshift",
                    "database": self.database,
                    "schema": getattr(self, "db_schema", None),
                    "total_tables": 0,
                    "total_columns": 0,
                },
            }

            # Get available tables to process
            available_tables = self._get_available_tables_for_schema(table_names)

            # Process each table
            for table_name in available_tables:
                table_info = self._extract_table_schema_for_sqlglot(table_name)
                if table_info:
                    result["tables"][table_name] = table_info

                    # Add to SQLGlot schema
                    columns_dict = {}
                    for col_name, col_info in table_info["columns"].items():
                        if "sqlglot_datatype" in col_info:
                            columns_dict[col_name] = col_info["sqlglot_datatype"]

                    if columns_dict:
                        result["sqlglot_schema"].add_table(table_name, columns_dict)

            # Update metadata
            result["metadata"]["total_tables"] = len(result["tables"])
            result["metadata"]["total_columns"] = sum(
                len(table_info["columns"]) for table_info in result["tables"].values()
            )

            Logger.instance().debug(
                f"Built schema for Redshift source '{self.name}' with {result['metadata']['total_tables']} tables"
            )

            return result

        except Exception as e:
            Logger.instance().error(f"Error building schema for Redshift source {self.name}: {e}")
            # Return minimal schema to avoid breaking downstream code
            return {
                "tables": {},
                "sqlglot_schema": MappingSchema(),
                "metadata": {"error": str(e), "total_tables": 0, "total_columns": 0},
            }

    def _get_available_tables_for_schema(self, table_names: List[str] = None) -> List[str]:
        """Get list of tables to process for schema building."""
        try:
            with self.connect() as connection:
                cursor = connection.cursor()

                # Get all tables from information schema
                if hasattr(self, "db_schema") and self.db_schema:
                    # Query specific schema
                    query = """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = %s AND table_type = 'BASE TABLE'
                    ORDER BY table_name
                    """
                    cursor.execute(query, (self.db_schema,))
                else:
                    # Query all schemas except system ones
                    query = """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                    AND table_type = 'BASE TABLE'
                    ORDER BY table_name
                    """
                    cursor.execute(query)

                all_tables = [row[0] for row in cursor.fetchall()]
                cursor.close()

                # Filter to requested tables if specified
                if table_names:
                    return [t for t in all_tables if t in table_names]

                return all_tables

        except Exception as e:
            Logger.instance().debug(f"Error getting tables for Redshift schema: {e}")
            return []

    def _extract_table_schema_for_sqlglot(self, table_name: str) -> Optional[Dict[str, Any]]:
        """Extract schema information for a single table for SQLGlot format."""
        try:
            with self.connect() as connection:
                cursor = connection.cursor()

                # Get columns for this table
                if hasattr(self, "db_schema") and self.db_schema:
                    column_query = """
                    SELECT column_name, data_type, is_nullable
                    FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = %s
                    ORDER BY ordinal_position
                    """
                    cursor.execute(column_query, (self.db_schema, table_name))
                else:
                    # Try to find the table in any schema
                    column_query = """
                    SELECT column_name, data_type, is_nullable
                    FROM information_schema.columns
                    WHERE table_name = %s
                    AND table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                    ORDER BY ordinal_position
                    """
                    cursor.execute(column_query, (table_name,))

                columns_info = cursor.fetchall()
                cursor.close()

                if not columns_info:
                    return None

                # Process columns
                table_schema = {
                    "columns": {},
                    "metadata": {"table_name": table_name, "column_count": len(columns_info)},
                }

                for col_info in columns_info:
                    col_name = col_info[0]  # column_name
                    col_type_str = col_info[1]  # data_type
                    is_nullable = col_info[2] == "YES"  # is_nullable

                    # Convert Redshift type string to SQLGlot DataType
                    sqlglot_datatype = SqlglotTypeMapper._parse_type_string(col_type_str)

                    table_schema["columns"][col_name] = {
                        "type": col_type_str,
                        "nullable": is_nullable,
                        "sqlglot_datatype": sqlglot_datatype,
                        "sqlglot_type_info": SqlglotTypeMapper.serialize_datatype(sqlglot_datatype),
                    }

                return table_schema

        except Exception as e:
            Logger.instance().debug(f"Error extracting schema for Redshift table {table_name}: {e}")
            return None

    # --- Granular introspection methods ---

    SYSTEM_SCHEMAS: ClassVar[Set[str]] = {"information_schema", "pg_catalog", "pg_toast"}

    def get_schemas(self, database_name: str) -> List[str]:
        """Get schemas, similar pattern to existing introspect() method."""
        with self.connect() as connection:
            cursor = connection.cursor()
            cursor.execute(
                """
                SELECT schema_name FROM information_schema.schemata
                WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY schema_name
            """
            )
            schemas = [row[0] for row in cursor.fetchall()]
            cursor.close()
            return schemas

    def get_tables(
        self, database_name: str, schema_name: Optional[str] = None
    ) -> List[Dict[str, str]]:
        """Get tables and views from Redshift."""
        if schema_name:
            schema_filter = f"= '{schema_name}'"
        else:
            schema_filter = "NOT IN ('information_schema', 'pg_catalog')"

        with self.connect() as connection:
            cursor = connection.cursor()
            cursor.execute(
                f"""
                SELECT table_name, table_type FROM information_schema.tables
                WHERE table_schema {schema_filter}
                ORDER BY table_name
            """
            )
            tables = [
                {"name": row[0], "type": "view" if row[1] == "VIEW" else "table"}
                for row in cursor.fetchall()
            ]
            cursor.close()
            return tables

    def get_columns(
        self, database_name: str, table_name: str, schema_name: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get column info, similar pattern to existing introspect() method."""
        if schema_name:
            schema_filter = f"= '{schema_name}'"
        else:
            schema_filter = "NOT IN ('information_schema', 'pg_catalog')"

        with self.connect() as connection:
            cursor = connection.cursor()
            cursor.execute(
                f"""
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema {schema_filter} AND table_name = %s
                ORDER BY ordinal_position
            """,
                (table_name,),
            )
            columns = [
                {"name": row[0], "type": row[1], "nullable": row[2] == "YES"}
                for row in cursor.fetchall()
            ]
            cursor.close()
            return columns

    def get_table_preview(
        self,
        database_name: str,
        table_name: str,
        schema_name: Optional[str] = None,
        limit: int = 100,
    ) -> Dict[str, Any]:
        """Preview data using existing read_sql()."""
        # Clamp limit to valid range
        limit = min(max(limit, 1), 1000)

        if schema_name:
            full_table = f'"{schema_name}"."{table_name}"'
        else:
            full_table = f'"{table_name}"'

        rows = self.read_sql(f"SELECT * FROM {full_table} LIMIT {limit}")
        columns = list(rows[0].keys()) if rows else []
        return {"columns": columns, "rows": rows, "row_count": len(rows)}


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
