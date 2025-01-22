from typing import Literal, Optional, List
from visivo.models.base.base_model import BaseModel
from visivo.models.sources.source import Source
from pydantic import Field
import duckdb
import click

DuckdbType = Literal["duckdb"]

class DuckdbAttachment(BaseModel):
    schema_name: str = Field("Name of the schema to attach the source under.")
    source: "DuckdbSource" = Field(
        None,
        description="Local Duckdb database source to attach in the connection that will be available in the base SQL query.",
    )

class DuckdbSource(Source):
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

    _connection: Optional[duckdb.DuckDBPyConnection] = None

    def get_connection(self):
        try:
            if not self._connection:
                self._connection = duckdb.connect(self.database)
                
                if self.attach:
                    for attachment in self.attach:
                        self._connection.execute(
                            f"ATTACH DATABASE '{attachment.source.database}' AS {attachment.schema_name}"
                        )
            
            return self._connection

        except Exception as err:
            raise click.ClickException(
                f"Error connecting to source '{self.name}'. Ensure the database exists and the connection properties are correct. Full Error: {str(err)}"
            )

    def read_sql(self, query: str):
        try:
            with self.connect() as connection:
                result = connection.execute(query).fetchdf()
                return result
        except Exception as err:
            raise click.ClickException(
                f"Error executing query on source '{self.name}': {str(err)}"
            )

    def connect(self):
        return DuckDBConnection(source=self)

class DuckDBConnection:
    def __init__(self, source: DuckdbSource):
        self.source = source
        self.conn = None

    def __enter__(self):
        self.conn = self.source.get_connection()
        return self.conn

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.conn:
            self.conn.close()
            self.conn = None
            self.source._connection = None
