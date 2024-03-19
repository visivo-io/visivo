from typing import Literal, Optional
from visivo.models.targets.target import Target
from pandas import DataFrame
import click
from pydantic import Field


class SnowflakeTarget(Target):
    """
    SqliteTargets hold the connection information to SQLite data sources.

    A single project can have many targets. You can even set up Visivo so that a single chart contains traces that pull data from completely different targets. ex.)
    ``` yaml
    targets:
      - name: local-sqlite
        database: target/local.db
        type: sqlite
    ```

    It is best practice to leverage the `{% raw %}{{ env_var() }}{% endraw %}` jinja function for storing secrets and enabling different permissions in production, staging and dev.
    """

    account: Optional[str] = Field(
        None,
        description="The snowflake account url. Here's how you find this: [snowflake docs](https://docs.snowflake.com/en/user-guide/admin-account-identifier).",
    )
    warehouse: Optional[str] = Field(
        None,
        description="The compute warehouse that you want queries from your Visivo project to leverage.",
    )
    role: Optional[str] = Field(
        None,
        description="The access role that you want to use when running queries.",
    )

    type: Literal["snowflake"]

    def read_sql(self, query: str) -> DataFrame:
        with self.connect() as connection:
            cursor = connection.cursor()
            cursor.execute(query)
            columns = [col[0] for col in cursor.description]
            data = cursor.fetchall()
            cursor.close()

        return DataFrame(data, columns=columns)

    def get_connection(self):
        import snowflake.connector

        try:
            return snowflake.connector.connect(
                account=self.account,
                user=self.username,
                password=self._get_password(),
                warehouse=self.warehouse,
                database=self.database,
                schema=self.db_schema,
                role=self.role,
            )
        except Exception as err:
            raise click.ClickException(
                f"Error connecting to target '{self.name}'. Ensure the database is running and the connection properties are correct."
            )
