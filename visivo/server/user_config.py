"""Read/write the per-user config at ``~/.visivo/config.yml``.

That file already held ``telemetry_enabled`` (read by ``visivo.telemetry.config``)
but nothing ever wrote it — users hand-edited it. Now that ``run_trigger`` is
settable from the editor we need a writer, and a writer has to be careful: this
is a file people edit themselves, so it round-trips through ruamel in ``rt`` mode
to preserve their comments, key order, and any keys we don't know about.

Reads never raise. A missing directory, a missing file, or YAML someone broke
mid-edit all fall back to defaults — a preference lookup must never be the thing
that stops ``visivo serve`` from starting.
"""

import os
from pathlib import Path

import ruamel.yaml

from visivo.logger.logger import Logger

# Local serve runs on your own machine, where a run is a sub-second in-process
# rebuild — so edits rebuilding as you type is the behavior that fits. (Cloud
# defaults to "manual": there a run claims a sandboxed pod.) The viewer takes
# whichever value the server reports, which is how it stays free of any
# local-vs-cloud branching.
AUTOMATIC = "automatic"
MANUAL = "manual"
RUN_TRIGGERS = (AUTOMATIC, MANUAL)
DEFAULT_RUN_TRIGGER = AUTOMATIC


def user_config_path():
    """``~/.visivo/config.yml`` — one definition, shared with telemetry."""
    return Path.home() / ".visivo" / "config.yml"


def _yaml():
    yaml = ruamel.yaml.YAML(typ="rt")
    yaml.preserve_quotes = True
    return yaml


def read_user_config():
    """The parsed config, or ``{}`` when it's absent or unreadable."""
    path = user_config_path()
    if not path.exists():
        return {}
    try:
        with open(path, "r") as file:
            return _yaml().load(file) or {}
    except Exception as e:
        Logger.instance().error(f"Could not read {path}: {e}")
        return {}


def write_user_config(**values):
    """Merge ``values`` into the config, preserving everything already there.

    Returns True on success. A failure is logged and reported rather than raised:
    the caller is an API request whose job is to record a preference, and an
    unwritable home directory shouldn't 500 the editor.
    """
    path = user_config_path()
    config = read_user_config()
    config.update(values)
    try:
        os.makedirs(path.parent, exist_ok=True)
        with open(path, "w") as file:
            _yaml().dump(config, file)
        return True
    except Exception as e:
        Logger.instance().error(f"Could not write {path}: {e}")
        return False


def get_run_trigger():
    """``"automatic"`` or ``"manual"`` — whether saving a resource should launch
    a run, or stage the change and wait for the Run button."""
    value = read_user_config().get("run_trigger")
    return value if value in RUN_TRIGGERS else DEFAULT_RUN_TRIGGER


def set_run_trigger(value):
    """Persist the run trigger. Returns True if it was valid and written."""
    if value not in RUN_TRIGGERS:
        return False
    return write_user_config(run_trigger=value)
