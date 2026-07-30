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

import re
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


# Draft metrics/dimensions are MODEL-SCOPED: a computed column created in the
# Explorer carries a BARE expression (``avg(amount)`` / ``CASE WHEN amount <
# 100 ...``) that only resolves against its own model's columns — the same
# shape a *promoted* model-scoped metric has. Each such wire dict therefore
# carries a ``model`` key naming its parent model; it is popped before Pydantic
# validation (``Metric``/``Dimension`` are ``extra="forbid"``) and used to
# route the object onto that model rather than into the project-level list
# (where a bare aggregate expression is unresolvable — the root cause of
# bug #1, "grouping a computed metric returns the global average").
_MODEL_SCOPED_FIELDS = ("metrics", "dimensions")


def _unwrap_model_ref(value):
    """Accept a plain model name or a ``ref(x)`` / ``${ref(x)}`` wrapper."""
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    match = re.search(r"ref\(\s*([^)\s]+)\s*\)", stripped)
    return match.group(1) if match else (stripped or None)


def _find_model(project, model_name):
    for model in project.models or []:
        if getattr(model, "name", None) == model_name:
            return model
    return None


def _inject_model_scoped_fields(project, field_name, configs):
    """Inject validated draft metrics/dimensions onto their named parent model
    (model-scoped) so bare expressions resolve against that model. A config
    with no (or an unknown) ``model`` key falls back to the project-level list
    so the ref still has a chance to resolve and any failure surfaces as a
    clean downstream error rather than a silent drop."""
    adapter = _get_type_adapter(field_name)
    if adapter is None:
        return
    project_level = []
    for config in configs:
        cfg = dict(config or {})
        model_name = _unwrap_model_ref(cfg.pop("model", None))
        try:
            obj = adapter.validate_python(cfg)
        except ValidationError as e:
            raise DraftOverlayError(f"Invalid draft {field_name}: {e}") from e
        target = _find_model(project, model_name) if model_name else None
        if target is not None:
            # Post-construction append bypasses SqlModel's after-validator, so
            # set the parent name explicitly (the same contract
            # metrics_views.py / dimension_views.py use) — that is what makes a
            # bare expression resolve as model-scoped.
            obj.set_parent_name(target.name)
            existing = list(getattr(target, field_name, None) or [])
            setattr(target, field_name, merge_objects_into_list(existing, [(obj.name, obj)]))
        else:
            project_level.append((obj.name, obj))
    if project_level:
        existing = list(getattr(project, field_name, None) or [])
        setattr(project, field_name, merge_objects_into_list(existing, project_level))


def _inject_draft_objects(project, draft_objects):
    """``draft_objects``: ``{"models": [...], "metrics": [...], "dimensions": [...]}``
    of wire-shaped config dicts -> validated Pydantic instances, merged by
    name onto ``project`` at HIGHEST priority (overrides both the published
    project and any manager-cached-but-unsaved objects). Metrics/dimensions are
    routed model-scoped (see ``_inject_model_scoped_fields``)."""
    for field_name, configs in (draft_objects or {}).items():
        if not configs:
            continue
        if field_name in _MODEL_SCOPED_FIELDS:
            _inject_model_scoped_fields(project, field_name, configs)
            continue
        adapter = _get_type_adapter(field_name)
        if adapter is None:
            continue
        try:
            validated = [adapter.validate_python(c) for c in configs]
        except ValidationError as e:
            raise DraftOverlayError(f"Invalid draft {field_name}: {e}") from e
        # A DRAFT model exists solely to be compiled + executed for this
        # insight preview, so it MUST carry executable SQL. Before #533,
        # ``ModelField`` was a discriminated union whose discriminator returned
        # no tag for a dict lacking a ``sql`` (/``args``/``models``) key, so a
        # SQL-less model dict failed validation outright. #533 collapsed the
        # union to a bare ``SqlModel`` (csv-script / local-merge models became
        # seeds) whose ``sql`` is Optional — a *published* SqlModel may legally
        # be a pure metric/dimension container. That dropped the implicit gate:
        # a ``{"name": ...}`` draft model now validates with ``sql=None`` and
        # silently slips downstream, where ``get_query_info`` fails with a
        # "model not run" marker (a 422) instead of the intended clean 400.
        # Re-assert the gate explicitly for the draft flow only.
        if field_name == "models":
            for obj in validated:
                # Blank / whitespace-only sql is as unexecutable as sql=None —
                # gate both here so they produce the same clean 400 rather than
                # letting an empty string slip through to a confusing downstream
                # "model not run" 422.
                if not (getattr(obj, "sql", None) or "").strip():
                    raise DraftOverlayError(
                        f"Invalid draft models: model '{obj.name}' defines no `sql` — "
                        "a draft model must carry an executable SQL query."
                    )
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
