import sys as _sys
from time import time

start_time = time()
from visivo.commands.options import verbose
from visivo.logger.logger import Logger, TypeEnum

# Group options that consume the next token; every other `visivo` group option
# is a flag. The attached forms (`--env-file=x`, `-e.env`) need no entry.
_GROUP_VALUE_OPTIONS = frozenset({"-e", "--env-file"})


def _subcommand(argv):
    """The subcommand name, however many group options precede it.

    ``argv[1]`` is not enough: the group accepts options first, so
    `visivo -e .env schema` and `visivo --verbose schema` are both `schema`.
    """
    skip = False
    for token in argv[1:]:
        if skip:
            skip = False
            continue
        if token.startswith("-"):
            skip = token in _GROUP_VALUE_OPTIONS
            continue
        return token
    return None


# An agent-facing invocation puts a JSON document on stdout: no banner, no
# trailing timing line, and no Halo spinner (Halo writes straight to stdout).
SUBCOMMAND = _subcommand(_sys.argv)
JSON_INVOCATION = "--json" in _sys.argv[1:]
SCHEMA_INVOCATION = SUBCOMMAND == "schema"
AGENT_INVOCATION = JSON_INVOCATION or SCHEMA_INVOCATION

# "-h" is NOT a help alias in this CLI — it is the short flag for --host on
# deploy/archive/authorize — so only the long forms are quiet. A bare `visivo`
# prints usage, which is help-shaped output too.
QUIET_INVOCATION = (
    len(_sys.argv) <= 1 or bool({"--version", "--help"} & set(_sys.argv[1:])) or AGENT_INVOCATION
)

if not QUIET_INVOCATION:
    Logger.instance().info("Starting Visivo...")
import click
import os
from dotenv import load_dotenv
from pydantic import ValidationError
import sys

from visivo.parsers.line_validation_error import LineValidationError
from visivo.telemetry import TelemetryClient, is_telemetry_enabled, get_telemetry_context
from visivo.telemetry.events import CLIEvent

from visivo.commands.dbt import dbt
from visivo.commands.deploy import deploy
from visivo.commands.serve import serve
from visivo.commands.run import run
from visivo.commands.dist import dist
from visivo.commands.compile import compile
from visivo.commands.init import init
from visivo.commands.create import create
from visivo.commands.test import test
from visivo.commands.aggregate import aggregate
from visivo.commands.archive import archive
from visivo.commands.authorize import authorize
from visivo.commands.list import list
from visivo.commands.migrate import migrate
from visivo.commands.schema import schema
from visivo.version import VISIVO_VERSION


@click.group()
@click.option(
    "-p",
    "--profile",
    is_flag=True,
    help="Profile execution with cProfile and write visivo-profile.dmp on exit.",
)
@click.option("-e", "--env-file", default=".env", help="Env file to load before running.")
@click.version_option(version=VISIVO_VERSION)
@verbose
def visivo(env_file, profile, verbose):
    Logger.instance().set_type(TypeEnum.console if AGENT_INVOCATION else TypeEnum.spinner)
    load_env(env_file)

    # Profiling can be done with https://github.com/nschloe/tuna
    #  `tuna visivo-profile.dmp`
    # If you need to profile the import time, you can use the following command:
    #  `python -X importtime -m visivo.command_line compile 2> import.log`
    #  `tuna import.log`
    if profile:
        import cProfile
        import atexit

        def log_off_stdout(message):
            if AGENT_INVOCATION:
                click.echo(message, err=True)
            else:
                Logger.instance().info(message)

        log_off_stdout("Profiling...")
        pr = cProfile.Profile()
        pr.enable()

        def exit():
            pr.disable()
            log_off_stdout("Profiling completed")
            pr.dump_stats("visivo-profile.dmp")

        atexit.register(exit)


visivo.add_command(init)
visivo.add_command(dbt)
visivo.add_command(compile)
visivo.add_command(run)
visivo.add_command(serve)
visivo.add_command(deploy)
visivo.add_command(dist)
visivo.add_command(test)
visivo.add_command(aggregate)
visivo.add_command(archive)
visivo.add_command(authorize)
visivo.add_command(create)
visivo.add_command(list)
visivo.add_command(migrate)
visivo.add_command(schema)


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


def _report_error_for_agent(command_name, exception, message) -> bool:
    """
    Report a failure that escaped the command body -- a bad option value, an
    error raised while click was still parsing -- without putting it on stdout.
    `--json` gets the structured envelope there instead; `visivo schema` gets the
    human message on stderr, so `visivo schema > core.json` leaves an empty file.
    Returns True when it printed.
    """
    if JSON_INVOCATION:
        try:
            from visivo.commands.json_output import emit, envelope, errors_from_exception

            emit(
                envelope(
                    # Not command_name: the telemetry sanitizer reads argv[1] and
                    # reports "help" for anything starting with a dash.
                    command=SUBCOMMAND or command_name or "visivo",
                    success=False,
                    errors=errors_from_exception(exception),
                )
            )
            return True
        except Exception:
            return False

    if SCHEMA_INVOCATION:
        click.echo(message, err=True)
        return True

    return False


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
        if not QUIET_INVOCATION:
            Logger.instance().info(f"Visivo execution time: {execution_time}s")
        success = True

        # Track successful command
        _track_command_execution(telemetry_client, command_name, command_args, execution_time, True)

    except (ValidationError, LineValidationError) as e:
        error_type = type(e).__name__
        if _report_error_for_agent(command_name, e, str(e)):
            sys.exit(1)
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
        if _report_error_for_agent(command_name, e, e.format_message()):
            sys.exit(1)
        Logger.instance().error(e.format_message())
        sys.exit(1)
    except Exception as e:
        error_type = type(e).__name__
        if "STACKTRACE" in os.environ and os.environ["STACKTRACE"] == "true":
            raise e
        if _report_error_for_agent(command_name, e, f"An unexpected error has occurred: {e}"):
            sys.exit(1)
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
