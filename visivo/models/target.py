from .base.named_model import NamedModel
from pydantic import Field, SecretStr
from typing import Any, Optional
from enum import Enum
from sqlalchemy.engine import URL
from sqlalchemy.pool import NullPool
from sqlalchemy import create_engine, text
import snowflake.connector
from pandas import DataFrame, read_sql
import click


class DefaultTarget:
    pass


class TypeEnum(str, Enum):
    postgresql = "postgresql"
    sqlite = "sqlite"
    snowflake = "snowflake"
    mysql = "mysql"


class Target(NamedModel):
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

    type: TypeEnum = TypeEnum.postgresql
    host: Optional[str] = Field(None, description="The host url of the database.")
    port: Optional[int] = Field(None, description="The port of the database.")
    database: str = Field(
        ..., description="The database that the Visivo project will use in queries."
    )
    username: Optional[str] = Field(None, description="Username for the database.")
    password: Optional[SecretStr] = Field(
        None, description="Password corresponding to the username."
    )
    account: Optional[str] = Field(
        None,
        description="**Snowflake Only** The snowflake account url. Here's how you find this: [snowflake docs](https://docs.snowflake.com/en/user-guide/admin-account-identifier).",
    )
    warehouse: Optional[str] = Field(
        None,
        description="**Snowflake Only** The compute warehouse that you want queries from your visivo project to leverage.",
    )
    role: Optional[str] = Field(
        None,
        description="**Snowflake Only** The access role that you want to use when running queries.",
    )
    db_schema: Optional[str] = Field(
        None, description="The schema that the Visivo project will use in queries."
    )
    connection_pool_size: Optional[int] = Field(
        1, description="The pool size that is used for this connection."
    )
    _engine: Any

    def __init__(self, **data):
        super().__init__(**data)
        self._engine = None

    def get_connection_type(self):
        match self.type:
            case TypeEnum.postgresql:
                return "sqlalchemy"
            case TypeEnum.sqlite:
                return "sqlalchemy"
            case TypeEnum.snowflake:
                return "snowflake"
            case TypeEnum.mysql:
                return "sqlalchemy"

    def get_dialect(self):
        match self.type:
            case TypeEnum.postgresql:
                return "postgresql+psycopg2"
            case TypeEnum.sqlite:
                return "sqlite+pysqlite"
            case TypeEnum.snowflake:
                return "snowflake"
            case TypeEnum.mysql:
                return "mysql"

    def url(self) -> URL:
        url = URL.create(
            host=self.host,
            username=self.username,
            password=self._get_password(),
            port=self.port,
            drivername=self.get_dialect(),
            database=self.database,
            query=None,
        )
        return url

    def _get_password(self):
        return self.password.get_secret_value() if self.password is not None else None

    def _get_engine(self):
        if not self._engine:
            match self.type:
                case TypeEnum.postgresql:
                    self._engine = create_engine(
                        self.url(), pool_size=self.connection_pool_size
                    )
                case TypeEnum.sqlite:
                    self._engine = create_engine(self.url())
                case TypeEnum.mysql:
                    self._engine = create_engine(
                        self.url(), pool_size=self.connection_pool_size
                    )
        return self._engine

    def _get_connection(self):
        try:
            match self.type:
                case TypeEnum.postgresql:
                    return self._get_engine().connect()
                case TypeEnum.sqlite:
                    return self._get_engine().connect()
                case TypeEnum.snowflake:
                    return snowflake.connector.connect(
                        account=self.account,
                        user=self.username,
                        password=self._get_password(),
                        warehouse=self.warehouse,
                        database=self.database,
                        schema=self.db_schema,
                        role=self.role,
                    )
                case TypeEnum.mysql:
                    return self._get_engine().connect()
        except Exception as err:
            raise click.ClickException(
                f"Error connecting to target '{self.name}'. Ensure the database is running and the connection properties are correct."
            )

        raise NotImplementedError(f"No connection method implemented for {self.type}")

    def connect(self):
        return Connection(target=self)

    def read_sql(self, query: str) -> DataFrame:
        with self.connect() as connection:
            if self.get_connection_type() == "sqlalchemy":
                query = text(query)
                results = connection.execute(query)
                columns = results.keys()
                data = results.fetchall()
                results.close()

            if self.get_connection_type() == "snowflake":
                cursor = connection.cursor()
                cursor.execute(query)
                columns = [col[0] for col in cursor.description]
                data = cursor.fetchall()
                cursor.close()

        return DataFrame(data, columns=columns)


class Connection:
    def __init__(self, target: Target):
        self.target = target

    def __enter__(self):
        self.conn = self.target._get_connection()
        return self.conn

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.conn.close()
        self.conn = None
        self.conn_type = None
