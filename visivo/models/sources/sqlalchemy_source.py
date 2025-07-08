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
        """Return a list of database names for this source."""
        engine = self.get_engine()
        dialect = engine.dialect.name
        try:
            with engine.connect() as conn:
                if dialect.startswith("mysql"):
                    rows = conn.execute(text("SHOW DATABASES")).fetchall()
                    return [r[0] for r in rows]
                if dialect.startswith("postgresql"):
                    rows = conn.execute(text("SELECT datname FROM pg_database"))
                    return [r[0] for r in rows]
                if dialect.startswith("snowflake"):
                    rows = conn.execute(text("SHOW DATABASES"))
                    return [r[1] for r in rows]
                if dialect.startswith("duckdb"):
                    rows = conn.execute(text("PRAGMA database_list")).fetchall()
                    return [r[2] for r in rows if r[2]]
        except Exception:
            pass
        return [self.database]

    def introspect(self):
        """Return metadata about databases, schemas, tables, and columns."""
        result = {"name": self.name, "type": self.type, "databases": []}
        db_names = self.list_databases()
        for db_name in db_names:
            src_copy = deepcopy(self)
            src_copy.database = db_name
            src_copy._engine = None
            engine = src_copy.get_engine()
            inspector = inspect(engine)
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
            result["databases"].append(db_entry)
        return result
