from ..base.named_model import NamedModel
from enum import Enum
from sqlalchemy.engine import URL
from pandas import DataFrame
from abc import ABC, abstractmethod


class DefaultTarget:
    pass


class TypeEnum(str, Enum):
    postgresql = "postgresql"
    sqlite = "sqlite"
    snowflake = "snowflake"
    mysql = "mysql"


class Target:
    """
    Targets hold the connection information to your data sources.

    A single project can have many targets. You can even set up Visivo so that a single chart contains traces that pull data from completely different targets. ex.)
    ``` yaml
    targets:
      - name: local-sqlite
        database: target/local.db
        type: sqlite
      - name: local-postgres
        database: postgres
        type: postgresql
        username: postgres
        password: postgres
        port: 5434
      - name: remote-snowflake
        type: snowflake
        database: DEV
        account: ax28471.us-west-2.aws
        db_schema: DEFAULT
        username: {% raw %}{{ env_var('SNOWFLAKE_USER') }}{% endraw %}
        warehouse: DEV
        password: {% raw %}{{ env_var('SNOWFLAKE_PASSWORD') }}{% endraw %}
    ```

    Different data stores, which you specify with the `type` attribute, require different configurations. For example the snowflake `type` require that you specify a `warehouse` while the sqlite `type` does not require that attribute.

    It is best practice to leverage the `{% raw %}{{ env_var() }}{% endraw %}` jinja function for storing secrets and enabling different permissions in production, staging and dev.
    """

    def get_dialect(self):
        raise NotImplementedError(f"No dialect method implemented for {self.type}")

    def get_connection(self):
        raise NotImplementedError(f"No connection method implemented for {self.type}")

    def read_sql(self, query: str) -> DataFrame:
        raise NotImplementedError(f"No read sql method implemented for {self.type}")

    def get_password(self):
        return self.password.get_secret_value() if self.password is not None else None

    def connect(self):
        return Connection(target=self)

    def url(self) -> URL:
        url = URL.create(
            host=self.host,
            username=self.username,
            password=self.get_password(),
            port=self.port,
            drivername=self.get_dialect(),
            database=self.database,
            query=None,
        )
        return url


class Connection:
    def __init__(self, target: Target):
        self.target = target

    def __enter__(self):
        self.conn = self.target.get_connection()
        return self.conn

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.conn.close()
        self.conn = None
        self.conn_type = None
