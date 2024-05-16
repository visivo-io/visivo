from typing import Literal, Optional
from visivo.models.targets.sqlalchemy_target import SqlalchemyTarget
from pydantic import Field

PostgresqlType = Literal["postgresql"]


class PostgresqlTarget(SqlalchemyTarget):
    """
    PostgresqlTargets hold the connection information to PostgreSQL data sources.

    !!! example

        === "Simple"

            ``` yaml
                targets:
                  - name: postgresql_target
                    type: postgresql
                    database: database
                    username: {% raw %}{{ env_var('PG_USER') }}{% endraw %}
                    password: {% raw %}{{ env_var('PG_PASSWORD') }}{% endraw %}
                    connection_pool_size: 2
            ```

    !!! note

        Recommended environment variable use is covered in the [targets overview.](/topics/targets/)
    """

    type: PostgresqlType
    connection_pool_size: Optional[int] = Field(
        1, description="The pool size that is used for this connection."
    )

    def get_dialect(self):
        return "postgresql+psycopg2"
