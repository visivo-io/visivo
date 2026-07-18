"""Draft overlay builder for the stateless insight compile-draft endpoint
(Explore 2.0 Phase 4 — see
specs/plan/explorer-workspace-unification/research/s2-draft-rendering-decision.md).

Reuses the exact ``deepcopy(project) -> inject_cached_objects() ->
invalidate_dag_cache()`` overlay pattern ``save_run_executor.py`` already runs
on every project save, plus the recovered pre-#507 ``_inject_context_objects``
merge-by-name logic (``git show df792c50^:visivo/server/jobs/
preview_job_executor.py``) for objects that arrive straight off the wire and
were never even cached in an editor session — a draft insight, and any
brand-new scratch models/metrics/dimensions it depends on.

This module builds the overlay DAG and stops. It never constructs or calls
``FilteredRunner`` — the overlay's only job here is to produce a DAG rich
enough for ``Insight.get_query_info()`` to resolve refs and build query text,
never to execute anything or write to disk.
"""

from copy import deepcopy
from typing import Optional

from pydantic import TypeAdapter, ValidationError

from visivo.models.insight import Insight
from visivo.server.jobs.project_injection import (
    inject_cached_objects,
    merge_objects_into_list,
)

# Mirrors the pre-#507 ``preview_job_executor.py``'s ``CONTEXT_OBJECT_TYPES``
# minus ``inputs``/``insights`` (this module only ever injects ONE ad hoc
# insight — the draft being compiled — handled separately below) and minus
# ``relations`` (deliberately excluded there too: they save to the draft
# cache like any other DAG-affecting edit and flow in via
# ``inject_cached_objects`` already).
_ADAPTER_FACTORIES = {}


def _get_type_adapter(field_name: str):
    if field_name in _ADAPTER_FACTORIES:
        return _ADAPTER_FACTORIES[field_name]
    adapter = None
    if field_name == "models":
        from visivo.models.models.fields import ModelField

        adapter = TypeAdapter(ModelField)
    elif field_name == "dimensions":
        from visivo.models.dimension import Dimension

        adapter = TypeAdapter(Dimension)
    elif field_name == "metrics":
        from visivo.models.metric import Metric

        adapter = TypeAdapter(Metric)
    if adapter is not None:
        _ADAPTER_FACTORIES[field_name] = adapter
    return adapter


class DraftOverlayError(ValueError):
    """A draft insight/model/metric/dimension config failed Pydantic
    validation, or the draft's model schema hasn't been introspected yet.
    Callers (the compile-draft view) catch this and return 400."""


def _inject_draft_objects(project, draft_objects):
    """``draft_objects``: ``{"models": [...], "metrics": [...], "dimensions": [...]}``
    of wire-shaped config dicts -> validated Pydantic instances, merged by
    name onto ``project`` at HIGHEST priority (overrides both the published
    project and any manager-cached-but-unsaved objects)."""
    for field_name, configs in (draft_objects or {}).items():
        if not configs:
            continue
        adapter = _get_type_adapter(field_name)
        if adapter is None:
            continue
        try:
            validated = [adapter.validate_python(c) for c in configs]
        except ValidationError as e:
            raise DraftOverlayError(f"Invalid draft {field_name}: {e}") from e
        obj_list = list(getattr(project, field_name, None) or [])
        new_objects = [(obj.name, obj) for obj in validated]
        setattr(project, field_name, merge_objects_into_list(obj_list, new_objects))


def build_draft_overlay(
    flask_app,
    insight_config: dict,
    draft_models: Optional[list] = None,
    draft_metrics: Optional[list] = None,
    draft_dimensions: Optional[list] = None,
):
    """Build an ephemeral (deepcopy) project + DAG resolving ``insight_config``
    (a wire-shaped insight dict — must include ``name``) plus any scratch
    models/metrics/dimensions it references, WITHOUT ever writing to disk,
    caching anything on the live app, or scheduling a run.

    Returns ``(project, dag, insight)`` — ``insight`` is the SAME transient
    ``Insight`` Pydantic instance that was merged into ``project.insights``
    (list membership by reference, per ``ParentModel.dag()``'s two-phase
    build/dereference walk operating on the objects actually present in the
    project's own field lists — no copy happens during DAG construction), so
    it is safe to call ``insight.get_query_info(dag, output_dir, ...)``
    directly.

    Raises ``DraftOverlayError`` for a malformed draft object (never lets a
    Pydantic ``ValidationError`` escape uncaught to the view).
    """
    project = deepcopy(flask_app.project)
    inject_cached_objects(flask_app, project)
    _inject_draft_objects(
        project,
        {
            "models": draft_models,
            "metrics": draft_metrics,
            "dimensions": draft_dimensions,
        },
    )

    try:
        insight = Insight.model_validate(insight_config)
    except ValidationError as e:
        raise DraftOverlayError(f"Invalid draft insight: {e}") from e

    project.insights = merge_objects_into_list(
        list(project.insights or []), [(insight.name, insight)]
    )

    project.invalidate_dag_cache()
    dag = project.dag()
    return project, dag, insight
