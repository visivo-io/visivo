"""A cloud credential is not something to print (VIS-1377).

The device callback used to log `Received token via callback: <token>` — in
`visivo authorize`'s terminal and in `visivo serve`'s. A terminal scrolls back
and a log file is read by whoever can read files, and this token outlives the
session that printed it.

Read from source rather than by capturing output: the point is that no code
path can do it, and a test that only exercises the paths it thought of would
pass while a new one leaked.
"""

from pathlib import Path

import pytest

SUSPECT_FILES = [
    "visivo/tokens/server.py",
    "visivo/server/views/auth_views.py",
    "visivo/commands/authorize.py",
    "visivo/tokens/token_functions.py",
]


@pytest.mark.parametrize("path", SUSPECT_FILES)
def test_nothing_logs_a_token_value(path):
    source = Path(path).read_text()

    for number, line in enumerate(source.splitlines(), start=1):
        stripped = line.strip()
        if stripped.startswith("#"):
            continue
        if "Logger" not in stripped and "print(" not in stripped:
            continue
        # The variables that hold one. `host` and messages ABOUT tokens are
        # fine — the value is what must not appear.
        for name in ("+ token", "{token}", "{existing_token}", "{key}", "token.key"):
            assert name not in stripped, f"{path}:{number} logs a token value: {stripped}"
