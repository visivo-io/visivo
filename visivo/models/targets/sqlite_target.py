from typing import Literal, Optional
from visivo.models.targets.sqlalchemy_target import SqlalchemyTarget


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

    def get_dialect(self):
        return "sqlite+pysqlite"
