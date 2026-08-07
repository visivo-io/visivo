"""Nuitka build of the Visivo CLI — spike for VIS-1190.

Parallel to build.py (PyInstaller). Standalone mode (a dist folder, no runtime
extraction) is the fair comparison to the current PyInstaller `--onedir` and the
fast-start option. Mirrors build.py's directives:

  PyInstaller                          Nuitka
  --onedir                             --standalone
  --collect-submodules X               --include-package=X
  --collect-all jsonschema_rs          --include-package[-data]=jsonschema_rs
  --collect-all pydantic_core          --enable-plugin=pydantic
  --add-data visivo/schema/*:...       --include-data-dir=.../schema=visivo/schema
  --add-data visivo/viewers/*:...      --include-data-dir=.../viewers=visivo/viewers

Data is resolved at runtime via importlib.resources.files("visivo") (utils.py),
which Nuitka supports — so the data must land under the visivo package dir.

Requires Nuitka >= 4.1 (the repo's pinned 2.x fails: no such --enable-plugin,
and pyenv's --enable-shared trips static-libpython detection). Bumping the pin
without disturbing other deps is deferred to VIS-1192 — for now:
    poetry run pip install -U 'nuitka>=4.1'

Run:  poetry run python visivo/build_nuitka.py
Out:  dist-nuitka/command_line.dist/visivo-app
"""

import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent.absolute()  # .../visivo
REPO = HERE.parent  # repo root
OUTPUT_DIR = REPO / "dist-nuitka"


def build():
    args = [
        sys.executable,
        "-m",
        "nuitka",
        "--standalone",
        "--assume-yes-for-downloads",
        # pyenv builds CPython with --enable-shared and ships no static
        # libpython, which Nuitka prefers. Link the shared one instead (Nuitka
        # bundles it into the standalone dist). CI's python may differ.
        "--static-libpython=no",
        f"--output-dir={OUTPUT_DIR}",
        # NB: the binary CANNOT be named 'visivo' in --standalone: Nuitka compiles
        # the 'visivo' package into <dist>/visivo/ (where importlib.resources
        # looks), and an executable named 'visivo' collides with that dir.
        # PyInstaller avoids this by nesting everything under _internal/. Build
        # under a distinct name; presenting the final `visivo` command (symlink
        # or wrapper) is a packaging step for VIS-1192.
        "--output-filename=visivo-app",
        "--remove-output",
        # NB: pydantic_core (the pyo3 wheel PyInstaller --collect-all'd) needs no
        # plugin flag — Nuitka 2.8 handles it automatically via its built-in
        # package config (there is no --enable-plugin=pydantic).
        # Dynamically-imported packages Nuitka's import-following can miss — the
        # same set build.py had to --collect-submodules.
        "--include-package=engineio",
        "--include-package=socketio",
        "--include-package=flask_socketio",
        "--include-package=sqlglot",
        "--include-package=snowflake.connector",
        "--include-package=jsonschema_rs",
        # Native/data-bearing packages: force their non-.py payload in.
        # jsonschema_rs is a Rust .so; plotly ships JSON validators/templates.
        "--include-package-data=jsonschema_rs",
        "--include-package-data=plotly",
        # Data files build.py shipped, placed under the visivo package dir so
        # importlib.resources.files("visivo") finds them.
        f"--include-data-dir={HERE / 'schema'}=visivo/schema",
        f"--include-data-dir={HERE / 'viewers'}=visivo/viewers",
        str(HERE / "command_line.py"),
    ]
    print("Nuitka:", " ".join(args), flush=True)
    started = time.time()
    subprocess.run(args, check=True)
    print(f"\nNuitka build finished in {time.time() - started:.0f}s", flush=True)
    print(f"Binary: {OUTPUT_DIR / 'command_line.dist' / 'visivo'}", flush=True)


if __name__ == "__main__":
    build()
