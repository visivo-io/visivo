from typing import Literal, Optional, List, Any
from visivo.models.base.base_model import BaseModel
from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from pydantic import Field, PrivateAttr
import click
from sqlalchemy import create_engine, event
from sqlalchemy.pool import NullPool
from visivo.logger.logger import Logger

DuckdbType = Literal["duckdb"]


class DuckdbAttachment(BaseModel):
    schema_name: str = Field("Name of the schema to attach the source under.")
    source: "DuckdbSource" = Field(
        None,
        description="Local Duckdb database source to attach in the connection that will be available in the base SQL query.",
    )


class DuckdbSource(SqlalchemySource):
    # Cache both read-only and read-write engines
    _read_only_engine: Any = PrivateAttr(default=None)
    """
    DuckdbSources hold the connection information to DuckDB data sources.

    !!! example

        === "Simple"

            ``` yaml
                sources:
                  - name: duckdb_source
                    type: duckdb
                    database: local/file/database.db
                    connection_pool_size: 2
            ```

    !!! note

        Recommended environment variable use is covered in the [sources overview.](/topics/sources/)
    """

    type: DuckdbType
    connection_pool_size: Optional[int] = Field(
        1, description="The pool size that is used for this connection."
    )
    attach: Optional[List[DuckdbAttachment]] = Field(
        None,
        description="List of other local Duckdb database sources to attach in the connection that will be available in the base SQL query.",
    )

    def get_engine(self, read_only: bool = False):
        """Get engine with proper read_only support for DuckDB."""
        if read_only:
            if not self._read_only_engine:
                Logger.instance().debug(f"Creating read-only engine for Source: {self.name}")
                self._read_only_engine = create_engine(
                    self.url(), poolclass=NullPool, connect_args={"read_only": True}
                )

                @event.listens_for(self._read_only_engine, "connect")
                def connect_readonly(dbapi_connection, connection_record):
                    if self.after_connect:
                        cursor_obj = dbapi_connection.cursor()
                        cursor_obj.execute(self.after_connect)
                        cursor_obj.close()

            return self._read_only_engine
        else:
            # Create read-write engine with proper connection args
            if not self._engine:
                Logger.instance().debug(f"Creating read-write engine for Source: {self.name}")
                self._engine = create_engine(
                    self.url(), poolclass=NullPool, connect_args={"read_only": False}
                )

                @event.listens_for(self._engine, "connect")
                def connect_readwrite(dbapi_connection, connection_record):
                    if self.after_connect:
                        cursor_obj = dbapi_connection.cursor()
                        cursor_obj.execute(self.after_connect)
                        cursor_obj.close()

            return self._engine

    def get_connection(self, read_only: bool = False):
        """Return a DuckDBPyConnection using direct DuckDB connection with proper read_only support."""
        try:
            import duckdb
            import os

            Logger.instance().debug(f"Getting connection for {self.name}, read_only={read_only}")

            # Ensure database file exists for write operations
            if not read_only and not os.path.exists(self.database):
                Logger.instance().debug(
                    f"Database file {self.database} does not exist, creating it"
                )
                os.makedirs(os.path.dirname(self.database), exist_ok=True)
                # Create the database file
                temp_conn = duckdb.connect(self.database)
                temp_conn.close()

            # Connect directly to DuckDB with proper read_only flag
            Logger.instance().debug(f"Connecting to {self.database} with read_only={read_only}")
            connection = duckdb.connect(self.database, read_only=read_only)
            Logger.instance().debug(f"Direct DuckDB connection established for {self.name}")

            # Execute after_connect if specified
            if self.after_connect:
                connection.execute(self.after_connect)

            if self.attach:
                for attachment in self.attach:
                    connection.execute(
                        f"ATTACH DATABASE '{attachment.source.database}' AS {attachment.schema_name} (READ_ONLY)"
                    )
            return connection
        except Exception as err:
            raise click.ClickException(
                f"Error connecting to source '{self.name}'. Ensure the database exists and the connection properties are correct. Full Error: {str(err)}"
            )

    def get_dialect(self):
        return "duckdb"

    def read_sql(self, query: str):
        try:
            with self.connect(read_only=True) as connection:
                # Execute query and get raw results
                result = connection.execute(query)

                # Get column names
                columns = [desc[0] for desc in result.description] if result.description else []

                # Fetch all rows
                rows = result.fetchall()

                # Convert to list of dictionaries
                data = []
                for row in rows:
                    row_dict = {}
                    for i, col in enumerate(columns):
                        row_dict[col] = row[i]
                    data.append(row_dict)

                return data
        except Exception as err:
            raise click.ClickException(f"Error executing query on source '{self.name}': {str(err)}")

    def connect(self, read_only: bool = False):
        """Create a context manager for DuckDB connections."""
        return DuckDBConnection(source=self, read_only=read_only)

    def connect_args(self):
        """Override to provide DuckDB-specific connection arguments for the default engine."""
        # The default cached engine (via super().get_engine()) is read-write
        # Read-only connections use a separate cached engine
        return {}

    def list_databases(self):
        """Return list of databases for DuckDB (includes attached databases)."""
        try:
            with self.connect(read_only=True) as connection:
                rows = connection.execute("PRAGMA database_list").fetchall()
                databases = []

                # DuckDB returns: (sequence_num, db_name, file_path)
                # For DuckDB, we always return 'main' as the primary database name
                # This provides consistency and avoids exposing file paths in the UI

                Logger.instance().debug(f"DuckDB PRAGMA database_list result: {rows}")

                # Always add 'main' for the primary database
                databases.append("main")

                # Add any attached databases (excluding temp/system)
                for row in rows:
                    db_name = row[1]
                    if db_name not in ["temp", "system", "main"] and row[2]:
                        # For attached databases, use their actual names
                        databases.append(db_name)

                Logger.instance().debug(f"DuckDB list_databases returning: {databases}")
                return databases
        except Exception as e:
            # Re-raise to allow proper error handling in UI
            raise e

    def dispose_engines(self):
        """Dispose of cached engines to release database locks."""
        if self._read_only_engine:
            self._read_only_engine.dispose()
            self._read_only_engine = None
        if self._engine:
            self._engine.dispose()
            self._engine = None

    def __del__(self):
        """Ensure engines are disposed when source is destroyed."""
        try:
            self.dispose_engines()
        except Exception:
            # Ignore errors during cleanup
            pass

    @classmethod
    def create_empty_database(cls, database_path: str):
        """Create an empty DuckDB database file."""
        import duckdb
        import os

        # Ensure directory exists
        os.makedirs(os.path.dirname(database_path), exist_ok=True)

        # Remove file if it exists (in case it's an invalid empty file)
        if os.path.exists(database_path):
            os.unlink(database_path)

        # Create empty database
        conn = duckdb.connect(database_path)
        conn.close()


class DuckDBConnection:
    def __init__(self, source: DuckdbSource, read_only: bool = False):
        self.source = source
        self.conn = None
        self.read_only = read_only

    def __enter__(self):
        self.conn = self.source.get_connection(read_only=self.read_only)
        return self.conn

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.conn:
            self.conn.close()
            self.conn = None
        # Return None to propagate any exceptions
        return None
