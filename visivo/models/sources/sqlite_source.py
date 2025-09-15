from typing import List, Literal, Optional, Any
from visivo.models.base.base_model import BaseModel
from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from visivo.models.sources.source import ServerSource
from pydantic import Field
from visivo.logger.logger import Logger


class Attachment(BaseModel):
    schema_name: str = Field("Name of the schema to attach the source under.")
    source: "SqliteSource" = Field(
        None,
        description="Local SQLite database source to attach in the connection that will be available in the base SQL query.",
    )


SqliteType = Literal["sqlite"]


class SqliteSource(ServerSource, SqlalchemySource):
    """
    SqliteSources hold the connection information to SQLite data sources.

    !!! example {% raw %}

        === "Simple"

            ``` yaml
            sources:
              - name: sqlite_source
                database: local/file/local.db
                type: sqlite
            ```

        === "Additional Attached"
            Attaching other SQLite databases allows you to join models between databases.

            ``` yaml
            sources:
              - name: sqlite_source
                database: local/file/local.db
                type: sqlite
                attach:
                  - schema_name: static
                    name: static_source
                    database: local/static/file/local.db
                    type: sqlite
            ```

            The above source can be then used in a model and the sql for that model might look similar to: `SELECT * FROM local AS l JOIN static.data AS sd ON l.static_id=sd.id`
    {% endraw %}

    !!! note

        Recommended environment variable use is covered in the [sources overview.](/topics/sources/)
    """

    type: SqliteType
    attach: Optional[List[Attachment]] = Field(
        None,
        description="List of other local SQLite database sources to attach in the connection that will be available in the base SQL query.",
    )

    def get_connection_dialect(self):
        return "sqlite+pysqlite"

    def get_dialect(self):
        return "sqlite"

    def list_databases(self):
        """List databases for SQLite source.

        SQLite works with single database files, so this method verifies
        the database file is accessible and valid by testing the connection.
        """
        try:
            # Test the connection by running a simple query
            # This will fail if the database file doesn't exist or is corrupted
            Logger.instance().debug(f"SQLite testing connection for database: {self.database}")
            with self.get_connection() as connection:
                from sqlalchemy import text

                connection.execute(text("SELECT 1"))
                Logger.instance().debug(f"SQLite connection test successful for: {self.database}")

            # SQLite always has a single "main" database
            databases = ["main"]

            # If attachments are configured, list them as well
            if self.attach:
                for attachment in self.attach:
                    databases.append(attachment.schema_name)

            return databases

        except Exception as e:
            # Re-raise the exception - this indicates connection failure
            # This prevents returning a false positive about database availability
            raise e
