from typing import List, Literal, Optional, Any
from visivo.models.base.base_model import BaseModel
from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from pydantic import Field


class Attachment(BaseModel):
    schema_name: str = Field("Name of the schema to attach the source under.")
    source: "SqliteSource" = Field(
        None,
        description="Local SQLite database source to attach in the connection that will be available in the base SQL query.",
    )


SqliteType = Literal["sqlite"]


class SqliteSource(SqlalchemySource):
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

    def get_dialect(self):
        return "sqlite+pysqlite"
