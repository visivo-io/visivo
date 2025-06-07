import click
from visivo.commands.options import user_dir, stage, host


@click.command()
@stage
@host
@user_dir
def archive(stage, host, user_dir):
    """
    Archives a stage.  You must specify a stage when deploying a project.
    """
    from visivo.logger.logger import Logger

    Logger.instance().debug("Archiving")

    from visivo.commands.archive_phase import archive_phase

    archive_phase(
        user_dir=user_dir,
        stage=stage,
        host=host,
    )
    Logger.instance().success("Done")
