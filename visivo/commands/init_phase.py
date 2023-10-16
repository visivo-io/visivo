import click
import yaml
import json
import os
from pathlib import Path
from visivo.logging.logger import Logger
from visivo.models.target import Target, TypeEnum
from visivo.models.project import Project
from visivo.models.dashboard import Dashboard
from visivo.models.chart import Chart
from visivo.models.item import Item
from visivo.models.row import Row
from visivo.models.trace import Trace
from visivo.models.model import Model
from visivo.models.defaults import Defaults
from visivo.models.trace_props import Scatter
from visivo.commands.utils import create_file_database
from visivo.parsers.core_parser import PROFILE_FILE_NAME


def init_phase():
    """Enables a quick set up by writing your target & api credentials to an env file."""
    user_home = os.path.expanduser("~")

    project_name = click.prompt("? Project name", type=str)
    if Path(project_name).exists():
        raise click.ClickException(f"'{project_name}' directory already exists")

    os.makedirs(project_name, exist_ok=True)

    types = [t.value for t in TypeEnum]
    target_type = click.prompt("? Database type", type=click.Choice(types))
    password = None
    username = None
    database = None
    warehouse = None
    account = None
    host = None
    if target_type != TypeEnum.sqlite:
        if target_type == TypeEnum.postgresql:
            host = click.prompt("? Database host", type=str)
        database = click.prompt("? Database name", type=str)
        username = click.prompt("? Database username", type=str)
        password = click.prompt(
            "? Database password", type=str, hide_input=True, confirmation_prompt=True
        )
        fp = open(f"{project_name}/.env", "w")
        fp.write(f"DB_PASSWORD={password}")
        fp.close()
    else:
        database = f"{project_name}/local.db"

    if target_type == TypeEnum.snowflake:
        account = click.prompt("? Snowflake account", type=str)
        warehouse = click.prompt("? Snowflake warehouse", type=str)

    target = Target(
        name="Example Target",
        host=host,
        database=database,
        type=target_type,
        password=password,
        username=username,
        account=account,
        warehouse=warehouse,
    )

    if target_type == TypeEnum.sqlite:
        create_file_database(target.url(), project_name)
        target.database = "local.db"
        fp = open(f"{project_name}/.env", "w")
        fp.write("DB_PASSWORD=EXAMPLE_password_l0cation")
        fp.close()

    model = Model(name="Example Model", sql="select * from table_in_database")
    props = Scatter(
        type="scatter", x="query(x_value_from_model)", y="query(y_value_from_model)"
    )
    trace = Trace(name="Example Trace", model=model, props=props, changed=None)
    chart = Chart(name="Example Chart", traces=[trace])
    item = Item(chart=chart)
    row = Row(items=[item])
    dashboard = Dashboard(name="Example Dashboard", rows=[row])
    defaults = Defaults(target_name=target.name)
    project = Project(
        name=project_name, defaults=defaults, targets=[target], dashboards=[dashboard]
    )

    fp = open(f"{project_name}/project.visivo.yml", "w")
    fp.write(
        yaml.dump(
            json.loads(project.model_dump_json(exclude_none=True)), sort_keys=False
        ).replace("'**********'", "\"{{ env_var('DB_PASSWORD') }}\"")
    )
    fp.close()

    fp = open(f"{project_name}/.gitignore", "w")
    fp.write(".env\ntarget\n.visivo_cache")
    fp.close()

    profile_path = f"{user_home}/.visivo/{PROFILE_FILE_NAME}"
    if not os.path.exists(profile_path):
        Logger.instance().debug(
            f"> Visit 'https://app.visivo.io/profile' and create a new token if you don't already have one."
        )
        Logger.instance().debug(
            f"> You may need to register or get added to an account before visiting your profile."
        )
        token = click.prompt("? Personal token", type=str)
        os.makedirs(f"{user_home}/.visivo", exist_ok=True)
        fp = open(profile_path, "w")
        fp.write(f"token: {token}")
        fp.close()
        Logger.instance().debug(f"> Created profile in '~/.visivo/profile.yml'")
    Logger.instance().debug(f"> Created project in '{project_name}'")
