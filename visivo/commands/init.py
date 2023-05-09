import click
import yaml
import json
from pathlib import Path
from visivo.models.target import Target, TypeEnum
from visivo.commands.utils import create_file_database
from .options import name


@click.command()
@name
def init(name):
    if Path(name).exists():
        raise click.ClickException(f"'{name}' directory already exists")
    click.echo(f"Creating project in '{name}'")
    target = Target(database=f"{name}/local.db", type=TypeEnum.sqlite)
    create_file_database(target.url(), name)
    fp = open(f"{name}/visivo_project.yml", "w")
    fp.write(yaml.dump({"name": name, "targets": [json.loads(target.json())]}))
    fp.close()
