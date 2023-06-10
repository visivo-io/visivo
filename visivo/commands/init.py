import click
import yaml
import json
import os
from pathlib import Path
from visivo.models.target import Target, TypeEnum
from visivo.commands.utils import create_file_database
from visivo.parsers.core_parser import PROFILE_FILE_NAME


@click.command()
def init():
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
    if target_type != TypeEnum.sqlite:
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

    target = Target(
        database=database,
        type=target_type,
        password=password,
        username=username,
    )

    if target_type == TypeEnum.sqlite:
        create_file_database(target.url(), project_name)
        target.database = "local.db"
        fp = open(f"{project_name}/.env", "w")
        fp.write("DB_PASSWORD=EXAMPLE_password_l0cation")
        fp.close()

    fp = open(f"{project_name}/visivo_project.yml", "w")
    fp.write(
        yaml.dump(
            {
                "name": project_name,
                "targets": [json.loads(target.json(exclude_none=True))],
            }
        ).replace("'**********'", "env_var('DB_PASSWORD')")
    )
    fp.close()

    fp = open(f"{project_name}/.gitignore", "w")
    fp.write(".env")
    fp.close()

    profile_path = f"{user_home}/.visivo/{PROFILE_FILE_NAME}"
    if not os.path.exists(profile_path):
        click.echo(
            f"> Visit 'https://app.visivo.io/profile' and create a new token if you don't already have one."
        )
        click.echo(
            f"> You may need to register or get added to an account before visiting your profile."
        )
        token = click.prompt("? Personal token", type=str)
        os.makedirs(f"{user_home}/.visivo", exist_ok=True)
        fp = open(profile_path, "w")
        fp.write(f"token: {token}")
        fp.close()
        click.echo(f"> Created profile in '~/.visivo/profile.yml'")
    click.echo(f"> Created project in '{project_name}'")
