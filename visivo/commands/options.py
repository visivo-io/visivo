import click
import os


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


def target(function):
    click.option(
        "-t",
        "--target",
        help="Name of the target connection to use. This overrides the default target in the project.",
    )(function)
    return function


def alert(function):
    click.option("-a", "--alert", help="Name of the alert to use", multiple=True)(
        function
    )
    return function


def user_dir(function):
    click.option(
        "-u",
        "--user-dir",
        help="Directory containing profile",
        default=os.path.expanduser("~"),
    )(function)
    return function


def stage(function):
    click.option(
        "-s",
        "--stage",
        help="The stage of the project to deploy i.e. staging",
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


def trace_filter(function):
    click.option(
        "-tf", "--trace-filter", help="Run traces that match this filter", default=".*"
    )(function)
    return function


def beta(function):
    click.option(
        "-b",
        "--beta",
        help="Whether to use the beta app",
        is_flag=True,
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
