from typing import Literal, Optional, List
from visivo.models.base.base_model import BaseModel
from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from pydantic import Field

DuckdbType = Literal["duckdb"]

class DuckdbAttachment(BaseModel):
    schema_name: str = Field("Name of the schema to attach the source under.")
    source: "DuckdbSource" = Field(
        None,
        description="Local Duckdb database source to attach in the connection that will be available in the base SQL query.",
    )

class DuckdbSource(SqlalchemySource):
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

    def get_dialect(self):
        return "duckdb"
