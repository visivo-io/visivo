"""Read/write the per-user config at ``~/.visivo/config.yml``.

It holds ``telemetry_enabled`` (read by ``visivo.telemetry.config``). This is a
file people edit themselves, so a write round-trips through ruamel in ``rt``
mode to preserve their comments, key order, and any keys we don't know about.

Reads never raise. A missing directory, a missing file, or YAML someone broke
mid-edit all fall back to defaults — a preference lookup must never be the thing
that stops ``visivo serve`` from starting.
"""

import os
from pathlib import Path

import ruamel.yaml

from visivo.logger.logger import Logger


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
