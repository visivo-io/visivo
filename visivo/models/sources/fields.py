from typing import Annotated, Any, Union
from pydantic import Discriminator, Tag
from visivo.models.base.base_model import RefString
from visivo.models.sources.mysql_source import MysqlSource
from visivo.models.sources.postgresql_source import PostgresqlSource
from visivo.models.sources.snowflake_source import SnowflakeSource
from visivo.models.sources.sqlite_source import SqliteSource


def get_model_discriminator_value(value: Any) -> str:
    if isinstance(value, str):
        return "Ref"
    if isinstance(value, dict):
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
    ],
    Discriminator(get_model_discriminator_value),
]

SourceRefField = Annotated[
    Union[
        RefString,
        Annotated[SqliteSource, Tag("sqlite")],
        Annotated[PostgresqlSource, Tag("postgresql")],
        Annotated[MysqlSource, Tag("mysql")],
        Annotated[SnowflakeSource, Tag("snowflake")],
    ],
    Discriminator(get_model_discriminator_value),
]
