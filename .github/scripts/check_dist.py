"""Refuse a Python distribution that PyPI would reject or that ships more than the package.

PyPI caps each file of the visivo project at 100 MB. An sdist that sweeps in the
release job's working tree passes `uv build` and only fails at upload, after the
tag and the GitHub release already exist.

Usage: python check_dist.py [DIST_DIR] [--max-mb N]
"""

import argparse
import sys
import tarfile
from pathlib import Path

DEFAULT_MAX_MB = 90
PACKAGE = "visivo"
SDIST_ROOT_FILES = {"PKG-INFO", "pyproject.toml", "README.md", ".gitignore"}


def oversize_files(dist_dir, max_bytes):
    return [
        f"{path.name} is {path.stat().st_size / 1_000_000:.1f} MB, over the "
        f"{max_bytes / 1_000_000:.0f} MB limit"
        for path in sorted(Path(dist_dir).iterdir())
        if path.is_file() and path.stat().st_size > max_bytes
    ]


def stray_sdist_members(sdist_path):
    with tarfile.open(sdist_path, "r:gz") as sdist:
        names = sdist.getnames()
    stray = []
    for name in names:
        parts = name.split("/", 1)
        if len(parts) == 1:
            continue
        rel = parts[1]
        if rel in SDIST_ROOT_FILES or rel == PACKAGE or rel.startswith(PACKAGE + "/"):
            continue
        stray.append(rel)
    return stray


def check(dist_dir, max_mb=DEFAULT_MAX_MB):
    dist_dir = Path(dist_dir)
    problems = oversize_files(dist_dir, max_mb * 1_000_000)
    sdists = sorted(dist_dir.glob("*.tar.gz"))
    for sdist in sdists:
        stray = stray_sdist_members(sdist)
        if stray:
            problems.append(
                f"{sdist.name} has {len(stray)} members outside {PACKAGE}/, e.g. {stray[:5]}"
            )
    if not any(dist_dir.glob("*.whl")) and not sdists:
        problems.append(f"{dist_dir} has no wheel or sdist")
    return problems


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("dist_dir", nargs="?", default="dist")
    parser.add_argument("--max-mb", type=float, default=DEFAULT_MAX_MB)
    args = parser.parse_args(argv)
    problems = check(args.dist_dir, args.max_mb)
    for problem in problems:
        print(f"::error::{problem}")
    if not problems:
        for path in sorted(Path(args.dist_dir).iterdir()):
            if path.is_file() and not path.name.startswith("."):
                print(f"{path.name}: {path.stat().st_size / 1_000_000:.1f} MB")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
