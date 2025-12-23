import click
import os
import re

from visivo.models.base.named_model import NAME_REGEX


def working_dir(function):
    def callback(ctx, param, value):
        ctx.ensure_object(dict)
        ctx.obj["is_default_working_dir"] = value is None
        return value if value is not None else os.getcwd()

    function = click.option(
        "-w", "--working-dir", help="Directory to run the command", default=None, callback=callback
    )(function)
    return function


def output_dir(function):
    click.option(
        "-o",
        "--output-dir",
        help="Directory to output results",
        default=f"{os.getcwd()}/target",
    )(function)
    return function


def dbt_profile(function):
    click.option(
        "-dp",
        "--dbt-profile",
        help="The dbt profile to use",
        default=None,
    )(function)
    return function


def dbt_target(function):
    click.option(
        "-dt",
        "--dbt-target",
        help="The dbt target to use",
        default=None,
    )(function)
    return function


def project_dir(function):
    click.option(
        "-pd",
        "--project-dir",
        help="Directory to initialize the project in",
        default=".",
    )(function)
    return function


def dist_dir(function):
    click.option(
        "-d",
        "--dist-dir",
        help="Directory to output the distribution files",
        default=f"{os.getcwd()}/dist",
    )(function)
    return function


def dag_filter(function):
    click.option(
        "-df",
        "--dag-filter",
        help="Run the command with the given dag filter. ie `-df 'dashboard-name'+` will only run the dashboard named 'dashboard-name' and it's children",
        default=None,
    )(function)
    return function


def source(function):
    click.option(
        "-s",
        "--source",
        help="Name of the default source connection to use. This overrides the default source in the project.",
    )(function)
    return function


def user_dir(function):
    click.option(
        "-u",
        "--user-dir",
        help="Directory containing profile",
        default=os.path.expanduser("~"),
    )(function)
    return function


def validate_stage(ctx, param, value):
    if value.strip() == "":
        raise click.BadParameter("Only whitespace is not permitted for stage name.")

    if not re.search(NAME_REGEX, value):
        raise click.BadParameter(
            "Only alphanumeric, whitespace, and '\"-_ characters permitted for stage name."
        )

    return value


def stage(function):
    click.option(
        "-s",
        "--stage",
        help="The stage of the project to deploy i.e. staging",
        callback=validate_stage,
        required=True,
    )(function)
    return function


def host(function):
    click.option(
        "-h",
        "--host",
        help="Host to deploy to",
        default=f"https://app.visivo.io",
    )(function)
    return function


def port(function):
    click.option(
        "-p",
        "--port",
        help="What port to serve on",
        default=8000,
    )(function)
    return function


def threads(function):
    click.option(
        "-th",
        "--threads",
        help="The max number of threads to use when running trace queries",
        default=None,
    )(function)
    return function


def skip_compile(function):
    click.option(
        "-sc",
        "--skip-compile",
        help="Skips the compile phase. This is useful if you have already compiled just want to run or serve.",
        is_flag=True,
        default=False,
    )(function)
    return function


def verbose(function):
    def set_debug_env(ctx, param, value):
        """Callback to set DEBUG environment variable when verbose is enabled."""
        import os

        if value:
            os.environ["DEBUG"] = "true"
        return value

    click.option(
        "--verbose",
        help="Enable verbose output. Shows full trace names and details in runtime logs.",
        is_flag=True,
        default=False,
        callback=set_debug_env,
        is_eager=True,
    )(function)
    return function


def new(function):
    function = click.option(
        "-n",
        "--new",
        help="Start a new Visivo session",
        is_flag=True,
        default=False,
    )(function)

    function = click.option(
        "--pd",
        "--project-dir",
        help="Directory to initialize the project in",
        type=click.Path(file_okay=False, dir_okay=True),
    )(function)

    function = click.argument(
        "project_dir",
        required=False,
    )(function)
    return function


def deployment_root(function):
    click.option(
        "-dr",
        "--deployment-root",
        help="The root path to use for the dist. This is useful if you want to deploy to a subpath on a server.",
        default=None,
        required=False,
    )(function)
    return function


def no_deprecation_warnings(function):
    click.option(
        "--no-deprecation-warnings",
        help="Suppress deprecation warnings",
        is_flag=True,
        default=False,
    )(function)
    return function
