"""Remove run artifacts that name no object in the project.

A run only ever ADDS files under ``target/``. Nothing removed the ones a
rename, a delete, or a naming-scheme change orphaned, so the directories
accumulated indefinitely. That was invisible until something globbed them:
``visivo dist`` shipped every object twice — once from ``station-bubbles.json``
and once from ``mifawvncyzdkmlywzcggvituhvlwb.json``, the pre-VIS-1128 name for
the same insight — and the stale copy pointed at a parquet nobody had written
in six months, so a hosted bundle 404'd on its own data.

WHAT COUNTS AS RESIDUE

Membership in the project, not "did this run build it". Those are different
questions and only the first one is safe to answer:

* A filtered run (``-d``) builds a subset, so "this run didn't write it" says
  nothing about whether the artifact is still wanted.
* The project, by contrast, is fully parsed regardless of the filter. An
  artifact whose name matches no object of its type cannot be reached by
  anything, however the run was invoked.

So the filter does not restrict the sweep — it never had a bearing on the
question being asked.

WHAT THIS DELIBERATELY DOES NOT TOUCH

* ``files/`` — the pre-VIS-1128 parquet location. Nothing writes it today, which
  makes it entirely residue, but "this whole directory is obsolete" is a
  different judgement from "this file names nothing" and deserves its own
  change.
* ``schema/`` and ``schemas/`` — source-level schema caches, not per-object
  artifacts.
* Directories. Only files are removed, so an empty leftover directory stays.
"""

import os
from glob import glob

# Each entry: the directory under the run dir, the project attribute holding the
# objects that may legitimately own a file there, and whether a file's stem can
# carry a `_suffix` after the object name (inputs write
# `<name>_<key>.parquet` beside `<name>.json`).
_ARTIFACT_DIRS = (
    ("insights", "insights", False),
    ("models", "models", False),
    ("inputs", "inputs", True),
)


def _object_names(project, attribute):
    return {
        obj.name for obj in (getattr(project, attribute, None) or []) if getattr(obj, "name", None)
    }


def _owner_of(stem, names, allow_suffix):
    """The object a file belongs to, or None when nothing claims it.

    Exact stem match is the normal case. `allow_suffix` additionally accepts
    `<name>_<anything>`, which is how an input writes its options parquet.

    That prefix rule is deliberately PERMISSIVE. `region_totals_options.parquet`
    could be a deleted `region_totals` input's options, or a live `region`
    input's `totals_options` key — the `<name>_<key>` shape cannot distinguish
    them. Any live name that could own the file claims it, so the ambiguous case
    is kept. Leaving a stale file behind is the recoverable error; deleting
    someone's data on a guess is not.

    The longest match is returned when several could claim it, so the answer
    doesn't depend on set ordering.
    """
    if stem in names:
        return stem
    if not allow_suffix:
        return None
    candidates = [name for name in names if stem.startswith(f"{name}_")]
    return max(candidates, key=len) if candidates else None


def find_orphaned_artifacts(project, run_dir):
    """Every file under ``run_dir`` that names no object in ``project``.

    Pure — it removes nothing. Split out so the decision can be tested, and
    logged, separately from the deletion.

    :returns: a sorted list of absolute-ish paths, as globbed.
    """
    if not project or not run_dir or not os.path.isdir(run_dir):
        return []

    orphans = []
    for directory, attribute, allow_suffix in _ARTIFACT_DIRS:
        path = os.path.join(run_dir, directory)
        if not os.path.isdir(path):
            continue
        names = _object_names(project, attribute)
        # No objects of this type at all is ambiguous: a project that never had
        # any looks identical to one whose parse dropped them. Leave the
        # directory alone rather than delete everything in it.
        if not names:
            continue
        for artifact in glob(os.path.join(path, "*")):
            if not os.path.isfile(artifact):
                continue
            stem = os.path.splitext(os.path.basename(artifact))[0]
            if _owner_of(stem, names, allow_suffix) is None:
                orphans.append(artifact)
    return sorted(orphans)


def sweep_orphaned_artifacts(project, run_dir):
    """Delete the orphans and return what was removed.

    FAILS OPEN. A sweep is housekeeping; it must never turn a successful run
    into a failed one. An unremovable file is skipped and the rest proceed.
    """
    removed = []
    for artifact in find_orphaned_artifacts(project, run_dir):
        try:
            os.remove(artifact)
            removed.append(artifact)
        except OSError:
            continue
    return removed
