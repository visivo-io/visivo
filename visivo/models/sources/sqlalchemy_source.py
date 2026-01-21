from abc import ABC, abstractmethod
from typing import Any, Optional, Dict, List, ClassVar, Set
import click
from pydantic import PrivateAttr
from visivo.models.sources.source import Source
from sqlalchemy import create_engine, event, text, inspect
from sqlalchemy.pool import NullPool
from visivo.logger.logger import Logger
import polars as pl
from copy import deepcopy
import pyarrow as pa
import json
from datetime import datetime, date, time
from decimal import Decimal
from sqlglot.schema import MappingSchema
from visivo.query.sqlglot_type_mapper import SqlglotTypeMapper


class SqlalchemySource(Source, ABC):

    _engine: Any = PrivateAttr(default=None)
    after_connect: Optional[str] = None

    @abstractmethod
    def url(self):
        """Return the URL for this source."""
        raise NotImplementedError(f"No url method implemented for {self.type}")

    def read_sql(self, query: str, **kwargs):
        with self.connect() as connection:
            query = text(query)
            results = connection.execute(query)
            columns = list(results.keys())
            data = results.fetchall()
            results.close()

        # Convert to list of dictionaries
        result_data = []
        for row in data:
            row_dict = {}
            for i, col in enumerate(columns):
                value = row[i]
                # Convert complex types to JSON strings for consistency
                if isinstance(value, (dict, list)):
                    value = json.dumps(value)
                row_dict[col] = value
            result_data.append(row_dict)

        return result_data

    def get_connection(self):

        try:
            connection = (
                self.get_engine().connect()
            )  # I wonder if creating mutltiple engines is part of the problem.
            if hasattr(self, "attach") and self.attach:
                for attachment in self.attach:
                    connection.execute(
                        text(
                            f"attach database '{attachment.source.database}' as {attachment.schema_name};"
                        )
                    )
            return connection
        except Exception as err:
            raise click.ClickException(
                f"Error connecting to source '{self.name}'. Ensure the database is running and the connection properties are correct. Full Error: {str(err)}"
            )

    def get_engine(self):

        if not self._engine:

            Logger.instance().debug(f"Creating engine for Source: {self.name}")
            self._engine = create_engine(
                self.url(), poolclass=NullPool, connect_args=self.connect_args()
            )

            @event.listens_for(self._engine, "connect")
            def connect(dbapi_connection, connection_record):
                if self.after_connect:
                    cursor_obj = dbapi_connection.cursor()
                    cursor_obj.execute(self.after_connect)
                    cursor_obj.close()

        return self._engine

    def __deepcopy__(self, memo):
        copied = self.model_copy(deep=False)
        # manually deepcopy only safe attrs
        for name, val in self.__dict__.items():
            if name != "_plugin_module":
                setattr(copied, name, deepcopy(val, memo))
        return copied

    def connect_args(self):
        return {}

    def list_databases(self):
        """Return a list of database names for this source.

        This method must be overridden by each source implementation to ensure
        proper connection testing and database discovery.
        """
        raise NotImplementedError(
            f"{self.__class__.__name__} must implement list_databases() method. "
            "This ensures proper connection testing rather than falsely returning a default."
        )

    def introspect(self):
        """Return metadata about databases, schemas, tables, and columns efficiently."""
        result = {"name": self.name, "type": self.type, "databases": []}
        db_names = self.list_databases()

        # Use read-only engine for introspection when available (DuckDB)
        engine = None
        try:
            if hasattr(self, "get_engine") and "read_only" in self.get_engine.__code__.co_varnames:
                engine = self.get_engine(read_only=True)
            else:
                engine = self.get_engine()

            dialect = engine.dialect.name

            # Handle different database paradigms efficiently
            if dialect.startswith(("duckdb", "mysql", "snowflake")):
                # These can access multiple databases via single connection
                result["databases"] = self._introspect_via_single_connection(engine, db_names)
            elif dialect.startswith("postgresql"):
                # PostgreSQL typically needs separate connections per database
                result["databases"] = self._introspect_via_multiple_connections(db_names)
            else:
                # Default to single connection approach for other dialects
                result["databases"] = self._introspect_via_single_connection(engine, db_names)

        except Exception as e:
            Logger.instance().error(f"Error during introspection for {self.name}: {str(e)}")
            result["error"] = str(e)
        finally:
            # Clean up if we created a temporary engine
            if engine and hasattr(self, "_read_only_engine") and engine == self._read_only_engine:
                pass  # Don't dispose cached engines
            elif engine and engine != self._engine:
                engine.dispose()

        return result

    def _introspect_via_single_connection(self, engine, db_names):
        """Introspect multiple databases using a single connection."""
        databases = []
        inspector = inspect(engine)
        dialect = engine.dialect.name

        with engine.connect() as conn:
            for db_name in db_names:
                try:
                    # Switch database context if needed (MySQL/Snowflake)
                    if dialect.startswith(("mysql", "snowflake")) and db_name != self.database:
                        conn.execute(text(f"USE {db_name}"))
                        # Need new inspector after database switch
                        inspector = inspect(engine)

                    db_entry = self._introspect_database(inspector, db_name)
                    databases.append(db_entry)

                except Exception as e:
                    Logger.instance().debug(f"Failed to introspect database {db_name}: {str(e)}")
                    databases.append({"name": db_name, "error": str(e)})

        return databases

    def _introspect_via_multiple_connections(self, db_names):
        """Introspect databases that require separate connections (PostgreSQL)."""
        databases = []

        for db_name in db_names:
            engine = None
            try:
                # Only create new engine if database is different
                if db_name != self.database:
                    src_copy = deepcopy(self)
                    src_copy.database = db_name
                    src_copy._engine = None
                    if hasattr(src_copy, "_read_only_engine"):
                        src_copy._read_only_engine = None
                    engine = src_copy.get_engine()
                else:
                    engine = self.get_engine()

                inspector = inspect(engine)
                db_entry = self._introspect_database(inspector, db_name)
                databases.append(db_entry)

            except Exception as e:
                Logger.instance().debug(f"Failed to introspect database {db_name}: {str(e)}")
                databases.append({"name": db_name, "error": str(e)})
            finally:
                # Only dispose if we created a temporary engine
                if engine and db_name != self.database:
                    engine.dispose()

        return databases

    def _introspect_database(self, inspector, db_name):
        """Introspect a single database using the provided inspector."""
        try:
            schemas = inspector.get_schema_names()
        except Exception:
            schemas = []

        db_entry = {"name": db_name}

        if schemas:
            db_entry["schemas"] = []
            for schema in schemas:
                try:
                    tables = inspector.get_table_names(schema=schema)
                except Exception:
                    tables = []

                table_entries = []
                for table in tables:
                    try:
                        cols = [c["name"] for c in inspector.get_columns(table, schema=schema)]
                    except Exception:
                        cols = []
                    table_entries.append({"name": table, "columns": cols})

                db_entry["schemas"].append({"name": schema, "tables": table_entries})
        else:
            # No schemas, list tables directly
            try:
                tables = inspector.get_table_names()
            except Exception:
                tables = []

            table_entries = []
            for table in tables:
                try:
                    cols = [c["name"] for c in inspector.get_columns(table)]
                except Exception:
                    cols = []
                table_entries.append({"name": table, "columns": cols})

            db_entry["tables"] = table_entries

        return db_entry

    def get_sqlglot_dialect(self):
        from visivo.query.sqlglot_utils import get_sqlglot_dialect

        return get_sqlglot_dialect(self.get_dialect())

    def get_schema(self, table_names: List[str] = None) -> Dict[str, Any]:
        """
        Build SQLGlot schema for this source.

        Args:
            table_names: Optional list of table names to include. If None, includes all tables.

        Returns:
            Dictionary containing:
            - tables: Dict mapping table names to column info
            - sqlglot_schema: SQLGlot MappingSchema for query optimization
            - metadata: Additional metadata about the schema
        """
        try:
            # Use existing engine or create one
            engine = self.get_engine()
            inspector = inspect(engine)

            # Get SQLGlot dialect for this source
            sqlglot_dialect = self.get_sqlglot_dialect()

            # Initialize result structure
            result = {
                "tables": {},
                "sqlglot_schema": MappingSchema(),
                "metadata": {
                    "source_dialect": sqlglot_dialect,
                    "database": self.database,
                    "schema": getattr(self, "db_schema", None),
                    "total_tables": 0,
                    "total_columns": 0,
                },
            }

            # Get available tables to process
            available_tables = self._get_available_tables_for_schema(inspector, table_names)

            # Process each table
            for table_name in available_tables:
                table_info = self._extract_table_schema(inspector, table_name)
                if table_info:
                    result["tables"][table_name] = table_info

                    # Add to SQLGlot schema
                    columns_dict = {}
                    for col_name, col_info in table_info["columns"].items():
                        if "sqlglot_datatype" in col_info:
                            columns_dict[col_name] = col_info["sqlglot_datatype"]

                    if columns_dict:
                        # Extract base table name for SQLGlot schema to avoid nesting level issues
                        base_table_name = (
                            table_name.split(".", 1)[-1] if "." in table_name else table_name
                        )
                        result["sqlglot_schema"].add_table(base_table_name, columns_dict)

            # Update metadata
            result["metadata"]["total_tables"] = len(result["tables"])
            result["metadata"]["total_columns"] = sum(
                len(table_info["columns"]) for table_info in result["tables"].values()
            )

            Logger.instance().debug(
                f"Built schema for source '{self.name}' with {result['metadata']['total_tables']} tables"
            )

            return result

        except Exception as e:
            Logger.instance().error(f"Error building schema for source {self.name}: {e}")
            # Return minimal schema to avoid breaking downstream code
            return {
                "tables": {},
                "sqlglot_schema": MappingSchema(),
                "metadata": {"error": str(e), "total_tables": 0, "total_columns": 0},
            }

    def _get_available_tables_for_schema(
        self, inspector, table_names: List[str] = None
    ) -> List[str]:
        """Get list of tables to process for schema building."""
        try:
            if table_names:
                # Filter to only requested tables that exist
                all_tables = set()

                # Try to get tables from default schema
                try:
                    default_tables = inspector.get_table_names()
                    all_tables.update(default_tables)
                except Exception:
                    pass

                # Try to get tables from specified schema
                if hasattr(self, "db_schema") and self.db_schema:
                    try:
                        schema_tables = inspector.get_table_names(schema=self.db_schema)
                        all_tables.update([f"{self.db_schema}.{t}" for t in schema_tables])
                    except Exception:
                        pass

                # Return intersection of requested and available tables
                return [t for t in table_names if t in all_tables]

            else:
                # Get all available tables
                tables = []

                # Get tables from default schema
                try:
                    default_tables = inspector.get_table_names()
                    tables.extend(default_tables)
                except Exception:
                    pass

                # Get tables from specified schema if different
                if hasattr(self, "db_schema") and self.db_schema:
                    try:
                        schema_tables = inspector.get_table_names(schema=self.db_schema)
                        # Add schema-qualified names
                        tables.extend([f"{self.db_schema}.{t}" for t in schema_tables])
                    except Exception:
                        pass

                return list(set(tables))  # Remove duplicates

        except Exception as e:
            Logger.instance().debug(f"Error getting available tables: {e}")
            return []

    def _extract_table_schema(self, inspector, table_name: str) -> Optional[Dict[str, Any]]:
        """Extract schema information for a single table."""
        try:
            # Parse table name to handle schema qualification
            schema_name = None
            base_table_name = table_name

            if "." in table_name:
                schema_name, base_table_name = table_name.split(".", 1)
            elif hasattr(self, "db_schema") and self.db_schema:
                schema_name = self.db_schema

            # Get column information
            try:
                columns_info = inspector.get_columns(base_table_name, schema=schema_name)
            except Exception:
                # Try without schema if schema-qualified lookup fails
                columns_info = inspector.get_columns(base_table_name)

            if not columns_info:
                return None

            # Process columns
            table_schema = {
                "columns": {},
                "metadata": {
                    "table_name": table_name,
                    "schema": schema_name,
                    "column_count": len(columns_info),
                },
            }

            for col_info in columns_info:
                col_name = col_info["name"]
                col_type = col_info["type"]

                # Convert SQLAlchemy type to SQLGlot DataType
                sqlglot_datatype = SqlglotTypeMapper.sqlalchemy_to_sqlglot_type(col_type)

                table_schema["columns"][col_name] = {
                    "type": str(col_type),
                    "nullable": col_info.get("nullable", True),
                    "default": col_info.get("default"),
                    "sqlglot_datatype": sqlglot_datatype,
                    "sqlglot_type_info": SqlglotTypeMapper.serialize_datatype(sqlglot_datatype),
                }

            return table_schema

        except Exception as e:
            Logger.instance().debug(f"Error extracting schema for table {table_name}: {e}")
            return None

    # --- Granular introspection methods ---

    SYSTEM_SCHEMAS: ClassVar[Set[str]] = {
        "information_schema",
        "pg_catalog",
        "pg_toast",
        "pg_temp_1",
        "sys",
        "performance_schema",
        "mysql",
    }

    def get_schemas(self, database_name: str) -> List[str]:
        """Return list of schema names, filtering system schemas."""
        with self.connect() as connection:
            dialect = connection.engine.dialect.name

            # Handle database context switching for MySQL/Snowflake
            if dialect.startswith(("mysql", "snowflake")):
                current_db = getattr(self, "database", None)
                if current_db and database_name != current_db:
                    connection.execute(text(f"USE {database_name}"))

            inspector = inspect(connection)
            schemas = inspector.get_schema_names()
            return [s for s in schemas if s.lower() not in self.SYSTEM_SCHEMAS]

    def get_tables(
        self, database_name: str, schema_name: Optional[str] = None
    ) -> List[Dict[str, str]]:
        """Return list of tables and views with type info."""
        with self.connect() as connection:
            dialect = connection.engine.dialect.name

            # Handle database context switching for MySQL/Snowflake
            if dialect.startswith(("mysql", "snowflake")):
                current_db = getattr(self, "database", None)
                if current_db and database_name != current_db:
                    connection.execute(text(f"USE {database_name}"))

            inspector = inspect(connection)
            tables = [
                {"name": t, "type": "table"} for t in inspector.get_table_names(schema=schema_name)
            ]
            views = [
                {"name": v, "type": "view"} for v in inspector.get_view_names(schema=schema_name)
            ]
            return sorted(tables + views, key=lambda x: x["name"])

    def get_columns(
        self, database_name: str, table_name: str, schema_name: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Return list of columns with type and nullable info."""
        with self.connect() as connection:
            dialect = connection.engine.dialect.name

            # Handle database context switching for MySQL/Snowflake
            if dialect.startswith(("mysql", "snowflake")):
                current_db = getattr(self, "database", None)
                if current_db and database_name != current_db:
                    connection.execute(text(f"USE {database_name}"))

            inspector = inspect(connection)
            columns = inspector.get_columns(table_name, schema=schema_name)
            return [
                {
                    "name": c["name"],
                    "type": str(c["type"]),
                    "nullable": c.get("nullable", True),
                    **({"default": str(c["default"])} if c.get("default") is not None else {}),
                }
                for c in columns
            ]

    def get_table_preview(
        self,
        database_name: str,
        table_name: str,
        schema_name: Optional[str] = None,
        limit: int = 100,
    ) -> Dict[str, Any]:
        """Return preview rows using existing read_sql() method."""
        # Clamp limit to valid range
        limit = min(max(limit, 1), 1000)

        # Build fully qualified table name
        if schema_name:
            full_table = f'"{schema_name}"."{table_name}"'
        else:
            full_table = f'"{table_name}"'

        # Reuse existing read_sql() which handles connection properly
        rows = self.read_sql(f"SELECT * FROM {full_table} LIMIT {limit}")
        columns = list(rows[0].keys()) if rows else []
        return {"columns": columns, "rows": rows, "row_count": len(rows)}
