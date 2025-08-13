from typing import Optional
from pydantic import BaseModel, Field
from enum import Enum


class SourceTypeEnum(str, Enum):
    sqlite = "sqlite"
    postgresql = "postgresql"
    mysql = "mysql"
    snowflake = "snowflake"
    bigquery = "bigquery"
    duckdb = "duckdb"
    redshift = "redshift"
    excel = "xls"
    csv = "csv"


class CreateSourceRequest(BaseModel):
    project_name: str = Field(..., min_length=1)
    source_name: Optional[str] = "Example Source"
    database: Optional[str] = ""
    source_type: Optional[str] = ""
    host: Optional[str] = ""
    username: Optional[str] = ""
    password: Optional[str] = ""
    account: Optional[str] = ""
    warehouse: Optional[str] = ""
    credentials_base64: Optional[str] = ""
    project: Optional[str] = ""
    dataset: Optional[str] = ""
    project_dir: Optional[str] = ""
    port: Optional[str] = ""
