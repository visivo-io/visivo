"""List the data files in a served project (docs/contracts/project-files-and-credentials.md)."""

import os
import re
import subprocess
from datetime import datetime, timezone

MAX_BYTES = 100 * 1024 * 1024
MAX_DEPTH = 8
MAX_FILES = 5000
SKIPPED_DIRS = {"target", "node_modules", "__pycache__", "venv"}

_EXTENSION = re.compile(r"^[a-z0-9]{1,16}$")


class InvalidExtension(ValueError):
    pass


def parse_extensions(raw):
    if not raw:
        return set()
    extensions = {part.strip().lower().lstrip(".") for part in raw.split(",") if part.strip()}
    for extension in extensions:
        if not _EXTENSION.match(extension):
            raise InvalidExtension(f"'{extension}' is not a file extension.")
    return extensions


def _is_hidden(parts):
    return any(part.startswith(".") for part in parts)


def _git_candidates(root):
    try:
        result = subprocess.run(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
            cwd=root,
            capture_output=True,
            timeout=10,
            check=True,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return [path for path in result.stdout.decode("utf-8", "replace").split("\0") if path]


def _walk_candidates(root):
    for current, dirs, files in os.walk(root):
        relative_dir = os.path.relpath(current, root)
        depth = 0 if relative_dir == "." else relative_dir.count(os.sep) + 1
        dirs[:] = [
            d for d in dirs if not d.startswith(".") and d not in SKIPPED_DIRS and depth < MAX_DEPTH
        ]
        for name in files:
            yield name if relative_dir == "." else os.path.join(relative_dir, name)


def _within(root, path):
    return os.path.commonpath([root, path]) == root


def file_entry(relative_path, absolute_path):
    stat = os.stat(absolute_path)
    filename = os.path.basename(relative_path)
    return {
        "path": relative_path.replace(os.sep, "/"),
        "filename": filename,
        "original_filename": filename,
        "version_id": None,
        "format": os.path.splitext(filename)[1].lstrip(".").lower(),
        "size": stat.st_size,
        "sha256": None,
        "created_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
    }


def list_project_files(project_root, extensions=frozenset()):
    """Project-relative data files under ``project_root``, sorted by path.

    Skips hidden and git-ignored paths, build output, and anything whose real
    location is outside the root.
    """
    root = os.path.realpath(project_root)
    candidates = _git_candidates(root)
    if candidates is None:
        candidates = _walk_candidates(root)

    entries = []
    for relative_path in candidates:
        parts = relative_path.replace("\\", "/").split("/")
        if _is_hidden(parts) or len(parts) > MAX_DEPTH + 1 or SKIPPED_DIRS & set(parts[:-1]):
            continue
        extension = os.path.splitext(parts[-1])[1].lstrip(".").lower()
        if extensions and extension not in extensions:
            continue
        absolute_path = os.path.join(root, *parts)
        if not _within(root, os.path.realpath(absolute_path)) or not os.path.isfile(absolute_path):
            continue
        entries.append(file_entry(os.path.join(*parts), absolute_path))
        if len(entries) >= MAX_FILES:
            break

    return sorted(entries, key=lambda entry: entry["path"])
