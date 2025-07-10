from abc import ABC, abstractmethod
from typing import Any, Optional
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


class SqlalchemySource(Source, ABC):

    _engine: Any = PrivateAttr(default=None)
    after_connect: Optional[str] = None

    @abstractmethod
    def get_dialect(self):
        raise NotImplementedError(f"No dialect method implemented for {self.type}")

    def read_sql(self, query: str):
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
