import PyInstaller.__main__
from pathlib import Path
import sys

HERE = Path(__file__).parent.absolute()
path_to_main = str(HERE / "command_line.py")


def build():
    """Build the Visivo executable using PyInstaller.

    Use --debug flag to enable debug mode for troubleshooting missing modules:
        poetry run build --debug
    """
    debug_mode = "--debug" in sys.argv

    args = [
        path_to_main,
        "--clean",
        "--onedir",
        "--noconfirm",
        "--collect-submodules",
        "engineio",
        "--collect-submodules",
        "socketio",
        "--collect-submodules",
        "flask_socketio",
        "--collect-submodules",
        "sqlglot",
        "--collect-submodules",
        "snowflake.connector",
        # pyo3 abi3 wheels: collect-all forces PyInstaller to take the .so and
        # .py from a single matched install. Without this it can merge stale
        # .so files from other site-packages on the build runner — see v2.0.2
        # where `visivo init` crashed with `cannot import name 'EmailOptions'
        # from 'jsonschema_rs.jsonschema_rs'` because three different versions
        # of the .so ended up in _internal/jsonschema_rs/.
        "--collect-all",
        "jsonschema_rs",
        "--collect-all",
        "pydantic_core",
        "-n",
        "visivo",
        "--add-data",
        "visivo/schema/*.json:visivo/schema",
        "--add-data",
        "visivo/viewers/*:visivo/viewers",
    ]

    if debug_mode:
        args.extend(["--debug=imports", "--log-level=DEBUG"])
        print(
            "Building in DEBUG mode - check build/visivo/warn-visivo.txt and xref-visivo.html for missing modules"
        )

    PyInstaller.__main__.run(args)
