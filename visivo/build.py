import PyInstaller.__main__
from pathlib import Path

HERE = Path(__file__).parent.absolute()
path_to_main = str(HERE / "command_line.py")


def build():
    PyInstaller.__main__.run(
        [
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
            "-n",
            "visivo",
            "--add-data",
            "visivo/schema/*.json:visivo/schema",
            "--add-data",
            "visivo/templates/queries/*:visivo/templates/queries",
            "--add-data",
            "visivo/templates/charts/*:visivo/templates/charts",
            "--add-data",
            "visivo/viewers/*:visivo/viewers",
        ]
    )
