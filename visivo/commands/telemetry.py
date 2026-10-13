"""``visivo telemetry off|on|status`` — the per-machine telemetry switch.

Anonymous usage telemetry is on by default. The people who should turn it off
are the ones whose usage isn't product signal: Visivo's own developers, whose
daily ``visivo serve`` sessions otherwise show up in the product analytics as
customers. ``off`` records ``telemetry_enabled: false`` in ``~/.visivo/config.yml``
(the same file ``visivo.telemetry.config`` already reads), so one command
after install silences every later run on that machine — CLI events, the
local server's API-request events, and the viewer it serves.

To push real events through the pipeline from an opted-out machine (verifying
a tracking change end to end), set ``VISIVO_TELEMETRY_FORCE=true`` for that
one invocation; it overrides every opt-out.
"""

import click

from visivo.logger.logger import Logger
from visivo.server.user_config import read_user_config, user_config_path, write_user_config
from visivo.telemetry.config import telemetry_decision


@click.group()
def telemetry():
    """Turn anonymous usage telemetry off or on for this machine."""


def _echo(message):
    spinner = Logger.instance().spinner
    if spinner:
        spinner.stop()
    click.echo(message)


@telemetry.command()
def off():
    """Disable telemetry on this machine (persists in ~/.visivo/config.yml)."""
    if not write_user_config(telemetry_enabled=False):
        raise click.ClickException(f"Could not write {user_config_path()}")
    _echo(
        f"Telemetry is off for this machine ({user_config_path()}).\n"
        "Set VISIVO_TELEMETRY_FORCE=true on a single command to send events anyway."
    )


@telemetry.command()
def on():
    """Re-enable telemetry on this machine."""
    if not write_user_config(telemetry_enabled=True):
        raise click.ClickException(f"Could not write {user_config_path()}")
    _echo(f"Telemetry is on for this machine ({user_config_path()}).")


@telemetry.command()
def status():
    """Show whether telemetry is enabled here, and what decided it."""
    enabled, reason = telemetry_decision()
    machine_setting = read_user_config().get("telemetry_enabled")
    state = "on" if enabled else "off"
    _echo(f"Telemetry is {state}: {reason}.")
    if machine_setting is not None:
        _echo(
            f"Machine config ({user_config_path()}): "
            f"telemetry_enabled: {str(machine_setting).lower()}"
        )
    if enabled:
        _echo("Turn it off for this machine with: visivo telemetry off")
    elif reason != "VISIVO_TELEMETRY_FORCE is set":
        _echo("Send events anyway on one command with: VISIVO_TELEMETRY_FORCE=true visivo ...")
