from typing import Literal, Optional
from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from pydantic import Field, SecretStr

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

        === "Key Authentication"

            ``` yaml
                sources:
                  - name: snowflake_source
                    type: snowflake
                    database: DEV
                    warehouse: DEV
                    account: ab12345.us-west-1.aws
                    db_schema: DEFAULT
                    username: {% raw %}"{{ env_var('SNOWFLAKE_USER') }}"{% endraw %}
                    private_key_path: /path/to/rsa_key.p8
                    private_key_passphrase: {% raw %}"{{ env_var('DB_PRIVATE_KEY_PASSPHRASE') }}"{% endraw %}
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
    private_key_path: Optional[str] = Field(
        None,
        description="Path to the private key file (.p8) for key pair authentication. If provided, password will be ignored.",
    )
    private_key_passphrase: Optional[SecretStr] = Field(
        None,
        description="Passphrase for the private key file if it is encrypted.",
    )

    type: SnowflakeType
    connection_pool_size: Optional[int] = Field(
        8, description="The pool size that is used for this connection."
    )

    def connect_args(self):
        if not self.private_key_path:
            return {}

        from cryptography.hazmat.backends import default_backend
        from cryptography.hazmat.primitives import serialization

        with open(self.private_key_path, "rb") as key:
            p_key = serialization.load_pem_private_key(
                key.read(),
                password=(
                    self.private_key_passphrase.get_secret_value().encode()
                    if self.private_key_passphrase
                    else None
                ),
                backend=default_backend(),
            )

            pkb = p_key.private_bytes(
                encoding=serialization.Encoding.DER,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption(),
            )

            return {
                "private_key": pkb,
            }

    def get_dialect(self):
        return "snowflake"

    def url(self):
        from snowflake.sqlalchemy import URL

        url_attributes = {
            "user": self.username,
            "account": self.account,
        }

        if not self.private_key_path:
            url_attributes["password"] = self.get_password()

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
