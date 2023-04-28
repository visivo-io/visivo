import click
import json
from visivo.models.project import Project
from visivo.models.target import Target


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
