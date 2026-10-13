import click
from visivo.commands.options import user_dir, branch, host


@click.command()
@branch
@host
@user_dir
def archive(branch, host, user_dir):
    """
    Archives a branch.  You must specify a branch when deploying a project.
    """
    from visivo.logger.logger import Logger

    Logger.instance().debug("Archiving")

    from visivo.commands.archive_phase import archive_phase

    archive_phase(
        user_dir=user_dir,
        branch=branch,
        host=host,
    )
    Logger.instance().success("Done")
