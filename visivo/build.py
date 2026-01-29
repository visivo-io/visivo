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
