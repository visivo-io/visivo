import click
import os
from pathlib import Path
from visivo.parsers.file_names import PROFILE_FILE_NAME
from visivo.utils import load_yaml_file


def get_source_types():
    from typing import get_args
    from visivo.models.sources.sqlite_source import SqliteType
    from visivo.models.sources.postgresql_source import PostgresqlType
    from visivo.models.sources.mysql_source import MysqlType
    from visivo.models.sources.snowflake_source import SnowflakeType
    from visivo.models.sources.bigquery_source import BigQueryType
    from visivo.models.sources.duckdb_source import DuckdbType

    sqlite_type = get_args(SqliteType)[0]
    postgresql_type = get_args(PostgresqlType)[0]
    mysql_type = get_args(MysqlType)[0]
    snowflake_type = get_args(SnowflakeType)[0]
    bigquery_type = get_args(BigQueryType)[0]
    duckdb_type = get_args(DuckdbType)[0]
    return [postgresql_type, mysql_type, sqlite_type, snowflake_type, bigquery_type, duckdb_type]


def get_profile_token(profile_file):
    profile_token = os.getenv("VISIVO_TOKEN")
    if profile_token:
        return profile_token

    profile = None
    if profile_file:
        profile = load_yaml_file(profile_file)

    if not profile or "token" not in profile:
        raise click.ClickException(
            f"{PROFILE_FILE_NAME} not present or token not present in {PROFILE_FILE_NAME}"
        )
    return profile["token"]


def get_profile_file(home_dir=os.path.expanduser("~")):
    return Path(f"{home_dir}/.visivo/{PROFILE_FILE_NAME}")


def create_file_database(url, output_dir: str):
    from sqlalchemy import create_engine, MetaData, Table, Integer, Column, insert

    os.makedirs(output_dir, exist_ok=True)
    engine = create_engine(url, echo=True)
    metadata_obj = MetaData()
    table = Table(
        "test_table",
        metadata_obj,
        Column("x", Integer),
        Column("y", Integer),
    )
    second_table = Table(
        "second_test_table",
        metadata_obj,
        Column("x", Integer),
        Column("y", Integer),
    )
    metadata_obj.create_all(engine)
    for v in [[1, 1], [2, 1], [3, 2], [4, 3], [5, 5], [6, 8]]:
        with engine.connect() as connection:
            connection.execute(insert(table).values(x=v[0], y=v[1]))
            connection.execute(insert(second_table).values(x=v[0], y=v[1] * 2))
            connection.commit()
