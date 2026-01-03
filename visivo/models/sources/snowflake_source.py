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

        This method uses a single query to INFORMATION_SCHEMA.COLUMNS to get all
        table and column information at once, which is significantly faster than
        the default SQLAlchemy Inspector approach that makes individual queries per table.

        Args:
            table_names: Optional list of table names to include. If None, includes all tables.

        Returns:
            Dictionary containing:
            - tables: Dict mapping table names to column info
            - sqlglot_schema: SQLGlot MappingSchema for query optimization
            - metadata: Additional metadata about the schema
        """
        try:
            # Get the schema name to query
            schema_name = getattr(self, "db_schema", None) or "PUBLIC"

            # Initialize result structure
            result = {
                "tables": {},
                "sqlglot_schema": MappingSchema(),
                "metadata": {
                    "source_type": self.type,
                    "source_dialect": "snowflake",
                    "database": self.database,
                    "schema": schema_name,
                    "total_tables": 0,
                    "total_columns": 0,
                },
            }

            # Get all columns (and implicitly all tables) in a single query
            all_columns = self._extract_all_columns_from_information_schema(
                schema_name, table_names
            )

            if not all_columns:
                return result

            # Build schema for each table
            for table_name, table_columns in all_columns.items():
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
                    sqlglot_datatype = SqlglotTypeMapper._parse_type_string(col_info["data_type"])

                    table_info["columns"][col_name] = {
                        "type": col_info["data_type"],
                        "nullable": col_info["is_nullable"],
                        "default": col_info["column_default"],
                        "sqlglot_datatype": sqlglot_datatype,
                        "sqlglot_type_info": SqlglotTypeMapper.serialize_datatype(sqlglot_datatype),
                    }
                    columns_dict[col_name] = sqlglot_datatype

                result["tables"][table_name] = table_info

                # Add to SQLGlot schema
                if columns_dict:
                    result["sqlglot_schema"].add_table(table_name, columns_dict)

            # Update metadata
            result["metadata"]["total_tables"] = len(result["tables"])
            result["metadata"]["total_columns"] = sum(
                len(table_info["columns"]) for table_info in result["tables"].values()
            )

            Logger.instance().debug(
                f"Built schema for Snowflake source '{self.name}' with "
                f"{result['metadata']['total_tables']} tables"
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
        self, schema_name: str, table_names: List[str] = None
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Extract schema information for all tables in a single query.

        This gets all table and column info from INFORMATION_SCHEMA.COLUMNS,
        which is much more efficient than querying each table individually.

        Args:
            schema_name: The schema to query
            table_names: Optional list of table names to filter to

        Returns:
            Dictionary mapping table names to lists of column info dicts.
        """
        try:
            with self.get_connection() as connection:
                from sqlalchemy import text

                # Single query to get all columns - table names come from the results
                query = text(
                    """
                    SELECT
                        TABLE_NAME,
                        COLUMN_NAME,
                        DATA_TYPE,
                        IS_NULLABLE,
                        COLUMN_DEFAULT,
                        NUMERIC_PRECISION,
                        NUMERIC_SCALE,
                        CHARACTER_MAXIMUM_LENGTH
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = :schema_name
                    ORDER BY TABLE_NAME, ORDINAL_POSITION
                    """
                )

                rows = connection.execute(query, {"schema_name": schema_name}).fetchall()

                # Group columns by table name
                columns_by_table: Dict[str, List[Dict[str, Any]]] = {}
                table_names_set = set(table_names) if table_names else None

                for row in rows:
                    table_name = row[0]

                    # Skip tables not in our filter list (if filtering)
                    if table_names_set and table_name not in table_names_set:
                        continue

                    if table_name not in columns_by_table:
                        columns_by_table[table_name] = []

                    # Build type string with precision/scale/length if available
                    data_type = row[2]
                    numeric_precision = row[5]
                    numeric_scale = row[6]
                    char_max_length = row[7]

                    # Construct full type string
                    if numeric_precision is not None and numeric_scale is not None:
                        if numeric_scale > 0:
                            data_type = f"{data_type}({numeric_precision},{numeric_scale})"
                        else:
                            data_type = f"{data_type}({numeric_precision})"
                    elif char_max_length is not None:
                        data_type = f"{data_type}({char_max_length})"

                    columns_by_table[table_name].append(
                        {
                            "column_name": row[1],
                            "data_type": data_type,
                            "is_nullable": row[3] == "YES",
                            "column_default": row[4],
                        }
                    )

                return columns_by_table

        except Exception as e:
            Logger.instance().debug(
                f"Error extracting columns from INFORMATION_SCHEMA for Snowflake: {e}"
            )
            return {}
