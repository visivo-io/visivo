"""Keep standard output clean for a command that speaks a protocol on it.

The MCP stdio transport allows nothing on stdout but protocol messages, and
the CLI, its libraries and its subprocesses all print there. ``claim_stdout``
moves file descriptor 1 to stderr and hands back the real stdout.
"""

import os
import sys

_claimed = None


def subcommand(argv):
    """The command name in ``argv``, skipping the group's own options."""
    skip = False
    for arg in argv:
        if skip:
            skip = False
        elif arg in ("-e", "--env-file"):
            skip = True
        elif not arg.startswith("-"):
            return arg
    return None


def claim_stdout():
    global _claimed
    if _claimed is None:
        sys.stdout.flush()
        _claimed = os.fdopen(os.dup(1), "w", encoding="utf-8", newline="\n")
        os.dup2(2, 1)
        sys.stdout = sys.stderr
    return _claimed
