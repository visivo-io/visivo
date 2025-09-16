from typing import Literal, Optional
from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from visivo.models.sources.source import ServerSource
from pydantic import Field

# Import pymysql and install it as MySQLdb for compatibility
try:
    import pymysql

    pymysql.install_as_MySQLdb()
except ImportError:
    pass  # pymysql not available

MysqlType = Literal["mysql"]


class MysqlSource(ServerSource, SqlalchemySource):
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

    def get_connection_dialect(self):
        return "mysql+pymysql"

    def get_dialect(self):
        return "mysql"

    def list_databases(self):
        """Return list of databases for MySQL server."""
        try:
            with self.get_connection() as connection:
                from sqlalchemy import text

                rows = connection.execute(text("SHOW DATABASES")).fetchall()
                return [r[0] for r in rows]
        except Exception as e:
            # Re-raise to allow proper error handling in UI
            raise e
