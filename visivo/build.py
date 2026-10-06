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
        # These read their own version out of installed metadata at IMPORT
        # time, and PyInstaller bundles modules but not dist-info — so without
        # this the binary dies with PackageNotFoundError before `visivo init`
        # or `visivo serve` can start. Invisible from the source tree; it only
        # reproduces in the built artifact.
        #   pydantic_ai/__init__.py  -> version("pydantic_ai_slim")
        #   genai_prices/__init__.py -> version("genai_prices")
        "--copy-metadata",
        "pydantic_ai_slim",
        "--copy-metadata",
        "genai_prices",
        # pydantic-ai resolves a provider from a model string ("anthropic:...")
        # at runtime, so nothing imports these by name for the analyser to
        # follow from.
        "--collect-submodules",
        "pydantic_ai",
        "--collect-submodules",
        "openai",
        "--collect-submodules",
        "anthropic",
        "-n",
        "visivo",
        "--add-data",
        "visivo/schema/*.json:visivo/schema",
        "--add-data",
        "visivo/viewers/*:visivo/viewers",
        # Skills are markdown read at runtime, so the analyser has no import to
        # follow and would ship a binary whose agent silently knows less than
        # the source tree's.
        "--add-data",
        "visivo/agent/skills/*.md:visivo/agent/skills",
    ]

    if debug_mode:
        args.extend(["--debug=imports", "--log-level=DEBUG"])
        print(
            "Building in DEBUG mode - check build/visivo/warn-visivo.txt and xref-visivo.html for missing modules"
        )

    PyInstaller.__main__.run(args)
