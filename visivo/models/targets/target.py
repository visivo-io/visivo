from typing import Optional
from ..base.named_model import NamedModel
from sqlalchemy.engine import URL
from pandas import DataFrame
from abc import ABC, abstractmethod
from pydantic import Field, SecretStr


class DefaultTarget:
    pass


class Target(ABC, NamedModel):
    """
    Targets hold the connection information to your data sources.
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

    @abstractmethod
    def get_connection(self):
        raise NotImplementedError(f"No connection method implemented for {self.type}")

    @abstractmethod
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
