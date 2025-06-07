import PyInstaller.__main__
from pathlib import Path

HERE = Path(__file__).parent.absolute()
path_to_main = str(HERE / "command_line.py")


def build():
    PyInstaller.__main__.run(
        [
            path_to_main,
            "--onedir",
        ]
    )
