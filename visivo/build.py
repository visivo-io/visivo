import PyInstaller.__main__
from pathlib import Path

HERE = Path(__file__).parent.absolute()
path_to_main = str(HERE / "command_line.py")

import os
import shutil

# Create the target directory structure
os.makedirs(HERE / "playwright_browsers", exist_ok=True)

# Copy the Playwright browser files
shutil.copytree(
    Path(".venv/lib/python3.12/site-packages/playwright/driver/package/.local-browsers"),
    HERE / "playwright_browsers",
    dirs_exist_ok=True,
    symlinks=False,
)

# Remove the existing Playwright browser files if they exist
playwright_browsers_path = Path(
    ".venv/lib/python3.12/site-packages/playwright/driver/package/.local-browsers"
)
if playwright_browsers_path.exists():
    shutil.rmtree(playwright_browsers_path)


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
        ]
    )
