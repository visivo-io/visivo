"""The agent package must be importable on its own.

`visivo serve` imports the views first, which hid a cycle for as long as the
agent only ever ran in-process. The runner does not: `_op_agent_turn` imports
`visivo.agent.loop` directly, and got a half-built module —

    ImportError: cannot import name 'build_agent' from partially initialized
    module 'visivo.agent.loop'

— which the runner reported as "this image has no agent support", sending
whoever read it off to rebuild an image that was already correct.

These run in a FRESH interpreter on purpose. By the time a normal test
executes, pytest has already imported half the project in some order that
happens to work, so an in-process assertion would pass against a cycle that
still breaks the runner.
"""

import subprocess
import sys

import pytest

# The order that matters is "agent first, nothing else". Each of these is an
# entry point something real uses: the runner imports `loop`, the Flask app
# imports `views`, and `runner` is what the view reaches for.
ENTRY_POINTS = [
    "from visivo.agent.loop import build_agent, usage_limits",
    "from visivo.agent.runner import start",
    "from visivo.agent.tools import TOOLS, call",
    "from visivo.agent.remote import build",
    "import visivo.server.views",
]


def _import_in_a_fresh_interpreter(statement):
    return subprocess.run(
        [sys.executable, "-c", statement],
        capture_output=True,
        text=True,
        timeout=120,
    )


@pytest.mark.parametrize("statement", ENTRY_POINTS)
def test_it_imports_first_without_a_cycle(statement):
    result = _import_in_a_fresh_interpreter(statement)

    assert (
        result.returncode == 0
    ), f"`{statement}` fails as the first import:\n{result.stderr[-2000:]}"


def test_the_runners_exact_import_works():
    """Verbatim from core's runner/entrypoint.py::_op_agent_turn. This is the
    one that was broken in production."""
    result = _import_in_a_fresh_interpreter(
        "from visivo.agent.actions import log as action_log\n"
        "from visivo.agent.loop import build_agent, usage_limits\n"
        "from visivo.agent.remote import build as build_remote_project\n"
    )

    assert result.returncode == 0, result.stderr[-2000:]


def test_a_service_does_not_import_a_view():
    """The edge that closed the loop, pinned so it cannot come back.

    Importing anything under `visivo.server.views` runs that package's
    `__init__`, which imports every view — several of which import the agent.
    So a service importing a view drags the whole agent package into any
    service import, whichever leaf happens to do it.
    """
    from pathlib import Path

    services = Path(__file__).parents[2] / "visivo" / "server" / "services"
    offenders = [
        path.name
        for path in services.glob("*.py")
        if "from visivo.server.views" in path.read_text()
        or "import visivo.server.views" in path.read_text()
    ]

    assert offenders == [], (
        "these services import a view module, which re-opens the import cycle: " f"{offenders}"
    )
