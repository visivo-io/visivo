from typing import Literal, Optional
from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from pydantic import Field

DuckdbType = Literal["duckdb"]


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

    def get_dialect(self):
        return "duckdb"
