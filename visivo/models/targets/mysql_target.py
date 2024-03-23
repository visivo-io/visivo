from typing import Literal, Optional
from visivo.models.targets.sqlalchemy_target import SqlalchemyTarget
from pydantic import Field


class MysqlTarget(SqlalchemyTarget):
    """
    MysqlTarget hold the connection information to SQLite data sources.

    A single project can have many targets. You can even set up Visivo so that a single chart contains traces that pull data from completely different targets. ex.)
    ``` yaml
    targets:
      - name: local-sqlite
        database: target/local.db
        type: sqlite
    ```

    It is best practice to leverage the `{% raw %}{{ env_var() }}{% endraw %}` jinja function for storing secrets and enabling different permissions in production, staging and dev.
    """

    type: Literal["mysql"]
    connection_pool_size: Optional[int] = Field(
        1, description="The pool size that is used for this connection."
    )

    def get_dialect(self):
        return "mysql"
