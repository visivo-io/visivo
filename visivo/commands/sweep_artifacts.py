"""Delete run artifacts under ``target/`` that name no object in the project.

Membership in the (fully-parsed) project decides this, not whether the current
run built the file — a filtered run (``-d``) is a subset and says nothing about
whether an unbuilt artifact is still wanted.

Does not touch ``files/`` (pre-VIS-1128 location, a separate cleanup),
``schema*/`` (source-level, not per-object), or directories.
"""

import os
from glob import glob


def _artifact_dirs():
    """(directory, node type, allow_suffix — inputs write `<name>_<key>.parquet`)."""
    # Imported lazily: pulled in at the end of every run, and the model package is heavy.
    from visivo.models.inputs.input import Input
    from visivo.models.insight import Insight
    from visivo.models.models.model import Model

    return (
        ("insights", Insight, False),
        ("models", Model, False),
        ("inputs", Input, True),
    )


def _object_names(project, node_type):
    """Every name of `node_type` in the project, via the DAG (not
    `project.<collection>` — that misses objects declared inline, e.g. an
    insight nested inside a chart inside a dashboard item).

    :returns: the set of names, or None when the DAG cannot answer.
    """
    try:
        nodes = project.dag().get_nodes_by_types([node_type], True)
    except Exception:
        return None
    return {node.name for node in nodes if getattr(node, "name", None)}


def _owner_of(stem, names, allow_suffix):
    """The object a file belongs to, or None when nothing claims it.

    `allow_suffix` also accepts `<name>_<anything>` (an input's options
    parquet). Deliberately permissive: `<name>_<key>` is ambiguous between a
    deleted `region_totals` and a live `region`'s `totals_options`, and any
    live name that could own it keeps the file — a stale file is recoverable,
    a wrong deletion is not. Longest match wins so the answer is order-independent.
    """
    if stem in names:
        return stem
    if not allow_suffix:
        return None
    candidates = [name for name in names if stem.startswith(f"{name}_")]
    return max(candidates, key=len) if candidates else None


def find_orphaned_artifacts(project, run_dir):
    """Every file under ``run_dir`` that names no object in ``project``.

    Pure — removes nothing, so the decision can be tested and logged
    separately from the deletion.
    """
    if not project or not run_dir or not os.path.isdir(run_dir):
        return []

    orphans = []
    for directory, node_type, allow_suffix in _artifact_dirs():
        path = os.path.join(run_dir, directory)
        if not os.path.isdir(path):
            continue
        names = _object_names(project, node_type)
        # None (DAG failed) and empty (genuinely no objects of this type) both
        # skip: neither is distinguishable from a parse that dropped them.
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

    Fails open: an unremovable file is skipped rather than failing the run.
    """
    removed = []
    for artifact in find_orphaned_artifacts(project, run_dir):
        try:
            os.remove(artifact)
            removed.append(artifact)
        except OSError:
            continue
    return removed
