"""
Base class for sources that use DuckDB as their underlying engine.
"""

from typing import Dict, List, Any, Optional, ClassVar, Set
from abc import abstractmethod
import duckdb
import click
from visivo.models.sources.source import Source
from visivo.logger.logger import Logger
from sqlglot.schema import MappingSchema
from visivo.query.sqlglot_type_mapper import SqlglotTypeMapper


class BaseDuckdbSource(Source):
    """
    Base class for sources that use DuckDB as their underlying database engine.

    This includes:
    - DuckDB database files
    - CSV files (via DuckDB's read_csv_auto)
    - Excel files (via DuckDB's read_csv_auto after conversion)
    """

    def get_dialect(self):
        """All DuckDB-based sources use the duckdb dialect."""
        return "duckdb"

    def get_sqlglot_dialect(self):
        return self.get_dialect()

    def description(self):
        """Return a description of this source for logging and error messages."""
        return f"{self.type} source '{self.name}'"

    @abstractmethod
    def get_connection(self, read_only: bool = False):
        """Create a DuckDB connection. Must be implemented by subclasses."""
        raise NotImplementedError(f"No get_connection method implemented for {self.type}")

    @abstractmethod
    def _setup_connection(self, connection, **kwargs):
        """Setup the DuckDB connection (create views, attach databases, etc.)."""
        raise NotImplementedError(f"No _setup_connection method implemented for {self.type}")

    def read_sql(self, query: str, **kwargs):
        """Execute a SQL query against the DuckDB connection."""
        try:
            with self.connect(read_only=True, **kwargs) as connection:
                result = connection.execute(query)
                columns = [desc[0] for desc in result.description] if result.description else []
                rows = result.fetchall()
                return [dict(zip(columns, row)) for row in rows]
        except Exception as err:
            raise click.ClickException(
                f"Error executing query on {self.type} source '{self.name}': {str(err)}"
            )

    def connect(self, read_only: bool = False, **kwargs):
        """Return a context manager for DuckDB connections."""
        return DuckdbConnection(source=self, read_only=read_only, **kwargs)

    def get_schema(self, table_names: List[str] = None) -> Dict[str, Any]:
        """
        Build SQLGlot schema using DuckDB's introspection capabilities.

        This method uses DuckDB's built-in schema introspection to discover
        table and column information, then converts it to SQLGlot format.
        """
        try:
            # Get available tables from DuckDB
            with self.connect(read_only=True) as connection:
                # Get all tables/views available
                available_tables = self._get_available_tables_from_duckdb(connection, table_names)

                if not available_tables:
                    return {
                        "tables": {},
                        "sqlglot_schema": MappingSchema(),
                        "metadata": {
                            "total_tables": 0,
                            "total_columns": 0,
                            "source_type": self.type,
                        },
                    }

                # Build schema for each table
                result = {
                    "tables": {},
                    "sqlglot_schema": MappingSchema(),
                    "metadata": {"source_type": self.type, "total_tables": 0, "total_columns": 0},
                }

                for table_name in available_tables:
                    table_info = self._extract_table_schema_from_duckdb(connection, table_name)
                    if table_info:
                        result["tables"][table_name] = table_info

                        # Add to SQLGlot schema
                        columns_dict = {}
                        for col_name, col_info in table_info["columns"].items():
                            if "sqlglot_datatype" in col_info:
                                columns_dict[col_name] = col_info["sqlglot_datatype"]

                        if columns_dict:
                            try:
                                result["sqlglot_schema"].add_table(table_name, columns_dict)
                            except Exception as e:
                                Logger.instance().debug(
                                    f"Failed to add table '{table_name}' to SQLGlot schema: {e}"
                                )
                                # Try with quoted identifier
                                try:
                                    quoted_name = f'"{table_name}"'
                                    result["sqlglot_schema"].add_table(quoted_name, columns_dict)
                                    Logger.instance().debug(
                                        f"Successfully added quoted table '{quoted_name}' to SQLGlot schema"
                                    )
                                except Exception as e2:
                                    Logger.instance().debug(
                                        f"Failed to add quoted table '{quoted_name}' to SQLGlot schema: {e2}"
                                    )
                                    # Continue without adding to SQLGlot schema, but keep the table info

                # Update metadata
                result["metadata"]["total_tables"] = len(result["tables"])
                result["metadata"]["total_columns"] = sum(
                    len(table_info["columns"]) for table_info in result["tables"].values()
                )

                Logger.instance().debug(
                    f"Built DuckDB schema for '{self.name}' with {result['metadata']['total_tables']} tables"
                )

                return result

        except Exception as e:
            Logger.instance().error(
                f"Error building schema for {self.type} source {self.name}: {e}"
            )
            return {
                "tables": {},
                "sqlglot_schema": MappingSchema(),
                "metadata": {
                    "error": str(e),
                    "total_tables": 0,
                    "total_columns": 0,
                    "source_type": self.type,
                },
            }

    def _get_available_tables_from_duckdb(
        self, connection, table_names: List[str] = None
    ) -> List[str]:
        """Get list of tables/views available in the DuckDB connection."""
        try:
            # Query both tables and views from DuckDB's information schema
            # CSV and Excel sources create views, not tables
            # Exclude DuckDB system tables/views (they start with 'duckdb_', 'sqlite_', or 'pragma_')
            tables_result = connection.execute(
                """
                SELECT table_name, 'table' as object_type
                FROM information_schema.tables
                WHERE table_schema = 'main'
                AND table_name NOT LIKE 'duckdb_%'
                AND table_name NOT LIKE 'sqlite_%'
                AND table_name NOT LIKE 'pragma_%'
                UNION ALL
                SELECT table_name, 'view' as object_type
                FROM information_schema.views
                WHERE table_schema = 'main'
                AND table_name NOT LIKE 'duckdb_%'
                AND table_name NOT LIKE 'sqlite_%'
                AND table_name NOT LIKE 'pragma_%'
                ORDER BY table_name
            """
            )

            all_tables = [row[0] for row in tables_result.fetchall()]

            # Debug logging to help diagnose issues
            Logger.instance().debug(f"Found tables/views in DuckDB: {all_tables}")

            # Filter to requested tables if specified
            if table_names:
                filtered_tables = [t for t in all_tables if t in table_names]
                Logger.instance().debug(f"Filtered to requested tables: {filtered_tables}")
                return filtered_tables

            return all_tables

        except Exception as e:
            Logger.instance().error(f"Error getting tables from DuckDB: {e}")
            # Fallback: try to get just tables if views query fails
            try:
                result = connection.execute(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'main'
                    AND table_name NOT LIKE 'duckdb_%'
                    AND table_name NOT LIKE 'sqlite_%'
                    AND table_name NOT LIKE 'pragma_%'
                    ORDER BY table_name
                """
                )
                fallback_tables = [row[0] for row in result.fetchall()]
                Logger.instance().debug(f"Fallback found tables: {fallback_tables}")

                if table_names:
                    return [t for t in fallback_tables if t in table_names]
                return fallback_tables
            except Exception as e2:
                Logger.instance().debug(f"Fallback query also failed: {e2}")
                return []

    def _extract_table_schema_from_duckdb(
        self, connection, table_name: str
    ) -> Optional[Dict[str, Any]]:
        """Extract schema information for a single table using DuckDB's DESCRIBE."""
        try:
            # Use DuckDB's DESCRIBE to get column information
            # Quote the table name to handle special characters like hyphens
            quoted_table_name = f'"{table_name}"'
            result = connection.execute(f"DESCRIBE {quoted_table_name}")
            columns_info = result.fetchall()

            if not columns_info:
                return None

            # Process columns - DuckDB DESCRIBE returns: column_name, column_type, null, key, default, extra
            table_schema = {
                "columns": {},
                "metadata": {"table_name": table_name, "column_count": len(columns_info)},
            }

            for col_info in columns_info:
                col_name = col_info[0]  # column_name
                col_type_str = col_info[1]  # column_type
                is_nullable = col_info[2] == "YES"  # null

                # Convert DuckDB type string to SQLGlot DataType
                sqlglot_datatype = SqlglotTypeMapper._parse_type_string(col_type_str)

                table_schema["columns"][col_name] = {
                    "type": col_type_str,
                    "nullable": is_nullable,
                    "sqlglot_datatype": sqlglot_datatype,
                    "sqlglot_type_info": SqlglotTypeMapper.serialize_datatype(sqlglot_datatype),
                }

            return table_schema

        except Exception as e:
            Logger.instance().debug(f"Error extracting schema for table {table_name}: {e}")
            return None

    # --- Granular introspection methods ---

    SYSTEM_SCHEMAS: ClassVar[Set[str]] = {"information_schema", "pg_catalog"}

    def get_schemas(self, database_name: str) -> List[str]:
        """DuckDB typically has 'main' schema only."""
        with self.connect(read_only=True) as connection:
            result = connection.execute(
                """
                SELECT DISTINCT schema_name
                FROM information_schema.schemata
                WHERE schema_name NOT IN ('information_schema', 'pg_catalog')
                ORDER BY schema_name
            """
            )
            return [row[0] for row in result.fetchall()]

    def get_tables(
        self, database_name: str, schema_name: Optional[str] = None
    ) -> List[Dict[str, str]]:
        """Get tables and views, similar to existing _get_available_tables_from_duckdb()."""
        schema_filter = f"= '{schema_name}'" if schema_name else "= 'main'"

        with self.connect(read_only=True) as connection:
            result = connection.execute(
                f"""
                SELECT table_name, 'table' as type FROM information_schema.tables
                WHERE table_schema {schema_filter}
                AND table_name NOT LIKE 'duckdb_%' AND table_name NOT LIKE 'sqlite_%'
                AND table_name NOT LIKE 'pragma_%'
                UNION ALL
                SELECT table_name, 'view' as type FROM information_schema.views
                WHERE table_schema {schema_filter}
                AND table_name NOT LIKE 'duckdb_%' AND table_name NOT LIKE 'sqlite_%'
                AND table_name NOT LIKE 'pragma_%'
                ORDER BY table_name
            """
            )
            return [{"name": row[0], "type": row[1]} for row in result.fetchall()]

    def get_columns(
        self, database_name: str, table_name: str, schema_name: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Use DESCRIBE, similar to existing _extract_table_schema_from_duckdb()."""
        with self.connect(read_only=True) as connection:
            quoted_table = f'"{table_name}"'
            result = connection.execute(f"DESCRIBE {quoted_table}")
            return [
                {"name": row[0], "type": row[1], "nullable": row[2] == "YES"}
                for row in result.fetchall()
            ]

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
        quoted_table = f'"{table_name}"'
        rows = self.read_sql(f"SELECT * FROM {quoted_table} LIMIT {limit}")
        columns = list(rows[0].keys()) if rows else []
        return {"columns": columns, "rows": rows, "row_count": len(rows)}


class DuckdbConnection:
    """Context manager for DuckDB connections."""

    def __init__(self, source: BaseDuckdbSource, read_only: bool = False, **kwargs):
        self.source = source
        self.read_only = read_only
        self.kwargs = kwargs
        self.connection = None

    def __enter__(self):
        self.connection = self.source.get_connection(read_only=self.read_only)
        # Let the source set up the connection (create views, attach DBs, etc.)
        self.source._setup_connection(self.connection, **self.kwargs)
        return self.connection

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.connection:
            self.connection.close()
            self.connection = None
