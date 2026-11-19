from pathlib import Path
from typing import Literal, Optional, List, Any, Union
from typing_extensions import Annotated
from visivo.models.base.base_model import (
    BaseModel,
    EnvVarStringType,
    StringOrEnvVarDiscriminator,
)
from visivo.models.sources.base_duckdb_source import BaseDuckdbSource
from visivo.models.sources.database_file import (
    DatabaseFileMixin,
    is_file_database,
    is_remote_database,
    remote_database_alias,
)
from visivo.models.sources.ducklake import (
    DuckLake,
    attach_database_sql,
    check_ducklake_uri,
    is_ducklake_uri,
    redact,
    validate_identifier,
)
from visivo.models.sources.source import ServerSource
from pydantic import Discriminator, Field, Tag, field_validator, model_validator
import click
import os
from visivo.logger.logger import Logger
from threading import Lock

attach_function_lock = Lock()

DuckdbType = Literal["duckdb"]

DUCKLAKE_DATABASE_NAME = "lake"


def _database_kind(database) -> str:
    if isinstance(database, (dict, DuckLake)):
        return "DuckLake"
    return StringOrEnvVarDiscriminator()(database)


DuckdbDatabase = Annotated[
    Union[Annotated[DuckLake, Tag("DuckLake")], EnvVarStringType, Annotated[str, Tag("String")]],
    Discriminator(_database_kind),
]


class DuckdbAttachment(BaseModel):
    """
    A DuckdbAttachment makes an additional DuckDB database, or a DuckLake, available in the
    parent source's connection so a single model query can join across both databases.
    Set exactly one of `source` and `ducklake`.
    """

    schema_name: str = Field(..., description="Name of the schema to attach the source under.")
    source: Optional["DuckdbSource"] = Field(
        None,
        description="Local DuckDB database source to attach in the connection that will be available in the base SQL query.",
    )
    ducklake: Optional[DuckLake] = Field(
        None,
        description="DuckLake to attach in the connection.",
    )

    @field_validator("schema_name")
    @classmethod
    def validate_schema_name(cls, schema_name):
        if isinstance(schema_name, str) and len(schema_name) > 2:
            if schema_name.startswith('"') and schema_name.endswith('"'):
                schema_name = schema_name[1:-1]
        return validate_identifier(schema_name)

    @model_validator(mode="after")
    def validate_one_target(self):
        if (self.source is None) == (self.ducklake is None):
            raise ValueError(
                f"Attachment '{self.schema_name}' needs exactly one of 'source' or 'ducklake'."
            )
        if self.source is not None and self.source.is_ducklake_database():
            raise ValueError(
                f"Attachment '{self.schema_name}': the 'source' of an attachment is a database "
                "file. Put a DuckLake in the 'ducklake' block of the attachment."
            )
        return self

    def setup_statements(self, read_only: bool = False) -> List[str]:
        if self.ducklake is not None:
            return self.ducklake.setup_statements(self.schema_name)
        options = ["READ_ONLY"] if read_only else None
        return [attach_database_sql(self.source.get_database(), self.schema_name, options)]

    def is_ducklake(self) -> bool:
        return self.ducklake is not None or is_ducklake_uri(self.source.get_database())

    def secret_values(self) -> List[str]:
        return self.ducklake.secret_values() if self.ducklake is not None else []


class DuckdbSource(DatabaseFileMixin, ServerSource, BaseDuckdbSource):
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

        === "Read-only over https"

            ``` yaml
                sources:
                  - name: ev_sales_db
                    type: duckdb
                    database: https://example.com/samples/ev_sales.duckdb
            ```

            The database is attached read-only under its file name (`ev_sales`), so seeds
            cannot write to it.

        === "DuckLake"

            ``` yaml
                sources:
                  - name: lake
                    type: duckdb
                    database:
                      catalog: ducklake:sqlite:local/catalog.sqlite
            ```

            The DuckLake is the default database of the source, so a model reads
            `orders` or `main.orders`. It is read-only unless `read_only: false` is set.

    !!! note

        Recommended environment variable use is covered in the [sources overview.](/topics/sources/)
    """

    type: DuckdbType
    database: DuckdbDatabase = Field(
        ...,
        description="The path of a DuckDB database file, `:memory:`, an `https://` URL of a database file, or a DuckLake (an object with `catalog`).",
    )
    connection_pool_size: Optional[int] = Field(
        1, description="The pool size that is used for this connection."
    )
    attach: Optional[List[DuckdbAttachment]] = Field(
        None,
        description="List of other DuckDB databases and DuckLakes to attach in the connection that will be available in the base SQL query.",
    )

    @field_validator("database")
    @classmethod
    def validate_ducklake_database(cls, database):
        if is_ducklake_uri(database):
            check_ducklake_uri(database, "database")
        return database

    @model_validator(mode="after")
    def validate_storage_scopes(self):
        lakes = [("database", self.database)] if self.is_ducklake_database() else []
        lakes += [
            (f"Attachment '{a.schema_name}'", a.ducklake) for a in self.attach or [] if a.ducklake
        ]
        with_storage = [(label, lake) for label, lake in lakes if lake.storage is not None]
        if len(with_storage) > 1:
            for label, lake in with_storage:
                if not lake.data_path:
                    raise ValueError(
                        f"{label} needs a data_path. When more than one DuckLake of a source "
                        "has storage credentials, the data_path of each one sets which paths "
                        "its credentials read."
                    )
        return self

    def is_ducklake_database(self) -> bool:
        return isinstance(self.database, DuckLake)

    def get_database(self) -> str:
        """The resolved database. For a DuckLake it is the catalog URI, which holds no credential."""
        if self.is_ducklake_database():
            return self.database.catalog_uri()
        return super().get_database()

    def safe_attach(self, connection, attachment, read_only: bool = False):
        """Attach once for each DuckDB instance. Connections to one file share their attachments."""
        with attach_function_lock:
            existing = connection.execute(
                "SELECT type, internal, database_name = current_database() "
                "FROM duckdb_databases() WHERE database_name = ?",
                [attachment.schema_name],
            ).fetchone()

            if existing is None:
                for statement in attachment.setup_statements(read_only=read_only):
                    connection.execute(statement)
                return True

            database_type, internal, is_primary = existing
            if is_primary or internal:
                owner = "the primary database" if is_primary else "a DuckDB system database"
                raise ValueError(f"the name is already used by {owner}. Change schema_name.")
            if (database_type == "ducklake") != attachment.is_ducklake():
                raise ValueError(
                    f"the name is already used by a {database_type} database that is not "
                    "this attachment. Change schema_name."
                )
            return False

    def get_connection(self, read_only: bool = False, working_dir=None):
        import duckdb

        """Return a DuckDBPyConnection using direct DuckDB connection with proper read_only support."""
        if self.is_ducklake_database():
            return self._connect_ducklake(duckdb)
        try:
            Logger.instance().debug(f"Getting connection for {self.name}, read_only={read_only}")

            database_path = self.get_database()
            if is_ducklake_uri(database_path):
                check_ducklake_uri(database_path, "database")
            if is_remote_database(database_path):
                return self._connect_remote(duckdb, database_path)
            if working_dir and is_file_database(database_path):
                database_path = str(working_dir / Path(database_path))

            # An in-memory database is never persisted, so read-only has
            # nothing to protect — and DuckDB rejects read_only=True on
            # ":memory:" outright ("Cannot launch in-memory database in
            # read-only mode!"). Every introspection/query path defaults to
            # read_only=True, so a ":memory:" primary (e.g. one that exists
            # only to host `attach:`ed sources) would otherwise never connect.
            if database_path == ":memory:":
                read_only = False

            # Ensure database file exists for write operations
            if (
                not read_only
                and is_file_database(database_path)
                and not os.path.exists(database_path)
            ):
                Logger.instance().debug(
                    f"Database file {redact(database_path)} does not exist, creating it"
                )
                # `or "."` — a bare filename like `bike.duckdb` makes dirname()
                # return '' and makedirs('') raises FileNotFoundError('' ),
                # which surfaced as "[Errno 2] No such file or directory: ''"
                # on the first seed run (M10).
                os.makedirs(os.path.dirname(database_path) or ".", exist_ok=True)
                # Create the database file
                temp_conn = duckdb.connect(database_path)
                temp_conn.close()

            # Connect directly to DuckDB with proper read_only flag
            Logger.instance().debug(
                f"Connecting to {redact(database_path)} with read_only={read_only}"
            )
            connection = duckdb.connect(database_path, read_only=read_only)
            Logger.instance().debug(f"Direct DuckDB connection established for {self.name}")

            return connection
        except Exception as err:
            raise click.ClickException(
                f"Error connecting to source '{self.name}'. Ensure the database exists and the connection properties are correct. Full Error: {redact(str(err))}"
            )

    def _connect_remote(self, duckdb, url):
        """Attach a database served over http(s) read-only and make it the default catalog.

        Cloud has no project files yet, so a sample reads its database this way. Writes,
        seeds included, fail: the attached database is read-only.
        """
        alias = remote_database_alias(url)
        connection = duckdb.connect(":memory:")
        try:
            quoted_url = url.replace("'", "''")
            connection.execute(f"ATTACH '{quoted_url}' AS \"{alias}\" (READ_ONLY)")
            connection.execute(f'USE "{alias}"')
        except Exception:
            connection.close()
            raise
        return connection

    def _connect_ducklake(self, duckdb):
        """Attach the DuckLake to an in-memory database and make it the default catalog."""
        Logger.instance().debug(f"Connecting {self.name} to {self.database.describe()}")
        connection = duckdb.connect(":memory:")
        try:
            for statement in self.database.setup_statements(DUCKLAKE_DATABASE_NAME):
                connection.execute(statement)
            connection.execute(f'USE "{DUCKLAKE_DATABASE_NAME}"')
        except Exception as error:
            connection.close()
            detail = redact(str(error), self.database.secret_values())
            raise click.ClickException(
                f"Error connecting to source '{self.name}'. Ensure the DuckLake catalog exists "
                f"and the connection properties are correct. Full Error: {detail}"
            ) from None
        return connection

    def _check_writable(self):
        if self.is_ducklake_database() and self.database.read_only:
            raise click.ClickException(
                f"Cannot write to {self.type} source '{self.name}': its DuckLake is read-only. "
                "Set read_only: false on database to write to it."
            )

    def write_dataframe(self, table_name: str, data_frame, replace: bool = True):
        self._check_writable()
        return super().write_dataframe(table_name, data_frame, replace=replace)

    def write_file(self, seed, path: str, replace: bool = True):
        self._check_writable()
        return super().write_file(seed, path, replace=replace)

    def _setup_connection(self, connection, read_only: bool = False, **kwargs):
        """Attach the databases and DuckLakes of this source to the connection.

        A read-only connection attaches a database file read-only, so that two connections
        or two processes can read the same file.
        """
        for attachment in self.attach or []:
            try:
                attached = self.safe_attach(connection, attachment, read_only=read_only)
            except Exception as error:
                detail = redact(str(error), attachment.secret_values())
                raise click.ClickException(
                    f"Error attaching '{attachment.schema_name}' on {self.type} source "
                    f"'{self.name}': {detail}"
                ) from None
            Logger.instance().debug(
                f"Database {attachment.schema_name} "
                f"{'attached' if attached else 'already attached'}"
            )

        # Queries must resolve unqualified names where inference does (get_default_context).
        db_schema = self.get_db_schema()
        if db_schema:
            quoted = db_schema.replace("'", "''")
            try:
                connection.execute(f"SET schema = '{quoted}'")
            except Exception as e:
                Logger.instance().debug(f"Could not set schema '{db_schema}': {e}")

    def get_connection_dialect(self):
        return "duckdb"

    def description(self):
        """Return a description of this source for logging and error messages."""
        database = (
            self.database.describe() if self.is_ducklake_database() else redact(str(self.database))
        )
        return f"{self.type} source '{self.name}' (database: {database})"

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
                primary = (
                    ["main", DUCKLAKE_DATABASE_NAME] if self.is_ducklake_database() else ["main"]
                )

                # Add any attached databases (excluding temp/system)
                for row in rows:
                    db_name = row[1]
                    if db_name not in ["temp", "system", *primary] and row[2]:
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

        # Ensure directory exists (`or "."`: bare filenames make dirname()
        # return '' and makedirs('') raises — M10)
        os.makedirs(os.path.dirname(database_path) or ".", exist_ok=True)

        # Remove file if it exists (in case it's an invalid empty file)
        if os.path.exists(database_path):
            os.unlink(database_path)

        # Create empty database
        conn = duckdb.connect(database_path)
        conn.close()

    def introspect(self):
        """Legacy ``{databases: [{name, schemas: [{name, tables}]}]}`` view of ``get_schema()``."""
        databases = {}
        for table_info in self.get_schema().get("tables", {}).values():
            meta = table_info.get("metadata", {})
            schemas = databases.setdefault(meta.get("database"), {})
            schemas.setdefault(meta.get("schema"), []).append(
                {
                    "name": meta.get("table_name"),
                    "columns": {
                        col_name: col_info.get("type", "UNKNOWN")
                        for col_name, col_info in table_info.get("columns", {}).items()
                    },
                }
            )

        return {
            "name": self.name,
            "type": self.type,
            "databases": [
                {
                    "name": database,
                    "schemas": [
                        {"name": schema, "tables": tables} for schema, tables in schemas.items()
                    ],
                }
                for database, schemas in databases.items()
            ],
        }
