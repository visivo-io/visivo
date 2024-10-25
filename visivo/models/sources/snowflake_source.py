from typing import Literal, Optional
from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from click import ClickException
from pydantic import Field

SnowflakeType = Literal["snowflake"]


class SnowflakeSource(SqlalchemySource):
    """
    SnowflakeSources hold the connection information to Snowflake data sources.

    !!! example

        === "Simple"

            ``` yaml
                sources:
                  - name: snowflake_source
                    type: snowflake
                    database: DEV
                    warehouse: DEV
                    account: ab12345.us-west-1.aws
                    db_schema: DEFAULT
                    username: {% raw %}{{ env_var('SNOWFLAKE_USER') }}{% endraw %}
                    password: {% raw %}{{ env_var('SNOWFLAKE_PASSWORD') }}{% endraw %}
            ```

    Note: Recommended environment variable use is covered in the [sources overview.](/topics/sources/)
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
    timezone: Optional[str] = Field(
        None,
        description="The timezone that you want to use by default when running queries.",
    )

    type: SnowflakeType
    connection_pool_size: Optional[int] = Field(
        8, description="The pool size that is used for this connection."
    )

    def get_dialect(self):
        return "snowflake"

    def url(self):
        from snowflake.sqlalchemy import URL
        url_attributes = {
            "user": self.username,
            "password": self.get_password(),
            "account": self.account,
        }
        # Optional attributes where if its not set the default value is used
        if self.timezone:
            url_attributes["timezone"] = self.timezone
        if self.warehouse:
            url_attributes["warehouse"] = self.warehouse
        if self.role:
            url_attributes["role"] = self.role
        if self.database:
            url_attributes["database"] = self.database
        if self.db_schema:
            url_attributes["schema"] = self.db_schema

        url = URL(**url_attributes)

        return url