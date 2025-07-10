from typing import Literal, Optional
from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from visivo.logger.logger import Logger
from pydantic import Field

PostgresqlType = Literal["postgresql"]


class PostgresqlSource(SqlalchemySource):
    """
    PostgresqlSources hold the connection information to PostgreSQL data sources.

    !!! example

        === "Simple"

            ``` yaml
                sources:
                  - name: postgresql_source
                    type: postgresql
                    database: database
                    username: {% raw %}{{ env_var('PG_USER') }}{% endraw %}
                    password: {% raw %}{{ env_var('PG_PASSWORD') }}{% endraw %}
                    connection_pool_size: 2
            ```

    !!! note

        Recommended environment variable use is covered in the [sources overview.](/topics/sources/)
    """

    type: PostgresqlType
    connection_pool_size: Optional[int] = Field(
        1, description="The pool size that is used for this connection."
    )

    def get_dialect(self):
        return "postgresql+psycopg2"

    def list_databases(self):
        """Return list of databases for PostgreSQL server."""
        try:
            with self.get_connection() as connection:
                from sqlalchemy import text

                rows = connection.execute(
                    text("SELECT datname FROM pg_database WHERE datistemplate = false")
                ).fetchall()
                return [r[0] for r in rows]
        except Exception as e:
            # Re-raise to allow proper error handling in UI
            raise e
