from typing import List, Literal, Optional
from visivo.models.base.base_model import BaseModel
from visivo.models.targets.sqlalchemy_target import SqlalchemyTarget
from pydantic import Field


class Attachment(BaseModel):
    schema_name: str = Field("Name of the schema to attach the target under.")
    target: "SqliteTarget" = Field(
        None,
        description="Local SQLite database target to attach in the connection that will be available in the base SQL query.",
    )


class SqliteTarget(SqlalchemyTarget):
    """
    SqliteTargets hold the connection information to SQLite data sources.

    !!! example {% raw %}

        === "Simple"

            ``` yaml
            targets:
              - name: sqlite_target
                database: local/file/local.db
                type: sqlite
            ```

        === "Additional Attached"
            Attaching other SQLite databases allows you to join models between databases.

            ``` yaml
            targets:
              - name: sqlite_target
                database: local/file/local.db
                type: sqlite
                attach:
                  - local/other/file/local.db
            ```

            The above target can be then used in a model and the sql for that model might look similar to: `select * from local l join other_local ol on l.other_id=ol.id`
    {% endraw %}

    Note: Recommended environment variable use is covered in the [targets overview.](/topics/targets/)
    """

    type: Literal["sqlite"]
    attach: Optional[List[Attachment]] = Field(
        None,
        description="List of other local SQLite database targets to attach in the connection that will be available in the base SQL query.",
    )

    def get_dialect(self):
        return "sqlite+pysqlite"
