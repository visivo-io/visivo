import click
import os
import re

from visivo.models.base.named_model import NAME_REGEX


def working_dir(function):
    click.option(
        "-w",
        "--working-dir",
        help="Directory to run the command",
        default=os.getcwd(),
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


def dist_dir(function):
    click.option(
        "-d",
        "--dist-dir",
        help="Directory to output the distribution files",
        default=f"{os.getcwd()}/dist",
    )(function)
    return function


def name_filter(function):
    click.option(
        "-nf",
        "--name-filter",
        help="Run the command to only include the dag that includes the node with the given name",
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
