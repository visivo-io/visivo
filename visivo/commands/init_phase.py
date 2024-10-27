from typing import get_args
import click
import yaml
import json
import os
from pathlib import Path
from visivo.logging.logger import Logger
from visivo.models.include import Include
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.postgresql_source import PostgresqlSource, PostgresqlType
from visivo.models.sources.snowflake_source import SnowflakeSource, SnowflakeType
from visivo.models.sources.sqlite_source import SqliteSource, SqliteType
from visivo.models.sources.mysql_source import MysqlSource, MysqlType
from visivo.models.project import Project
from visivo.models.dashboard import Dashboard
from visivo.models.chart import Chart
from visivo.models.item import Item
from visivo.models.row import Row
from visivo.models.sources.sqlite_source import SqliteSource
from visivo.models.trace import Trace
from visivo.models.defaults import Defaults
from visivo.models.trace_props.scatter import Scatter
from visivo.commands.utils import create_file_database
from visivo.parsers.file_names import PROFILE_FILE_NAME
from visivo.commands.utils import get_source_types


def init_phase():
    """Enables a quick set up by writing your source & api credentials to an env file."""
    user_home = os.path.expanduser("~")
    Logger.instance().success("Initialized")
    project_name = click.prompt("? Project name", type=str)
    if Path(project_name).exists():
        raise click.ClickException(f"'{project_name}' directory already exists")

    os.makedirs(project_name, exist_ok=True)
    sqlite_type = get_args(SqliteType)[0]
    postgresql_type = get_args(PostgresqlType)[0]
    mysql_type = get_args(MysqlType)[0]
    snowflake_type = get_args(SnowflakeType)[0]
    types = get_source_types()

    source_type = click.prompt("? Database type", type=click.Choice(types))
    if source_type == sqlite_type:
        source = SqliteSource(
            name="Example Source",
            database=f"{project_name}/local.db",
            type=source_type,
        )
        create_file_database(source.url(), project_name)
        source.database = "local.db"
        fp = open(f"{project_name}/.env", "w+")
        fp.write("DB_PASSWORD=EXAMPLE_password_l0cation")
        fp.close()

    if source_type == postgresql_type:
        host = click.prompt("? Database host", type=str)
        database = click.prompt("? Database name", type=str)
        username = click.prompt("? Database username", type=str)
        password = click.prompt(
            "? Database password", type=str, hide_input=True, confirmation_prompt=True
        )
        fp = open(f"{project_name}/.env", "w+")
        fp.write(f"DB_PASSWORD={password}")
        fp.close()
        source = PostgresqlSource(
            name="Example Source",
            host=host,
            database=database,
            type=source_type,
            password=password,
            username=username,
        )
    if source_type == mysql_type:
        host = click.prompt("? Database host", type=str)
        database = click.prompt("? Database name", type=str)
        username = click.prompt("? Database username", type=str)
        password = click.prompt(
            "? Database password", type=str, hide_input=True, confirmation_prompt=True
        )
        fp = open(f"{project_name}/.env", "w+")
        fp.write(f"DB_PASSWORD={password}")
        fp.close()
        source = MysqlSource(
            name="Example Source",
            host=host,
            database=database,
            type=source_type,
            password=password,
            username=username,
        )

    if source_type == snowflake_type:
        database = click.prompt("? Database name", type=str)
        account = click.prompt("? Snowflake account", type=str)
        warehouse = click.prompt("? Snowflake warehouse", type=str)
        username = click.prompt("? Database username", type=str)
        password = click.prompt(
            "? Database password", type=str, hide_input=True, confirmation_prompt=True
        )
        fp = open(f"{project_name}/.env", "w+")
        fp.write(f"DB_PASSWORD={password}")
        fp.close()
        source = SnowflakeSource(
            name="Example Source",
            database=database,
            type=source_type,
            password=password,
            username=username,
            account=account,
            warehouse=warehouse,
        )

    Logger.instance().debug("Generating project, gitignore & env files")

    model = SqlModel(name="Example Model", sql="select * from test_table")
    props = Scatter(type="scatter", x="query(x)", y="query(y)")
    trace = Trace(name="Example Trace", model=model, props=props, changed=None)
    chart = Chart(name="Example Chart", traces=[trace])
    item = Item(chart=chart)
    row = Row(items=[item])
    dashboard = Dashboard(name="Example Dashboard", rows=[row])
    defaults = Defaults(source_name=source.name)
    includes = Include(
        path="visivo-io/visivo.git@main -- test-projects/demo/dashboards/welcome.visivo.yml"
    )
    project = Project(
        name=project_name,
        includes=[includes],
        defaults=defaults,
        sources=[source],
        dashboards=[dashboard],
    )

    fp = open(f"{project_name}/project.visivo.yml", "w")
    fp.write(
        yaml.dump(
            json.loads(project.model_dump_json(exclude_none=True, by_alias=True)), sort_keys=False
        ).replace("'**********'", "\"{{ env_var('DB_PASSWORD') }}\"")
    )
    fp.close()

    fp = open(f"{project_name}/.gitignore", "w")
    fp.write(".env\ntarget\n.visivo_cache")
    fp.close()

    Logger.instance().success("Generated project, gitignore & env files")

    profile_path = f"{user_home}/.visivo/{PROFILE_FILE_NAME}"
    if not os.path.exists(profile_path):
        Logger.instance().info(
            f"> Visit 'https://app.visivo.io/profile' and create a new token if you don't already have one."
        )
        Logger.instance().info(
            f"> You may need to register or get added to an account before visiting your profile."
        )
        token = click.prompt("? Personal token", type=str)
        os.makedirs(f"{user_home}/.visivo", exist_ok=True)
        fp = open(profile_path, "w")
        fp.write(f"token: {token}")
        fp.close()
        Logger.instance().info(f"> Created profile in '~/.visivo/profile.yml'")
    else:
        message = "Found profile at location: " + profile_path
        Logger.instance().info(message)
    Logger.instance().info(f"> Created project in '{project_name}'")
