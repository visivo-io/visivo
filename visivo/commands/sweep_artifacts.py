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


def _artifact_dirs():
    """The per-object directories, and the type that may own a file in each.

    Imported lazily — this module is pulled in at the end of a run and the model
    package is heavy.

    The third element says whether a file's stem may carry a `_suffix` after the
    object name: inputs write `<name>_<key>.parquet` beside `<name>.json`.
    """
    from visivo.models.inputs.input import Input
    from visivo.models.insight import Insight
    from visivo.models.models.model import Model

    return (
        ("insights", Insight, False),
        ("models", Model, False),
        ("inputs", Input, True),
    )


def _object_names(project, node_type):
    """Every name of `node_type` in the project, wherever it is declared.

    From the DAG, NOT from `project.<collection>`. An object does not have to be
    top-level: the integration project defines `double-simple-line` inline
    inside a chart, inside a dashboard item, and it is a real insight with a
    real artifact. Reading the top-level list called it residue and deleted it
    — caught by CI, which was the only place a project shaped like that existed.

    The DAG is the same flattening `child_items()` feeds, so this asks exactly
    the question the rest of the system means by "in the project".

    :returns: the set of names, or None when the DAG cannot answer.
    """
    try:
        nodes = project.dag().get_nodes_by_types([node_type], True)
    except Exception:
        # A project whose DAG will not build cannot answer the question, and
        # guessing would delete real artifacts.
        return None
    return {node.name for node in nodes if getattr(node, "name", None)}


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
    for directory, node_type, allow_suffix in _artifact_dirs():
        path = os.path.join(run_dir, directory)
        if not os.path.isdir(path):
            continue
        names = _object_names(project, node_type)
        # None means the DAG could not answer. Empty means the project genuinely
        # has none of this type — indistinguishable from a parse that dropped
        # them, and deleting the directory's contents on that basis would turn a
        # parse problem into data loss. Neither one sweeps.
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
