"""The served project's root, so a relative data-file path does not depend on the process cwd."""

import os
from typing import Optional

_project_root: Optional[str] = None


def set_project_root(path: Optional[str]) -> None:
    global _project_root
    _project_root = os.path.abspath(path) if path else None


def resolve_project_path(path: str) -> str:
    if _project_root and path and not os.path.isabs(path):
        return os.path.join(_project_root, path)
    return path
