from typing import Literal, Optional
from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from pydantic import Field

MysqlType = Literal["mysql"]


class MysqlSource(SqlalchemySource):
    """
    MysqlSources hold the connection information to MySQL data sources.

    !!! example

        === "Simple"

            ``` yaml
                sources:
                  - name: mysql_source
                    type: mysql
                    database: database
                    username: {% raw %}{{ env_var('MYSQL_USER') }}{% endraw %}
                    password: {% raw %}{{ env_var('MYSQL_PASSWORD') }}{% endraw %}
                    connection_pool_size: 2
            ```

    !!! note

        Recommended environment variable use is covered in the [sources overview.](/topics/sources/)
    """

    type: MysqlType
    connection_pool_size: Optional[int] = Field(
        1, description="The pool size that is used for this connection."
    )

    def get_dialect(self):
        return "mysql+pymysql"
