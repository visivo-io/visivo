from pathlib import Path
from typing import Literal, Optional, List, Any
from visivo.models.base.base_model import BaseModel
from visivo.models.sources.base_duckdb_source import BaseDuckdbSource
from visivo.models.sources.source import ServerSource
from pydantic import Field, PrivateAttr
import click
import duckdb
import os
from visivo.logger.logger import Logger
from threading import Lock

attach_function_lock = Lock()

DuckdbType = Literal["duckdb"]


class DuckdbAttachment(BaseModel):
    schema_name: str = Field("Name of the schema to attach the source under.")
    source: "DuckdbSource" = Field(
        None,
        description="Local Duckdb database source to attach in the connection that will be available in the base SQL query.",
    )


class DuckdbSource(ServerSource, BaseDuckdbSource):
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

    def safe_attach(self, connection, db_path, alias):
        with attach_function_lock:
            result = connection.execute(
                """
                SELECT count(*) as cnt
                FROM pragma_database_list
                WHERE name = ?
            """,
                [alias],
            ).fetchone()

            if result[0] == 0:
                connection.execute(f"ATTACH '{db_path}' AS {alias};")
                return True
            return False

    def get_connection(self, read_only: bool = False, working_dir=None):
        """Return a DuckDBPyConnection using direct DuckDB connection with proper read_only support."""
        try:
            Logger.instance().debug(f"Getting connection for {self.name}, read_only={read_only}")

            database_path = self.database
            if working_dir:
                database_path = str(working_dir / Path(self.database))

            # Ensure database file exists for write operations
            if not read_only and not os.path.exists(database_path):
                Logger.instance().debug(
                    f"Database file {database_path} does not exist, creating it"
                )
                os.makedirs(os.path.dirname(database_path), exist_ok=True)
                # Create the database file
                temp_conn = duckdb.connect(database_path)
                temp_conn.close()

            # Connect directly to DuckDB with proper read_only flag
            Logger.instance().debug(f"Connecting to {database_path} with read_only={read_only}")
            connection = duckdb.connect(database_path, read_only=read_only)
            Logger.instance().debug(f"Direct DuckDB connection established for {self.name}")

            return connection
        except Exception as err:
            raise click.ClickException(
                f"Error connecting to source '{self.name}'. Ensure the database exists and the connection properties are correct. Full Error: {str(err)}"
            )

    def _setup_connection(self, connection, **kwargs):
        """Setup the DuckDB connection with after_connect commands and attachments."""
        try:
            # Execute after_connect if specified
            if hasattr(self, "after_connect") and self.after_connect:
                connection.execute(self.after_connect)

            # Handle attachments
            if self.attach:
                for attachment in self.attach:
                    if self.safe_attach(
                        connection, attachment.source.database, attachment.schema_name
                    ):
                        Logger.instance().debug(f"Database {attachment.schema_name} attached")
                    else:
                        Logger.instance().debug(
                            f"Database {attachment.schema_name} already attached"
                        )
        except Exception as e:
            Logger.instance().debug(f"Error setting up DuckDB connection: {e}")
            # Don't raise here as connection might still be usable

    def get_connection_dialect(self):
        return "duckdb"

    def description(self):
        """Return a description of this source for logging and error messages."""
        return f"{self.type} source '{self.name}' (database: {self.database})"

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

    def introspect(self):
        """
        Legacy introspection method for backward compatibility with tests.

        This method returns metadata in the old format expected by existing tests.
        For new code, use get_schema() instead which returns SQLGlot-compatible schema data.
        """
        schema_data = self.get_schema()

        # Convert our new schema format to the old metadata format expected by tests
        tables_list = []
        for table_name, table_info in schema_data.get("tables", {}).items():
            table_entry = {"name": table_name, "columns": {}}
            for col_name, col_info in table_info.get("columns", {}).items():
                table_entry["columns"][col_name] = col_info.get("type", "UNKNOWN")
            tables_list.append(table_entry)

        return {
            "name": self.name,
            "type": self.type,
            "databases": [{"name": "main", "tables": tables_list}],
        }
