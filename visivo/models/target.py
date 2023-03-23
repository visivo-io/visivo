from .base_model import BaseModel
from typing import Optional, List, Union
from enum import Enum
from visivo.models.alert import SlackAlert, EmailAlert, TestAlert
from pydantic import Field
from typing_extensions import Annotated
from sqlalchemy.engine import URL

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
            host = self.host,
            username = self.username ,
            password = self.password ,
            port = self.port ,
            drivername = self.get_dialect(),
            database= self.database,
            query = None
        )
        return url
