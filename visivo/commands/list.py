import click
from visivo.commands.options import working_dir, output_dir, source
from visivo.commands.parse_project_phase import parse_project_phase
from visivo.commands.list_phase import list_phase


@click.command()
@click.argument("object_type", type=click.Choice(["sources", "models", "traces"]))
@working_dir
@output_dir
@source
def list(object_type, working_dir, output_dir, source):
    """
    Lists all objects of a given type in the project.
    """
    from visivo.logger.logger import Logger

    Logger.instance().debug(f"Listing {object_type}")

    # Parse the project to get access to all objects
    project = parse_project_phase(
        working_dir=working_dir,
        output_dir=output_dir,
        default_source=source,
        dbt_profile=None,
        dbt_target=None,
    )

    list_phase(project, object_type)

    Logger.instance().success("Done")
