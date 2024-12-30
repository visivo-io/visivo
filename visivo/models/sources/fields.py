import re
from typing import Annotated, Any, Union
from pydantic import Discriminator, Tag
from visivo.models.base.base_model import ContextStringType, RefStringType
from visivo.models.base.context_string import CONTEXT_STRING_VALUE_REGEX
from visivo.models.sources.mysql_source import MysqlSource
from visivo.models.sources.postgresql_source import PostgresqlSource
from visivo.models.sources.snowflake_source import SnowflakeSource
from visivo.models.sources.sqlite_source import SqliteSource
from visivo.models.sources.bigquery_source import BigQuerySource
from visivo.models.sources.duckdb_source import DuckdbSource


def get_model_discriminator_value(value: Any) -> str:
    if isinstance(value, str) and re.search(CONTEXT_STRING_VALUE_REGEX, value):
        return "Context"
    elif isinstance(value, str):
        return "Ref"
    elif isinstance(value, dict):
        if "type" in value:
            return value["type"]
    if hasattr(value, "type"):
        return value.type

    return None


SourceField = Annotated[
    Union[
        Annotated[SqliteSource, Tag("sqlite")],
        Annotated[PostgresqlSource, Tag("postgresql")],
        Annotated[MysqlSource, Tag("mysql")],
        Annotated[SnowflakeSource, Tag("snowflake")],
        Annotated[BigQuerySource, Tag("bigquery")],
        Annotated[DuckdbSource, Tag("duckdb")],
    ],
    Discriminator(get_model_discriminator_value),
]

SourceRefField = Annotated[
    Union[
        RefStringType,
        ContextStringType,
        Annotated[SqliteSource, Tag("sqlite")],
        Annotated[PostgresqlSource, Tag("postgresql")],
        Annotated[MysqlSource, Tag("mysql")],
        Annotated[SnowflakeSource, Tag("snowflake")],
        Annotated[BigQuerySource, Tag("bigquery")],
    ],
    Discriminator(get_model_discriminator_value),
]
