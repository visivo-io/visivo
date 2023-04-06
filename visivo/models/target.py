from .base_model import BaseModel
from typing import Optional, List, Union
from enum import Enum
from visivo.models.alert import SlackAlert, EmailAlert, TestAlert
from pydantic import Field
from typing_extensions import Annotated
from sqlalchemy.engine import URL
from sqlalchemy import create_engine, text
import snowflake.connector
from pandas import DataFrame, read_sql


class TypeEnum(str, Enum):
    postgresql = "postgresql"
    sqlite = "sqlite"
    snowflake = "snowflake"
    mysql = "mysql"


Alert = Annotated[Union[SlackAlert, EmailAlert, TestAlert], Field(discriminator="type")]


class Target(BaseModel):
    type: TypeEnum = TypeEnum.postgresql
    alerts: List[Alert] = []
    host: Optional[str]
    port: Optional[int]
    database: str
    username: Optional[str]
    password: Optional[str]
    account: Optional[str]
    warehouse: Optional[str]
    db_schema: Optional[str]

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
            password=self.password,
            port=self.port,
            drivername=self.get_dialect(),
            database=self.database,
            query=None,
        )
        return url

    def _get_connection(self):
        match self.type:
            case TypeEnum.postgresql:
                engine = create_engine(self.url())
                return engine.connect()
            case TypeEnum.sqlite:
                engine = create_engine(self.url())
                return engine.connect()
            case TypeEnum.snowflake:
                return snowflake.connector.connect(
                    account=self.account,
                    user=self.username,
                    password=self.password,
                    warehouse=self.warehouse,
                    database=self.database,
                    schema=self.db_schema,
                )
            case TypeEnum.mysql:
                engine = create_engine(self.url())
                return engine.connect()
            case _:
                raise NotImplementedError(
                    f"No connection method implemented for {self.type}"
                )

    def connect(self):
        return Connection(target=self)

    def read_sql(self, query: str) -> DataFrame:
        with self.connect() as connection:
            if self.get_connection_type() == "sqlalchemy":
                query = text(query)
            data_frame = read_sql(query, connection)
        return data_frame


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
