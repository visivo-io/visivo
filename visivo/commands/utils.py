import click
import json
import os
from visivo.models.project import Project
from visivo.models.target import Target
from sqlalchemy import create_engine, MetaData, Table, Integer, Column, insert, String
from visivo.parsers.core_parser import PROFILE_FILE_NAME

from visivo.utils import load_yaml_file


def find_or_create_target(project: Project, target_or_name: str) -> Target:
    if len(project.targets) == 0 and not target_or_name:
        raise click.ClickException(
            f"The project must contain a target or a target must be passed as an object on the command line."
        )

    if not target_or_name and len(project.targets) == 1:
        return project.targets[0]

    if not target_or_name and project.defaults and project.defaults.target_name:
        target_or_name = project.defaults.target_name

    target = project.find_target(name=target_or_name)

    if not target and target_or_name and "{" in target_or_name:
        try:
            json_data = json.loads(target_or_name)
        except:
            raise click.ClickException(f"Target: '{target_or_name}' is not valid JSON")
        target = Target(**json_data)

    if not target and target_or_name:
        raise click.ClickException(
            f"Target with name: '{target_or_name}' was not found in the project."
        )

    if not target and not target_or_name:
        raise click.ClickException(
            f"When the project has multiple targets a target must be defined with a default or on the command line."
        )

    return target


def get_profile_token(parser):
    profile_file = next((f for f in parser.files if f.name == PROFILE_FILE_NAME), None)
    profile = None
    if profile_file:
        profile = load_yaml_file(profile_file)

    profile_token = os.getenv("VISIVO_TOKEN")
    if not profile_token:
        if not profile or "token" not in profile:
            raise click.ClickException(
                f"{PROFILE_FILE_NAME} not present or token not present in {PROFILE_FILE_NAME}"
            )
        profile_token = profile["token"]

    return profile_token


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
