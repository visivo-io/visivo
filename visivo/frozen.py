"""Whether this process is a packaged build rather than a pip install.

PyInstaller sets ``sys.frozen`` and unpacks to ``sys._MEIPASS``; Nuitka defines
``__compiled__`` in every module it compiles. None of the three exist in a pip
install.

This matters wherever code shells out to ``sys.executable``: in a packaged
build that path is the visivo binary, not a Python interpreter, so
``[sys.executable, "-m", <anything>]`` re-invokes the CLI with arguments it
does not understand instead of running the module.
"""

import sys

__all__ = ["is_frozen"]


def is_frozen() -> bool:
    return (
        bool(getattr(sys, "frozen", False))
        or hasattr(sys, "_MEIPASS")
        or "__compiled__" in globals()
    )
