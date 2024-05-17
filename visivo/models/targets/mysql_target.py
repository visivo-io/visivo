from typing import Literal, Optional
from visivo.models.targets.sqlalchemy_target import SqlalchemyTarget
from pydantic import Field

MysqlType = Literal["mysql"]


class MysqlTarget(SqlalchemyTarget):
    """
    MysqlTargets hold the connection information to MySQL data sources.

    !!! example

        === "Simple"

            ``` yaml
                targets:
                  - name: mysql_target
                    type: mysql
                    database: database
                    username: {% raw %}{{ env_var('MYSQL_USER') }}{% endraw %}
                    password: {% raw %}{{ env_var('MYSQL_PASSWORD') }}{% endraw %}
                    connection_pool_size: 2
            ```

    !!! note

        Recommended environment variable use is covered in the [targets overview.](/topics/targets/)
    """

    type: MysqlType
    connection_pool_size: Optional[int] = Field(
        1, description="The pool size that is used for this connection."
    )

    def get_dialect(self):
        return "mysql+pymysql"
