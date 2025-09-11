import click
from visivo.commands.options import project_dir


@click.command()
@project_dir
@click.option(
    "--dry-run",
    is_flag=True,
    help="Show what would be converted without making changes",
    default=False,
)
def yaml2kson(project_dir, dry_run):
    """
    Convert Visivo project YAML files to KSON format.
    
    This command will convert all YAML files that are part of the Visivo project
    (project.visivo.yml and any included files) to KSON format.
    """
    from visivo.logger.logger import Logger

    Logger.instance().debug(f"Converting project YAML files to KSON in {project_dir}")

    from visivo.commands.yaml2kson_phase import yaml2kson_phase

    yaml2kson_phase(project_dir, dry_run)

    if dry_run:
        Logger.instance().info("Dry run complete - no files were modified")
    else:
        Logger.instance().success("Successfully converted project files to KSON format")