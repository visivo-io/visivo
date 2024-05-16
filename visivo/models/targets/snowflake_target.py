from typing import Literal, Optional
from visivo.models.targets.target import Target
from pandas import DataFrame
import click
from pydantic import Field

SnowflakeType = Literal["snowflake"]


class SnowflakeTarget(Target):
    """
    SnowflakeTargets hold the connection information to Snowflake data sources.

    !!! example

        === "Simple"

            ``` yaml
                targets:
                  - name: snowflake_target
                    type: snowflake
                    database: DEV
                    warehouse: DEV
                    account: ab12345.us-west-1.aws
                    db_schema: DEFAULT
                    username: {% raw %}{{ env_var('SNOWFLAKE_USER') }}{% endraw %}
                    password: {% raw %}{{ env_var('SNOWFLAKE_PASSWORD') }}{% endraw %}
            ```

    Note: Recommended environment variable use is covered in the [targets overview.](/topics/targets/)
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

    type: SnowflakeType

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
                password=self.get_password(),
                warehouse=self.warehouse,
                database=self.database,
                schema=self.db_schema,
                role=self.role,
            )
        except Exception as err:
            raise click.ClickException(
                f"Error connecting to target '{self.name}'. Ensure the database is running and the connection properties are correct."
            )
