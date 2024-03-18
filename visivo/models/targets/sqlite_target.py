from typing import Any, Optional
from visivo.models.base.named_model import NamedModel

# from visivo.models.targets.sqlalchemy_target import SqlalchemyTarget
from visivo.models.targets.target import Target, TypeEnum
from pydantic import Field, SecretStr
from pandas import DataFrame
from sqlalchemy import create_engine, text
import click
from sqlalchemy.engine import URL


class SqliteTarget(NamedModel):
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

    host: Optional[str] = Field(None, description="The host url of the database.")
    port: Optional[int] = Field(None, description="The port of the database.")
    database: str = Field(
        ..., description="The database that the Visivo project will use in queries."
    )
    username: Optional[str] = Field(None, description="Username for the database.")
    password: Optional[SecretStr] = Field(
        None, description="Password corresponding to the username."
    )
    db_schema: Optional[str] = Field(
        None, description="The schema that the Visivo project will use in queries."
    )
    type: TypeEnum.sqlite
    _engine: Any = None

    def get_dialect(self):
        return "sqlite+pysqlite"

    def read_sql(self, query: str) -> DataFrame:
        with self.connect() as connection:
            query = text(query)
            results = connection.execute(query)
            columns = results.keys()
            data = results.fetchall()
            results.close()

        return DataFrame(data, columns=columns)

    def get_connection(self):
        try:
            return self.get_engine().connect()
        except Exception as err:
            raise click.ClickException(
                f"Error connecting to target '{self.name}'. Ensure the database is running and the connection properties are correct."
            )

    def get_engine(self):
        if not self._engine:
            if self.hasattr("connection_pool_size"):
                self._engine = create_engine(
                    self.url(), pool_size=self.connection_pool_size
                )
            else:
                self._engine = create_engine(self.url())

        return self._engine

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
