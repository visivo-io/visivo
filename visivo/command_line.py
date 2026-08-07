from time import time

start_time = time()
from visivo.commands.options import verbose
from visivo.logger.logger import Logger, TypeEnum

Logger.instance().info("Starting Visivo...")
import click
import os
from dotenv import load_dotenv
from pydantic import ValidationError
import sys

from visivo.parsers.line_validation_error import LineValidationError
from visivo.telemetry import TelemetryClient, is_telemetry_enabled, get_telemetry_context
from visivo.telemetry.events import CLIEvent

from visivo.version import VISIVO_VERSION


class LazyGroup(click.Group):
    """Import each subcommand's module only when that command is invoked (or
    the group is listed), instead of importing all of them at startup.

    Importing all 14 subcommands eagerly pulls the entire model / query /
    source-connector graph into every invocation — even ``visivo --version``.
    The command that actually runs needs only its own slice, so ``visivo run``
    (and every ``visivo run`` a Celery worker spawns) pays for ``run`` alone.
    """

    # CLI name -> "module:attribute". Order here is the --help order.
    lazy_subcommands = {
        "init": "visivo.commands.init:init",
        "dbt": "visivo.commands.dbt:dbt",
        "compile": "visivo.commands.compile:compile",
        "run": "visivo.commands.run:run",
        "serve": "visivo.commands.serve:serve",
        "deploy": "visivo.commands.deploy:deploy",
        "dist": "visivo.commands.dist:dist",
        "test": "visivo.commands.test:test",
        "aggregate": "visivo.commands.aggregate:aggregate",
        "archive": "visivo.commands.archive:archive",
        "authorize": "visivo.commands.authorize:authorize",
        "create": "visivo.commands.create:create",
        "list": "visivo.commands.list:list",
        "migrate": "visivo.commands.migrate:migrate",
    }

    def list_commands(self, ctx):
        return list(self.lazy_subcommands)

    def get_command(self, ctx, name):
        target = self.lazy_subcommands.get(name)
        if target is None:
            return None
        import importlib

        module_path, attr = target.split(":")
        return getattr(importlib.import_module(module_path), attr)


@click.group(cls=LazyGroup)
@click.option("-p", "--profile", is_flag=True)
@click.option("-e", "--env-file", default=".env")
@click.version_option(version=VISIVO_VERSION)
@verbose
def visivo(env_file, profile, verbose):
    Logger.instance().set_type(TypeEnum.spinner)
    load_env(env_file)

    # Profiling can be done with https://github.com/nschloe/tuna
    #  `tuna visivo-profile.dmp`
    # If you need to profile the import time, you can use the following command:
    #  `python -X importtime -m visivo.command_line compile 2> import.log`
    #  `tuna import.log`
    if profile:
        import cProfile
        import atexit

        Logger.instance().info("Profiling...")
        pr = cProfile.Profile()
        pr.enable()

        def exit():
            pr.disable()
            Logger.instance().info("Profiling completed")
            pr.dump_stats("visivo-profile.dmp")

        atexit.register(exit)


def load_env(env_file):
    if os.path.isfile(env_file):
        Logger.instance().debug(f"Loading env file: {env_file}")
        load_dotenv(env_file)


def print_issue_url():
    import traceback
    import urllib.parse

    stack_trace = "".join(traceback.format_exc())
    command = " ".join(sys.argv)
    issue_body = f"Command: {command}\n\nStack Trace:\n```\n{stack_trace}\n```"
    encoded_body = urllib.parse.quote(issue_body)
    issue_url = f"https://github.com/visivo-io/visivo/issues/new?body={encoded_body}"

    Logger.instance().error(
        f"\x1b]8;;{issue_url}\x1b\\Click here to report this issue\x1b]8;;\x1b\\"
    )


def _sanitize_command_args(argv):
    """
    Sanitize command arguments to remove sensitive information.

    Args:
        argv: sys.argv list

    Returns:
        tuple: (command_name, command_args)
    """
    command_name = None
    command_args = []

    if len(argv) > 1:
        command_name = argv[1]
        # Handle special cases like --version, --help
        if command_name.startswith("-"):
            command_name = "help"

        # Capture command arguments (sanitized)
        if len(argv) > 2:
            skip_next = False
            for i, arg in enumerate(argv[2:], 2):
                if skip_next:
                    command_args.append("<redacted>")
                    skip_next = False
                    continue

                # Check if this is a sensitive flag
                if arg in ["--token", "--password", "--key", "--api-key", "--secret"]:
                    command_args.append(arg)
                    skip_next = True  # Skip the next value
                # Skip file paths and values that might be sensitive
                elif arg.startswith("/") or arg.startswith("~") or "\\" in arg:
                    command_args.append("<path>")
                elif not arg.startswith("-"):
                    # This might be a value for a previous flag
                    command_args.append("<value>")
                else:
                    # Keep flags and options
                    command_args.append(arg)

    return command_name, command_args


def _track_command_execution(
    telemetry_client, command_name, command_args, execution_time, success, error_type=None
):
    """
    Track command execution telemetry.

    Args:
        telemetry_client: The telemetry client instance
        command_name: Name of the command executed
        command_args: Sanitized command arguments
        execution_time: Execution time in seconds
        success: Whether the command succeeded
        error_type: Type of error if command failed
    """
    if not telemetry_client or not command_name:
        return

    # Get any additional metrics from context
    context_data = get_telemetry_context().get_all()

    event = CLIEvent.create(
        command=command_name,
        command_args=command_args,
        duration_ms=int(execution_time * 1000),
        success=success,
        error_type=error_type,
        job_count=context_data.get("job_count") if success else None,
        object_counts=context_data.get("object_counts") if success else None,
        project_hash=context_data.get("project_hash") if success else None,
    )
    telemetry_client.track(event)


def safe_visivo():
    # Clear telemetry context for fresh start
    get_telemetry_context().clear()

    # Initialize telemetry client if enabled
    telemetry_enabled = is_telemetry_enabled()
    telemetry_client = TelemetryClient(enabled=telemetry_enabled) if telemetry_enabled else None

    # Track command execution
    command_name, command_args = _sanitize_command_args(sys.argv)
    error_type = None
    success = False

    try:

        visivo(standalone_mode=False)
        execution_time = round(time() - start_time, 2)
        Logger.instance().info(f"Visivo execution time: {execution_time}s")
        success = True

        # Track successful command
        _track_command_execution(telemetry_client, command_name, command_args, execution_time, True)

    except (ValidationError, LineValidationError) as e:
        error_type = type(e).__name__
        Logger.instance().error(str(e))
        sys.exit(1)
    except click.ClickException as e:
        # A ClickException is already a clean, user-facing error — e.g. a YAML
        # syntax error from load_yaml_file carrying file:line + the problem.
        # Route it like our other user errors, NOT through the generic
        # "unexpected error / report this issue" path below, whose issue URL
        # percent-encodes the ENTIRE stack trace into a giant OSC-8 terminal
        # hyperlink (smoke-test bug #14).
        error_type = type(e).__name__
        Logger.instance().error(e.format_message())
        sys.exit(1)
    except Exception as e:
        error_type = type(e).__name__
        if "STACKTRACE" in os.environ and os.environ["STACKTRACE"] == "true":
            raise e
        Logger.instance().error("An unexpected error has occurred")
        Logger.instance().error(str(e))
        Logger.instance().error(
            "To print more error information add the 'STACKTRACE=true' environment variable."
        )
        print_issue_url()
        sys.exit(1)
    finally:
        # Track failed command if an error occurred
        if not success:
            execution_time = round(time() - start_time, 2)
            _track_command_execution(
                telemetry_client, command_name, command_args, execution_time, False, error_type
            )

        # Ensure telemetry is flushed before exit
        if telemetry_client:
            telemetry_client.flush()
            telemetry_client.shutdown()


if __name__ == "__main__":
    safe_visivo()
