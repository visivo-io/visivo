import click
from visivo.commands.options import output_dir, working_dir, user_dir, stage, host


@click.command()
@working_dir
@output_dir
@stage
@host
@user_dir
@click.option(
    "--skip-source-upload",
    help=(
        "Skip uploading the project YAML source tarball to the deploy host. "
        "Escape hatch for environments where the source-upload endpoint has not yet shipped. "
        "Cloud-side runs against this project will not be possible when set."
    ),
    is_flag=True,
    default=False,
)
def deploy(working_dir, user_dir, output_dir, stage, host, skip_source_upload):
    """
    Sends the current version of your project and its insight data to app.visivo.io where it can be viewed by other users on your account. You must specify a stage when deploying a project. The stage allows multiple versions of your project to exist remotely. This is very useful for setting up different dev, CI and production environments.

    For cloud-side runs to work, source credentials referenced in the project YAML must use ``${env.VAR}`` syntax rather than being hardcoded — the runner has no way to read plaintext secrets stored in YAML.
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
        skip_source_upload=skip_source_upload,
    )
    Logger.instance().success(f"Deployed to: '{host}{url}'")
