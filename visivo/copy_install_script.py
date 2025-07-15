import shutil
from pathlib import Path


def copy_script():
    project_root = Path(__file__).parent.parent
    install_script_src = project_root / "install.sh"
    install_script_dest = project_root / "mkdocs" / "assets" / "install.sh"

    print(f"Copying {install_script_src} to {install_script_dest}")
    shutil.copy(install_script_src, install_script_dest)


if __name__ == "__main__":
    copy_script()
