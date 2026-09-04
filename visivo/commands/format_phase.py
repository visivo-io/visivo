import os

from visivo.discovery.discover import Discover
from visivo.logger.logger import Logger
from visivo.parsers.canonical_yaml import format_file


def _project_files(working_dir, output_dir, paths):
    """The files to format: the ones given, or every file in the project.

    Two things ``Discover.files`` returns that must not be formatted:

    * ``~/.visivo/profile.yml`` — the user's credentials, outside the project.
    * ``.visivo_cache/...`` — git-backed includes, which are clones of somebody
      else's repository. Reformatting those would dirty a checkout the user does
      not own and cannot commit.

    The output directory is skipped too: it holds generated artifacts.
    """
    if paths:
        return [os.path.abspath(path) for path in paths]

    discover = Discover(working_dir=working_dir, output_dir=output_dir)
    root = os.path.abspath(working_dir)
    excluded = (
        os.path.abspath(os.path.join(working_dir, ".visivo_cache")),
        os.path.abspath(output_dir),
    )

    files = []
    for file in discover.files:
        absolute = os.path.abspath(str(file))
        if not absolute.startswith(root + os.sep):
            continue
        if any(absolute.startswith(path + os.sep) for path in excluded):
            continue
        if absolute not in files:
            files.append(absolute)
    return files


def format_phase(working_dir, output_dir, paths=(), check=False):
    """Format project YAML, or report what is not canonical.

    Returns the number of files that were not already canonical, so ``--check``
    can exit non-zero without the phase knowing about exit codes.
    """
    files = _project_files(working_dir, output_dir, paths)
    changed = []

    for file in files:
        if not os.path.exists(file):
            Logger.instance().error(f"\tNo such file: {file}")
            continue
        if format_file(file, write=not check):
            changed.append(file)

    for file in changed:
        relative = os.path.relpath(file, os.path.abspath(working_dir))
        Logger.instance().info(f"\t{'Would reformat' if check else 'Reformatted'} {relative}")

    if not changed:
        Logger.instance().success(f"{len(files)} files already formatted")

    return len(changed)
