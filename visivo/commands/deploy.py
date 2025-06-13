import click
from visivo.commands.options import output_dir, working_dir, user_dir, stage, host


@click.command()
@working_dir
@output_dir
@stage
@host
@user_dir
def deploy(working_dir, user_dir, output_dir, stage, host):
    """
    Sends the current version of your project, traces & data to app.visivo.io where it can be viewed by other users on your account. You must specify a stage when deploying a project. The stage allows multiple versions of your project to exist remotely. This is very useful for setting up different dev, CI and production environments.
    """
    from visivo.logger.logger import Logger

    Logger.instance().debug("Deploying")

    from visivo.commands.deploy_phase import deploy_phase

    url = deploy_phase(
        user_dir=user_dir,
        working_dir=working_dir,
        output_dir=output_dir,
        stage=stage,
        host=host,
    )
    Logger.instance().success(f"Deployed to: '{host}{url}'")
