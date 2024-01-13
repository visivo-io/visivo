import click
import json
import os
from pathlib import Path
from visivo.models.project import Project
from visivo.models.target import Target
from sqlalchemy import create_engine, MetaData, Table, Integer, Column, insert 
from visivo.parsers.core_parser import PROFILE_FILE_NAME
from visivo.utils import load_yaml_file


def find_default_target(project: Project, target_name: str) -> Target:
    if len(project.targets) == 0 and not target_name:
        raise click.ClickException(
            f"The project must contain a target."
        )

    if not target_name and len(project.targets) == 1:
        return project.targets[0]

    if not target_name and project.defaults and project.defaults.target_name:
        target_name = project.defaults.target_name

    target = project.find_target(name=target_name)

    if not target:
        raise click.ClickException(
            f"Target with name: '{target_name}' was not found in the project."
        )

    return target


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


def get_profile_file(home_directory=os.path.expanduser("~")):
    return Path(f"{home_directory}/.visivo/{PROFILE_FILE_NAME}")


def create_file_database(url, output_dir: str):
    os.makedirs(output_dir, exist_ok=True)
    engine = create_engine(url, echo=True)
    metadata_obj = MetaData()
    table = Table(
        "test_table",
        metadata_obj,
        Column("x", Integer),
        Column("y", Integer),
    )
    metadata_obj.create_all(engine)
    for v in [[1, 1], [2, 1], [3, 2], [4, 3], [5, 5], [6, 8]]:
        with engine.connect() as connection:
            connection.execute(insert(table).values(x=v[0], y=v[1]))
            connection.commit()
