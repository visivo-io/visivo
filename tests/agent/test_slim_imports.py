"""The tool registry must not drag the warehouse stack in with it (VIS-1663).

Core serves MCP by importing `visivo.agent.tools` in a Django web pod. Those
pods never run a query, so duckdb, polars and pyarrow there would be tens of
megabytes of import for code that cannot execute -- which is why core carried no
visivo dependency at all until this was true.

"Slim" is a property of where the imports sit, not of a package boundary, so
only a test keeps it. Both leaks this caught at the start were invisible from
the import statement alone: `_write_handler` imported `run_views` above the
guard meant to skip it, and two source models imported a package they never
used.

These run in a FRESH interpreter on purpose, the same reason
`test_import_order.py` does: by the time a normal test executes, pytest has
imported half the project and `sys.modules` no longer says anything.
"""

import subprocess
import sys

import pytest

# Each of these is either unusable in a web pod or large enough that carrying it
# there is the thing this test exists to prevent. The data tools that genuinely
# need them run in the runner, which installs visivo in full.
FORBIDDEN = ["flask", "duckdb", "polars", "pyarrow", "tornado", "watchdog"]

# A manager, a validate and a write -- the path core actually serves. The write
# matters most: it is where the leak was, and it is reached only by calling.
EXERCISE = '''
import sys

from visivo.agent.tools import TOOLS, call
from visivo.server.managers.markdown_manager import MarkdownManager


class SlimApp:
    """What core presents to the registry: managers, and no staged_manager."""

    def __init__(self):
        self.markdown_manager = MarkdownManager()
        self.output_dir = "/tmp"
        self.project = None


app = SlimApp()
assert call(app, "validate_markdown", {"config": {"name": "a", "content": "x"}})["valid"]
assert call(app, "write_markdown", {"config": {"name": "a", "content": "x"}})["status"] == "draft"
assert call(app, "list_markdowns", {})
# The theme is read on the way into several tools and used to reach a view,
# which is the other way Flask got in.
assert call(app, "get_theme", {}) == {}
assert call(app, "recommend_charts", {"metrics": [], "dimensions": []})["recommendations"]
# Accepted and ignored where one project is hosted, so one registry serves both.
assert call(app, "get_markdown", {"name": "a", "project_id": "ignored-here"})["name"] == "a"
assert len(TOOLS) > 0

loaded = {name.split(".")[0] for name in sys.modules}
print(",".join(sorted(loaded & set(%r))))
''' % (FORBIDDEN,)


def _run(statement):
    return subprocess.run(
        [sys.executable, "-c", statement],
        capture_output=True,
        text=True,
        timeout=180,
    )


def test_serving_a_write_loads_no_warehouse_package():
    result = _run(EXERCISE)

    assert result.returncode == 0, result.stderr[-2000:]
    leaked = [name for name in result.stdout.strip().split(",") if name]
    assert not leaked, (
        f"Importing the registry and serving a write loaded {leaked}. "
        "Move the import into the function that uses it rather than adding it "
        "to constraints/slim-requirements.txt."
    )


@pytest.mark.parametrize("package", FORBIDDEN)
def test_the_guard_would_notice(package):
    """The assertion above passes trivially if the probe stops reporting, so
    prove the reporting works by importing each package on purpose."""
    result = _run(f"import {package}\n" + EXERCISE)

    assert result.returncode == 0, result.stderr[-2000:]
    assert package in result.stdout
