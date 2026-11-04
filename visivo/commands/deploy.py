import click
from visivo.commands.options import output_dir, working_dir, user_dir, branch, host


@click.command()
@working_dir
@output_dir
@branch
@host
@user_dir
@click.option(
    "--force",
    is_flag=True,
    default=False,
    help="Deploy even when the project has commits made in the cloud since the last CLI deploy. "
    "Those commits are replaced by your local files.",
)
def deploy(working_dir, user_dir, output_dir, branch, host, force):
    """
    Sends the current version of your project and its insight data to app.visivo.io where it can be viewed by other users on your account. You must specify a branch when deploying a project. The branch allows multiple versions of your project to exist remotely. This is very useful for setting up different dev, CI and production environments.
    """
    from visivo.logger.logger import Logger

    Logger.instance().debug("Deploying")

    from visivo.commands.deploy_phase import deploy_phase

    url = deploy_phase(
        user_dir=user_dir,
        working_dir=working_dir,
        output_dir=output_dir,
        branch=branch,
        host=host,
        force=force,
    )
    Logger.instance().success(f"Deployed to: '{host}{url}'")
