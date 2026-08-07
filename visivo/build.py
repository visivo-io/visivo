"""Build the Visivo executable with Nuitka (VIS-1192, replaces PyInstaller).

!!! BLOCKED (2026-08-07): Nuitka 4.1.3 crashes when the lazily-imported
``visivo.commands`` modules are included explicitly (``--include-module`` /
``--include-package``) — a Nuitka bug in DLL detection
(``getDistributionFromModuleName`` -> ``checkDistributionMetadataRecord``,
``record[0]`` is None). Without that inclusion the build is clean but a
lazy-loaded (VIS-1191) binary ships with no subcommands, so the two can't be
combined on Nuitka 4.1.3. The plain ``--standalone`` build itself works and
was smoke-tested (VIS-1190). Resolution: a newer Nuitka or an upstream fix.
Meanwhile lazy-load already delivers the startup win on the existing
PyInstaller build (verified), so shipping VIS-1191 alone is the pragmatic path.



Nuitka ``--standalone`` compiles to a fast-starting dist folder (no runtime
extraction, unlike onefile). Two things are load-bearing:

* ``--include-package=visivo.commands`` — the CLI loads subcommands lazily
  (``command_line.LazyGroup`` via ``importlib``), which import analysis can't
  see, so without this the binary ships with no commands (mirrors the old
  ``--collect-submodules`` for the same reason).
* the binary is named ``visivo-app``, not ``visivo`` — Nuitka compiles the
  ``visivo`` package into ``<dist>/visivo/`` (where
  ``importlib.resources.files("visivo")`` resolves the bundled schema/viewers),
  and an executable named ``visivo`` would collide with that directory.

So the output is assembled with a small launcher so the command is still
``visivo`` and ``install.sh`` is unchanged::

    dist/visivo/
      visivo        # POSIX launcher  -> app/visivo-app
      visivo.cmd    # Windows launcher -> app\\visivo-app.exe
      app/          # the Nuitka command_line.dist (visivo-app + visivo/ + libs)

Requires Nuitka >= 4.1 (CI installs it with ``pip install 'nuitka>=4.1'`` — it
is intentionally not a poetry dep, to avoid the lockfile re-resolving unrelated
packages). Build on Python 3.13; 3.14 is only experimental in Nuitka 4.1.

    poetry run build            # -> dist/visivo/
"""

import shutil
import stat
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent.absolute()  # .../visivo
REPO = HERE.parent
BUILD_DIR = REPO / "build-nuitka"  # intermediate Nuitka output
DIST = REPO / "dist" / "visivo"  # final layout (same path the old build used)

_POSIX_LAUNCHER = """#!/bin/sh
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/app/visivo-app" "$@"
"""
_WINDOWS_LAUNCHER = '@echo off\r\n"%~dp0app\\visivo-app.exe" %*\r\n'


def _nuitka_args(debug_mode):
    args = [
        sys.executable,
        "-m",
        "nuitka",
        "--standalone",
        "--assume-yes-for-downloads",
        # pyenv/shared-libpython builds have no static libpython; link the shared
        # one (Nuitka bundles it). Harmless on a static build.
        "--static-libpython=no",
        f"--output-dir={BUILD_DIR}",
        "--output-filename=visivo-app",
        "--remove-output",
        # Dynamically-imported packages the old build --collect-submodules'd.
        "--include-package=engineio",
        "--include-package=socketio",
        "--include-package=flask_socketio",
        "--include-package=sqlglot",
        "--include-package=snowflake.connector",
        "--include-package=jsonschema_rs",
        # Native / data-bearing packages: jsonschema_rs is a Rust .so; plotly
        # ships JSON validators. (pydantic_core is handled automatically.)
        "--include-package-data=jsonschema_rs",
        "--include-package-data=plotly",
        # Data files, under the visivo package dir so importlib.resources finds
        # them (utils.py: resources.files("visivo") / "viewers").
        f"--include-data-dir={HERE / 'schema'}=visivo/schema",
        f"--include-data-dir={HERE / 'viewers'}=visivo/viewers",
    ]
    # Subcommands load lazily (command_line.LazyGroup uses importlib), so import
    # analysis can't see them — include each explicitly or the binary has no
    # commands. Listing the exact modules the CLI loads (rather than
    # --include-package=visivo.commands) matches the working eager import set and
    # sidesteps a Nuitka 4.1 crash in its package-wide distribution-metadata /
    # DLL scan. KEEP IN SYNC with command_line.LazyGroup.lazy_subcommands.
    command_modules = (
        "init", "dbt", "compile", "run", "serve", "deploy", "dist", "test",
        "aggregate", "archive", "authorize", "create", "list", "migrate",
    )
    args += [f"--include-module=visivo.commands.{name}" for name in command_modules]
    if debug_mode:
        args += ["--debug", "--no-progressbar"]
    args.append(str(HERE / "command_line.py"))
    return args


def build():
    """Build the Visivo executable with Nuitka. ``--debug`` for verbose output."""
    debug_mode = "--debug" in sys.argv

    subprocess.run(_nuitka_args(debug_mode), check=True)

    # Assemble dist/visivo/ = launcher(s) + app/.
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)
    shutil.move(str(BUILD_DIR / "command_line.dist"), str(DIST / "app"))

    launcher = DIST / "visivo"
    launcher.write_text(_POSIX_LAUNCHER)
    launcher.chmod(
        launcher.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH
    )
    (DIST / "visivo.cmd").write_text(_WINDOWS_LAUNCHER)

    print(f"\nBuilt {DIST} (launcher -> app/visivo-app)")


if __name__ == "__main__":
    build()
