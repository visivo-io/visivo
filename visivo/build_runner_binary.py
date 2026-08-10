"""Nuitka build of the run-only runner binary (VIS-1192 / VIS-1193).

Compiles ``runner_binary.py`` (a ``visivo run``-only CLI) with Nuitka
``--standalone``. Unlike the full-CLI build this needs NO ``--include-module``
for ``visivo.commands`` (the path that crashes Nuitka 4.1.3) — ``run`` is
followed from the entry's import — and no viewer data (``run`` computes data, it
doesn't serve). Third-party dynamic packages are still ``--include-package``'d,
exactly as the working VIS-1190 spike did.

Output: ``dist-runner/runner_binary.dist/visivo-run`` (+ its ``visivo/`` package
dir and shared libs). The binary name ``visivo-run`` doesn't collide with the
compiled ``visivo/`` package dir, so no launcher is needed.

Requires Nuitka >= 4.1 and **Python 3.13** (``pip install 'nuitka>=4.1'``). Do
NOT build on 3.14: Nuitka 4.1.3 only experimentally supports it and crashes in
its distribution/DLL scan (``locateModule`` returns a None path →
``checkDistributionMetadataRecord``). The runner image is ``python:3.13-slim``,
so this matches the real target. Verified on 3.13 with a wheel-installed visivo.

    # from a 3.13 env with a wheel-installed visivo:
    python visivo/build_runner_binary.py
"""

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent.absolute()  # .../visivo
OUT = HERE.parent / "dist-runner"


def build():
    args = [
        sys.executable,
        "-m",
        "nuitka",
        "--standalone",
        "--assume-yes-for-downloads",
        "--static-libpython=no",
        f"--output-dir={OUT}",
        "--output-filename=visivo-run",
        "--remove-output",
        # Dynamic packages `run`'s graph loads (sqlglot dialects, the snowflake
        # driver, the Rust validators). No socketio/engineio/flask — those are
        # serve-only, which a run binary never reaches.
        "--include-package=sqlglot",
        "--include-package=snowflake.connector",
        "--include-package=jsonschema_rs",
        "--include-package-data=jsonschema_rs",
        # `visivo run` computes data; it never renders figures. Nothing on the
        # run path imports plotly, matplotlib, or PIL — trace props validate
        # against the static visivo/schema JSON below via jsonschema_rs, not
        # plotly's runtime validators. matplotlib was an unused direct dep (now
        # removed from pyproject) whose C-compilation overran the CI build
        # timeout; plotly was never installed (the old --include-package-data
        # was a dead no-op). These stay as guards so a transitive extra
        # (e.g. bigquery[matplotlib]) or a lazy pandas.plot can't drag the
        # render stack — and its slow C-compile — back into the binary.
        "--nofollow-import-to=plotly",
        "--nofollow-import-to=matplotlib",
        "--nofollow-import-to=PIL",
        # Schema only — no viewers (run doesn't serve the SPA).
        f"--include-data-dir={HERE / 'schema'}=visivo/schema",
        str(HERE / "runner_binary.py"),
    ]
    subprocess.run(args, check=True)
    print(f"\nBuilt {OUT / 'runner_binary.dist' / 'visivo-run'}")


if __name__ == "__main__":
    build()
