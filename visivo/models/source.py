from pydantic import BaseModel, Field
from enum import Enum


class SourceTypeEnum(str, Enum):
    sqlite = "sqlite"
    postgresql = "postgresql"
    mysql = "mysql"
    snowflake = "snowflake"
    bigquery = "bigquery"
    duckdb = "duckdb"
    excel = "xls"
    csv = "csv"


class CreateSourceRequest(BaseModel):
    project_name: str = Field(..., min_length=1)
    source_name: str = "Example Source"
    database: str = ""
    source_type: str = ""
    host: str = ""
    username: str = ""
    password: str = ""
    account: str = ""
    warehouse: str = ""
    credentials_base64: str = ""
    project: str = ""
    dataset: str = ""
    project_dir: str = ""
    port: str = ""
