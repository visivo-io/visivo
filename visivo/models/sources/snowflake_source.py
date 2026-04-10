from typing import Literal, Optional, Dict, List, Any
from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from visivo.models.sources.source import ServerSource
from visivo.models.base.base_model import SecretStrOrEnvVar, StringOrEnvVar
from visivo.models.base.env_var_string import EnvVarString
from pydantic import Field, SecretStr
from visivo.logger.logger import Logger
from visivo.query.sqlglot_type_mapper import SqlglotTypeMapper
from sqlglot.schema import MappingSchema

SnowflakeType = Literal["snowflake"]


class SnowflakeSource(ServerSource, SqlalchemySource):
    """
    SnowflakeSources hold the connection information to Snowflake data sources.

    !!! example

        === "Simple"

            ``` yaml
                sources:
                  - name: snowflake_source
                    type: snowflake
                    database: DEV
                    warehouse: DEV
                    account: ab12345.us-west-1.aws
                    db_schema: DEFAULT
                    username: {% raw %}{{ env_var('SNOWFLAKE_USER') }}{% endraw %}
                    password: {% raw %}{{ env_var('SNOWFLAKE_PASSWORD') }}{% endraw %}
            ```

        === "Key Authentication"

            ``` yaml
                sources:
                  - name: snowflake_source
                    type: snowflake
                    database: DEV
                    warehouse: DEV
                    account: ab12345.us-west-1.aws
                    db_schema: DEFAULT
                    username: {% raw %}"{{ env_var('SNOWFLAKE_USER') }}"{% endraw %}
                    private_key_path: /path/to/rsa_key.p8
                    private_key_passphrase: {% raw %}"{{ env_var('DB_PRIVATE_KEY_PASSPHRASE') }}"{% endraw %}
            ```

    Note: Recommended environment variable use is covered in the [sources overview.](/topics/sources/)
    """

    account: Optional[str] = Field(
        None,
        description="The snowflake account url. Here's how you find this: [snowflake docs](https://docs.snowflake.com/en/user-guide/admin-account-identifier).",
    )
    warehouse: Optional[str] = Field(
        None,
        description="The compute warehouse that you want queries from your Visivo project to leverage.",
    )
    role: Optional[str] = Field(
        None,
        description="The access role that you want to use when running queries.",
    )
    timezone: Optional[str] = Field(
        None,
        description="The timezone that you want to use by default when running queries.",
    )
    private_key_path: Optional[StringOrEnvVar] = Field(
        None,
        description="Path to the private key file (.p8) for key pair authentication. If provided, password will be ignored.",
    )
    private_key_passphrase: Optional[SecretStrOrEnvVar] = Field(
        None,
        description="Passphrase for the private key file if it is encrypted.",
    )

    type: SnowflakeType

    connection_pool_size: Optional[int] = Field(
        8, description="The pool size that is used for this connection."
    )

    protocol: Optional[str] = Field(
        None,
        description="The protocol to use for the connection.",
    )

    def get_private_key_path(self) -> Optional[str]:
        """Get the resolved private key path value."""
        return self._resolve_field(self.private_key_path)

    def get_private_key_passphrase(self) -> Optional[str]:
        """Get the resolved private key passphrase value."""
        return self._resolve_field(self.private_key_passphrase)

    def connect_args(self):
        private_key_path = self.get_private_key_path()
        if not private_key_path:
            return {}

        from cryptography.hazmat.backends import default_backend
        from cryptography.hazmat.primitives import serialization

        passphrase = self.get_private_key_passphrase()
        with open(private_key_path, "rb") as key:
            p_key = serialization.load_pem_private_key(
                key.read(),
                password=passphrase.encode() if passphrase else None,
                backend=default_backend(),
            )

            pkb = p_key.private_bytes(
                encoding=serialization.Encoding.DER,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption(),
            )

            return {
                "private_key": pkb,
            }

    def get_connection_dialect(self):
        return "snowflake"

    def get_dialect(self):
        return "snowflake"

    def url(self):
        from snowflake.sqlalchemy import URL

        url_attributes = {
            "user": self.get_username(),
            "account": self.account,
        }

        if not self.get_private_key_path():
            url_attributes["password"] = self.get_password()

        # Optional attributes where if its not set the default value is used
        if self.timezone:
            url_attributes["timezone"] = self.timezone
        if self.warehouse:
            url_attributes["warehouse"] = self.warehouse
        if self.role:
            url_attributes["role"] = self.role

        host = self.get_host()
        if host:
            url_attributes["host"] = host
        if self.port:
            url_attributes["port"] = self.port
        if self.protocol:
            url_attributes["protocol"] = self.protocol

        database = self.get_database()
        if database:
            url_attributes["database"] = database

        db_schema = self.get_db_schema()
        if db_schema:
            url_attributes["schema"] = db_schema

        url = URL(**url_attributes)

        return url

    def list_databases(self):
        """Return list of databases for Snowflake account."""
        try:
            with self.get_connection() as connection:
                from sqlalchemy import text

                rows = connection.execute(text("SHOW DATABASES")).fetchall()
                return [r[1] for r in rows]  # Database name is in column 1
        except Exception as e:
            # Re-raise to allow proper error handling in UI
            raise e

    def get_schema(self, table_names: List[str] = None) -> Dict[str, Any]:
        """
        Build SQLGlot schema for Snowflake source using INFORMATION_SCHEMA.

        This method queries ALL schemas in the database to build a nested schema structure
        that supports multi-schema SQL queries (e.g., SELECT * FROM EDW.table JOIN REPORTING.goals).

        The schema structure is nested: {schema_name: {table_name: {col_name: type}}}
        This allows SQLGlot to resolve both qualified (SCHEMA.TABLE) and unqualified table references.

        Args:
            table_names: Optional list of table names to include. If None, includes all tables.
                        Can be unqualified ("table") or qualified ("schema.table").

        Returns:
            Dictionary containing:
            - tables: Dict mapping qualified table names (schema.table) to column info
            - sqlglot_schema: SQLGlot MappingSchema with nested schema structure
            - metadata: Additional metadata including default_schema for unqualified references
        """
        try:
            # Get the default schema (used for unqualified table references)
            default_schema = getattr(self, "db_schema", None) or "PUBLIC"

            # Initialize result structure
            result = {
                "tables": {},
                "sqlglot_schema": MappingSchema(),
                "metadata": {
                    "source_type": self.type,
                    "source_dialect": "snowflake",
                    "database": self.database,
                    "default_schema": default_schema,
                    "total_tables": 0,
                    "total_columns": 0,
                },
            }

            # Get all columns from ALL schemas in the database
            all_columns = self._extract_all_columns_from_information_schema(table_names)

            if not all_columns:
                return result

            # Build schema for each table, organized by schema
            # all_columns format: {schema_name: {table_name: [col_info, ...]}}
            for schema_name, tables in all_columns.items():
                for table_name, table_columns in tables.items():
                    qualified_name = f"{schema_name}.{table_name}"

                    table_info = {
                        "columns": {},
                        "metadata": {
                            "table_name": table_name,
                            "schema": schema_name,
                            "column_count": len(table_columns),
                        },
                    }

                    columns_dict = {}
                    for col_info in table_columns:
                        col_name = col_info["column_name"]

                        # Convert Snowflake type string to SQLGlot DataType
                        sqlglot_datatype = SqlglotTypeMapper._parse_type_string(
                            col_info["data_type"], dialect="snowflake"
                        )

                        table_info["columns"][col_name] = {
                            "type": col_info["data_type"],
                            "nullable": col_info["is_nullable"],
                            "default": col_info["column_default"],
                            "sqlglot_datatype": sqlglot_datatype,
                            "sqlglot_type_info": SqlglotTypeMapper.serialize_datatype(
                                sqlglot_datatype
                            ),
                        }
                        columns_dict[col_name] = sqlglot_datatype

                    # Store with qualified name for metadata tracking
                    result["tables"][qualified_name] = table_info

                    # Add to SQLGlot schema with qualified name
                    # This creates nested structure: {schema: {table: {col: type}}}
                    if columns_dict:
                        result["sqlglot_schema"].add_table(qualified_name, columns_dict)

            # Update metadata
            result["metadata"]["total_tables"] = len(result["tables"])
            result["metadata"]["total_columns"] = sum(
                len(table_info["columns"]) for table_info in result["tables"].values()
            )

            Logger.instance().debug(
                f"Built schema for Snowflake source '{self.name}' with "
                f"{result['metadata']['total_tables']} tables across multiple schemas"
            )

            return result

        except Exception as e:
            Logger.instance().error(f"Error building schema for Snowflake source {self.name}: {e}")
            return {
                "tables": {},
                "sqlglot_schema": MappingSchema(),
                "metadata": {"error": str(e), "total_tables": 0, "total_columns": 0},
            }

    def _extract_all_columns_from_information_schema(
        self, table_names: List[str] = None
    ) -> Dict[str, Dict[str, List[Dict[str, Any]]]]:
        """
        Extract schema information for ALL schemas in the database.

        This queries INFORMATION_SCHEMA.COLUMNS without filtering by schema,
        returning all tables from all schemas. This enables SQL queries that
        reference tables from multiple schemas (e.g., EDW.fact_order JOIN REPORTING.goals).

        Args:
            table_names: Optional list of table names to filter to.
                        Can be unqualified ("table") or qualified ("schema.table").

        Returns:
            Nested dict: {schema_name: {table_name: [column_info, ...]}}
        """
        try:
            with self.get_connection() as connection:
                from sqlalchemy import text

                # Query ALL schemas (exclude INFORMATION_SCHEMA system schema)
                query = text(
                    """
                    SELECT
                        TABLE_SCHEMA,
                        TABLE_NAME,
                        COLUMN_NAME,
                        DATA_TYPE,
                        IS_NULLABLE,
                        COLUMN_DEFAULT,
                        NUMERIC_PRECISION,
                        NUMERIC_SCALE,
                        CHARACTER_MAXIMUM_LENGTH
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA NOT IN ('INFORMATION_SCHEMA')
                    ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
                    """
                )

                rows = connection.execute(query).fetchall()

                # Build set of table names to filter (if provided)
                # Support both unqualified ("table") and qualified ("schema.table") names
                table_names_unqualified = set()
                table_names_qualified = set()
                if table_names:
                    for name in table_names:
                        if "." in name:
                            # Qualified name like "schema.table"
                            table_names_qualified.add(name.upper())
                        else:
                            # Unqualified name
                            table_names_unqualified.add(name.upper())

                # Group columns by schema -> table -> columns
                result: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}

                for row in rows:
                    schema_name = row[0]
                    table_name = row[1]
                    qualified_name = f"{schema_name}.{table_name}"

                    # Apply table name filter if provided
                    if table_names:
                        if qualified_name.upper() not in table_names_qualified:
                            if table_name.upper() not in table_names_unqualified:
                                continue

                    # Initialize nested structure
                    if schema_name not in result:
                        result[schema_name] = {}
                    if table_name not in result[schema_name]:
                        result[schema_name][table_name] = []

                    # Build type string with precision/scale/length if available
                    data_type = row[3]
                    numeric_precision = row[6]
                    numeric_scale = row[7]
                    char_max_length = row[8]

                    # Construct full type string
                    if numeric_precision is not None and numeric_scale is not None:
                        if numeric_scale > 0:
                            data_type = f"{data_type}({numeric_precision},{numeric_scale})"
                        else:
                            data_type = f"{data_type}({numeric_precision})"
                    elif char_max_length is not None:
                        data_type = f"{data_type}({char_max_length})"

                    result[schema_name][table_name].append(
                        {
                            "column_name": row[2],
                            "data_type": data_type,
                            "is_nullable": row[4] == "YES",
                            "column_default": row[5],
                        }
                    )

                return result

        except Exception as e:
            Logger.instance().debug(
                f"Error extracting columns from INFORMATION_SCHEMA for Snowflake: {e}"
            )
            return {}
