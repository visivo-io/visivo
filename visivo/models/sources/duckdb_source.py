from typing import Literal, Optional, List
from visivo.models.base.base_model import BaseModel
from visivo.models.sources.source import Source
from pydantic import Field
import click
import duckdb
import polars as pl

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

    def get_connection(self, read_only: bool = False):
        try:

            connection = duckdb.connect(self.database, read_only=read_only)

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
        return DuckDBConnection(source=self, read_only=read_only)

    def get_dialect(self):
        return "duckdb"


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
