from typing import Union
import click
import os
from pathlib import Path
from visivo.logger.logger import Logger
from visivo.models.source import SourceTypeEnum
from visivo.models.sources.bigquery_source import BigQuerySource, BigQueryType
from visivo.models.sources.duckdb_source import DuckdbSource, DuckdbType
from visivo.models.sources.mysql_source import MysqlSource, MysqlType
from visivo.models.sources.postgresql_source import PostgresqlSource, PostgresqlType
from visivo.models.sources.snowflake_source import SnowflakeSource, SnowflakeType
from visivo.models.sources.sqlite_source import SqliteSource, SqliteType
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

    if output_dir != "":
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


def create_project_path(project_dir=None) -> Union[str, None]:
    if not project_dir:
        return "Project name must be provided"

    if Path(project_dir).exists():
        return f"'{project_dir}' directory already exists"

    os.makedirs(project_dir.strip(), exist_ok=True)
    return None


def create_source(
    project_name: str = "",
    source_name: str = "Example Source",
    project_dir: str = "",
    database: str = "",
    source_type: Union[
        SqliteType, PostgresqlType, MysqlType, SnowflakeType, BigQueryType, DuckdbType
    ] = None,
    host: str = "",
    port: int = None,
    username: str = "",
    password: str = "",
    account: str = "",
    warehouse: str = "",
    credentials_base64: str = "",
    project: str = "",
    dataset: str = "",
) -> Union[
    SqliteSource,
    PostgresqlSource,
    MysqlSource,
    SnowflakeSource,
    BigQuerySource,
    DuckdbSource,
    str,
    None,
]:
    project_dir = project_dir.strip()
    default_db_name = f"{database or 'local'}.db"

    local_db_path = Path(project_dir) / default_db_name if project_dir else default_db_name
    env_path = Path(project_dir) / ".env" if project_dir else Path(".env")

    def write_env(var: str, value: str):
        env_path.write_text(f"{var}={value}")

    if source_type in {
        SourceTypeEnum.duckdb,
        SourceTypeEnum.csv,
        SourceTypeEnum.excel,
    }:
        # All use duckdb engine under the hood
        source = DuckdbSource(
            name=source_name, database=str(local_db_path), type=SourceTypeEnum.duckdb
        )
        if source_type == SourceTypeEnum.duckdb:
            create_file_database(source.url(), project_dir)

        write_env("DB_PASSWORD", "EXAMPLE_password_l0cation")
        return source

    if source_type == SourceTypeEnum.sqlite:
        source = SqliteSource(name=source_name, database=str(local_db_path), type=source_type)
        create_file_database(source.url(), project_dir)
        write_env("DB_PASSWORD", "EXAMPLE_password_l0cation")
        return source

    if source_type == SourceTypeEnum.postgresql:
        write_env("DB_PASSWORD", "postgres")
        source = PostgresqlSource(
            name=source_name,
            host=host,
            port=port or 5432,
            database=database,
            type=source_type,
            password="postgres",
            username=username,
        )
        return source

    if source_type == SourceTypeEnum.mysql:
        write_env("DB_PASSWORD", password)
        return MysqlSource(
            name=source_name,
            host=host,
            database=database,
            type=source_type,
            password=password,
            username=username,
        )

    if source_type == SourceTypeEnum.snowflake:
        write_env("DB_PASSWORD", password)
        return SnowflakeSource(
            name=source_name,
            database=database,
            type=source_type,
            password=password,
            username=username,
            account=account,
            warehouse=warehouse,
        )

    if source_type == SourceTypeEnum.bigquery:
        write_env("DB_PASSWORD", credentials_base64)
        return BigQuerySource(
            name=source_name,
            project=project,
            database=dataset,
            type=source_type,
            credentials_base64=credentials_base64,
        )

    return None
