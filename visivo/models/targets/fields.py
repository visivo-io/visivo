from typing import Annotated, Any, Union
from pydantic import Discriminator, Tag
from visivo.models.base.base_model import RefString
from visivo.models.targets.mysql_target import MysqlTarget
from visivo.models.targets.postgresql_target import PostgresqlTarget
from visivo.models.targets.snowflake_target import SnowflakeTarget
from visivo.models.targets.sqlite_target import SqliteTarget


def get_model_discriminator_value(value: Any) -> str:
    if isinstance(value, str):
        return "Ref"
    if isinstance(value, dict):
        if "type" in value:
            return value["type"]
    if hasattr(value, "type"):
        return value.type

    return None


TargetField = Annotated[
    Union[
        Annotated[SqliteTarget, Tag("sqlite")],
        Annotated[PostgresqlTarget, Tag("postgresql")],
        Annotated[MysqlTarget, Tag("mysql")],
        Annotated[SnowflakeTarget, Tag("snowflake")],
    ],
    Discriminator(get_model_discriminator_value),
]

TargetRefField = Annotated[
    Union[
        RefString,
        Annotated[SqliteTarget, Tag("sqlite")],
        Annotated[PostgresqlTarget, Tag("postgresql")],
        Annotated[MysqlTarget, Tag("mysql")],
        Annotated[SnowflakeTarget, Tag("snowflake")],
    ],
    Discriminator(get_model_discriminator_value),
]
