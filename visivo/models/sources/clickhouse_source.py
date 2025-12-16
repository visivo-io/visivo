from typing import Literal, Optional
from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from visivo.models.sources.source import ServerSource
from pydantic import Field

# Import clickhouse_sqlalchemy to register the dialect with SQLAlchemy
try:
    import clickhouse_sqlalchemy  # noqa: F401
except ImportError:
    pass  # clickhouse_sqlalchemy not available

ClickhouseType = Literal["clickhouse"]


class ClickhouseSource(ServerSource, SqlalchemySource):
    """
    ClickhouseSources hold the connection information to ClickHouse data sources.
    Supports both self-hosted ClickHouse and ClickHouse Cloud.

    !!! example

        === "Simple (Self-hosted with Native TCP)"

            ``` yaml
                sources:
                  - name: clickhouse_source
                    type: clickhouse
                    host: localhost
                    port: 9000
                    database: default
                    username: default
                    password: {% raw %}{{ env_var('CLICKHOUSE_PASSWORD') }}{% endraw %}
            ```

        === "HTTP Protocol"

            ``` yaml
                sources:
                  - name: clickhouse_http
                    type: clickhouse
                    host: localhost
                    port: 8123
                    database: default
                    username: default
                    password: {% raw %}{{ env_var('CLICKHOUSE_PASSWORD') }}{% endraw %}
                    protocol: http
            ```

        === "ClickHouse Cloud"

            ``` yaml
                sources:
                  - name: clickhouse_cloud
                    type: clickhouse
                    host: your-instance.clickhouse.cloud
                    port: 8443
                    database: default
                    username: default
                    password: {% raw %}{{ env_var('CLICKHOUSE_PASSWORD') }}{% endraw %}
                    protocol: http
                    secure: true
            ```

    !!! note

        Recommended environment variable use is covered in the [sources overview.](/topics/sources/)
    """

    type: ClickhouseType
    port: Optional[int] = Field(
        9000, description="The ClickHouse port. Default 9000 for native TCP, use 8123 for HTTP."
    )
    protocol: Optional[Literal["native", "http"]] = Field(
        "native", description="Connection protocol: 'native' (TCP, recommended) or 'http'."
    )
    secure: Optional[bool] = Field(
        False,
        description="Use secure TLS connection. Required for ClickHouse Cloud with HTTP protocol.",
    )
    connection_pool_size: Optional[int] = Field(
        1, description="The pool size that is used for this connection."
    )

    def get_connection_dialect(self):
        if self.protocol == "http":
            return "clickhouse+http"
        return "clickhouse+native"

    def get_dialect(self):
        return "clickhouse"

    def connect_args(self):
        """Return connection args for ClickHouse."""
        args = {}
        if self.secure:
            args["secure"] = True
        return args

    def list_databases(self):
        """Return list of databases for ClickHouse server."""
        try:
            with self.get_connection() as connection:
                from sqlalchemy import text

                rows = connection.execute(text("SHOW DATABASES")).fetchall()
                return [r[0] for r in rows]
        except Exception as e:
            raise e
