"""Tests for the Explore 2.0 Phase 4 draft-overlay builder (S2's resolved
design). Uses a minimal Flask-app STUB (just `.project`, no managers) —
`inject_cached_objects` skips every manager attr it can't find via
`getattr(flask_app, manager_attr, None)`, so omitting them entirely is a
faithful "no cached edits" state, not a shortcut around real behavior.
"""

import json

import pytest

from tests.factories.model_factories import SourceFactory, SqlModelFactory
from visivo.models.metric import Metric
from visivo.models.project import Project
from visivo.query.insight.draft_overlay import build_draft_overlay, DraftOverlayError


class FlaskAppStub:
    def __init__(self, project):
        self.project = project


@pytest.fixture
def project_with_model():
    source = SourceFactory(name="warehouse")
    model = SqlModelFactory(name="orders_q", sql="select * from orders", source="ref(warehouse)")
    return Project(name="test_project", sources=[source], models=[model])


@pytest.fixture
def flask_app(project_with_model):
    return FlaskAppStub(project_with_model)


def insight_config(name="draft_insight", model_name="orders_q"):
    return {
        "name": name,
        "props": {
            "type": "scatter",
            "x": f"?{{${{ref({model_name}).region}}}}",
            "y": f"?{{sum(${{ref({model_name}).amount}})}}",
        },
    }


class TestBuildDraftOverlayHappyPath:
    def test_returns_a_dag_containing_the_transient_insight(self, flask_app):
        project, dag, insight = build_draft_overlay(flask_app, insight_config())
        assert insight.name == "draft_insight"
        assert any(getattr(n, "name", None) == "draft_insight" for n in dag.nodes)

    def test_does_not_mutate_the_live_flask_app_project(self, flask_app, project_with_model):
        build_draft_overlay(flask_app, insight_config())
        assert flask_app.project is project_with_model
        assert all(i.name != "draft_insight" for i in project_with_model.insights)

    def test_the_overlay_resolves_against_an_already_published_model(self, flask_app, tmp_path):
        _, dag, insight = build_draft_overlay(flask_app, insight_config())
        model_node = dag.get_descendant_by_name("orders_q")
        schema_dir = tmp_path / "schemas"
        schema_dir.mkdir(parents=True)
        (schema_dir / "orders_q.json").write_text(
            json.dumps({model_node.name_hash(): {"region": "VARCHAR", "amount": "DOUBLE"}})
        )
        query_info = insight.get_query_info(dag, str(tmp_path), force_dynamic=True)
        assert query_info.post_query is not None
        # Qualified by hash, not the bare model name — proves resolution
        # actually ran (a stub/empty query wouldn't reference the hash at all).
        assert model_node.name_hash() in query_info.post_query


class TestBuildDraftOverlayScratchModel:
    def test_a_brand_new_scratch_model_merges_into_the_project(self, flask_app):
        draft_models = [
            {"name": "cohort_q", "sql": "select * from cohorts", "source": "${ref(warehouse)}"}
        ]
        _, dag, insight = build_draft_overlay(
            flask_app, insight_config(model_name="cohort_q"), draft_models=draft_models
        )
        assert any(getattr(n, "name", None) == "cohort_q" for n in dag.nodes)

    def test_a_scratch_model_ref_with_no_schema_yet_raises_a_recognizable_error(
        self, flask_app, tmp_path
    ):
        draft_models = [
            {"name": "cohort_q", "sql": "select * from cohorts", "source": "${ref(warehouse)}"}
        ]
        _, dag, insight = build_draft_overlay(
            flask_app, insight_config(model_name="cohort_q"), draft_models=draft_models
        )
        # `force_dynamic=True` (what the compile-draft endpoint always uses)
        # routes through FieldResolver's raw-string-assembly path
        # (`resolve_ref`), which raises a bare `Exception("Missing schema for
        # model: ...")` — a DIFFERENT shape than the SQLGlot-AST path's
        # `ValueError("...Has the model been executed yet?")`. The compile-
        # draft view (insight_compile_views.py) recognizes both.
        with pytest.raises(Exception, match="Missing schema for model"):
            insight.get_query_info(dag, str(tmp_path), force_dynamic=True)

    def test_schema_overrides_close_the_never_run_scratch_model_gap(self, flask_app):
        draft_models = [
            {"name": "cohort_q", "sql": "select * from cohorts", "source": "${ref(warehouse)}"}
        ]
        _, dag, insight = build_draft_overlay(
            flask_app, insight_config(model_name="cohort_q"), draft_models=draft_models
        )
        model_node = dag.get_descendant_by_name("cohort_q")
        schema_overrides = {
            "cohort_q": {model_node.name_hash(): {"region": "VARCHAR", "amount": "DOUBLE"}}
        }
        query_info = insight.get_query_info(
            dag, "/tmp/no-schemas-here", schema_overrides=schema_overrides, force_dynamic=True
        )
        assert query_info.post_query is not None


class TestBuildDraftOverlayValidation:
    def test_invalid_insight_config_raises_draft_overlay_error(self, flask_app):
        with pytest.raises(DraftOverlayError):
            build_draft_overlay(flask_app, {"name": "bad", "props": {"type": "not-a-real-type"}})

    def test_missing_insight_name_raises_draft_overlay_error(self, flask_app):
        with pytest.raises(DraftOverlayError):
            build_draft_overlay(flask_app, {"props": {"type": "scatter"}})

    def test_invalid_draft_model_raises_draft_overlay_error(self, flask_app):
        with pytest.raises(DraftOverlayError):
            build_draft_overlay(
                flask_app,
                insight_config(),
                draft_models=[{"name": "missing_sql_field"}],
            )

    @pytest.mark.parametrize("blank_sql", ["", "   ", "\n\t"])
    def test_a_blank_or_whitespace_only_sql_is_gated_like_missing_sql(self, flask_app, blank_sql):
        # Phase 4 review fix: the gate must treat "" / "   " the same as
        # sql=None (both are unexecutable), producing the clean DraftOverlayError
        # rather than slipping through to a confusing downstream "model not run".
        with pytest.raises(DraftOverlayError):
            build_draft_overlay(
                flask_app,
                insight_config(),
                draft_models=[{"name": "blank_sql_model", "sql": blank_sql}],
            )


class TestBuildDraftOverlayModelScopedDraftFields:
    """Explore 2.0 bug #1 (computed-metric-treated-as-dimension). A computed
    column created in the Explorer is a MODEL-SCOPED metric/dimension carrying a
    BARE expression (``avg(amount)`` / ``CASE WHEN amount < 100 ...``) — exactly
    the shape a *promoted* model-scoped metric has. It must inject ONTO its
    parent model so the bare expression resolves against that model's own
    columns; an aggregate metric then forces ``requires_full_source`` + a
    GROUP BY over the full source (the fix for "grouping returns the global avg
    for every group"). Injecting project-level — the pre-fix behavior — leaves a
    bare aggregate expression unresolvable (a project-level metric expects
    ``${ref(model).field}``-qualified refs)."""

    def _bar_insight(self):
        return {
            "name": "draft_insight",
            "props": {
                "type": "bar",
                "x": "?{${ref(orders_q).weight_group}}",
                "y": "?{${ref(orders_q).avg_total}}",
            },
        }

    def _resolve(self, flask_app, tmp_path, draft_metrics=None, draft_dimensions=None):
        _, dag, insight = build_draft_overlay(
            flask_app,
            self._bar_insight(),
            draft_metrics=draft_metrics,
            draft_dimensions=draft_dimensions,
        )
        model_node = dag.get_descendant_by_name("orders_q")
        schema_overrides = {
            "orders_q": {model_node.name_hash(): {"region": "VARCHAR", "amount": "DOUBLE"}}
        }
        return dag, insight.get_query_info(
            dag, str(tmp_path), schema_overrides=schema_overrides, force_dynamic=True
        )

    def test_model_scoped_metric_and_dimension_resolve_as_an_aggregate_group_by(
        self, flask_app, tmp_path
    ):
        # The core correctness guarantee: a bare aggregate metric grouped by a
        # bare CASE dimension compiles to AVG(...) ... GROUP BY CASE ... and is
        # flagged for full-source execution (so the aggregate is computed over
        # the real data, not a client-side per-row constant). Reverting the
        # injector to the project-level path makes this raise instead (bare
        # `avg(amount)` can't resolve project-level) — the falsification.
        _, query_info = self._resolve(
            flask_app,
            tmp_path,
            draft_metrics=[{"name": "avg_total", "expression": "avg(amount)", "model": "orders_q"}],
            draft_dimensions=[
                {
                    "name": "weight_group",
                    "expression": "CASE WHEN amount < 100 THEN 'low' ELSE 'high' END",
                    "model": "orders_q",
                }
            ],
        )
        assert query_info.requires_full_source is True
        post_query = (query_info.post_query or "").lower()
        assert "avg(" in post_query
        assert "group by" in post_query

    def test_draft_metric_is_attached_to_its_named_model_not_the_project_list(
        self, flask_app, project_with_model
    ):
        project, dag, _ = build_draft_overlay(
            flask_app,
            self._bar_insight(),
            draft_metrics=[{"name": "avg_total", "expression": "avg(amount)", "model": "orders_q"}],
            draft_dimensions=[
                {
                    "name": "weight_group",
                    "expression": "CASE WHEN amount < 100 THEN 'low' ELSE 'high' END",
                    "model": "orders_q",
                }
            ],
        )
        model_node = dag.get_descendant_by_name("orders_q")
        assert any(m.name == "avg_total" for m in model_node.metrics)
        assert any(d.name == "weight_group" for d in model_node.dimensions)
        # It must NOT leak into the project-level metric/dimension lists.
        assert all(m.name != "avg_total" for m in (project.metrics or []))
        assert all(d.name != "weight_group" for d in (project.dimensions or []))
        # The live project is untouched (overlay-only injection).
        assert all(m.name != "avg_total" for m in project_with_model.models[0].metrics)

    def test_a_project_level_bare_aggregate_without_a_model_key_stays_unresolvable(
        self, flask_app, tmp_path
    ):
        # Guards the routing: an entry with NO `model` key falls back to the
        # legacy project-level list, where a bare aggregate cannot resolve — so
        # the `model` key is precisely what makes model-scoped resolution work.
        with pytest.raises(Exception):
            self._resolve(
                flask_app,
                tmp_path,
                draft_metrics=[{"name": "avg_total", "expression": "avg(amount)"}],
                draft_dimensions=[
                    {
                        "name": "weight_group",
                        "expression": "CASE WHEN amount < 100 THEN 'low' ELSE 'high' END",
                    }
                ],
            )

    def test_a_draft_field_naming_an_unknown_model_falls_back_to_project_level(self, flask_app):
        # A metric whose `model` names no known model must not silently vanish —
        # it falls back to the project-level list so a later resolution failure
        # is a clean, surfaced error rather than a silent drop.
        project, _, _ = build_draft_overlay(
            flask_app,
            self._bar_insight(),
            draft_metrics=[
                {"name": "avg_total", "expression": "avg(amount)", "model": "no_such_model"}
            ],
        )
        assert any(m.name == "avg_total" for m in (project.metrics or []))

    def test_a_draft_field_shadows_a_same_named_published_model_scoped_metric(
        self, flask_app, project_with_model
    ):
        # A published model-scoped metric of the same name is shadowed by the
        # draft's version in the ephemeral overlay (draft-wins), never duplicated.
        project_with_model.models[0].metrics = [Metric(name="avg_total", expression="min(amount)")]
        _, dag, _ = build_draft_overlay(
            flask_app,
            self._bar_insight(),
            draft_metrics=[{"name": "avg_total", "expression": "avg(amount)", "model": "orders_q"}],
        )
        model_node = dag.get_descendant_by_name("orders_q")
        matching = [m for m in model_node.metrics if m.name == "avg_total"]
        assert len(matching) == 1
        assert matching[0].expression == "avg(amount)"


class TestBuildDraftOverlayNameShadowing:
    def test_a_draft_model_reusing_a_real_published_name_shadows_it_in_the_ephemeral_copy_only(
        self, flask_app, project_with_model
    ):
        draft_models = [
            {
                "name": "orders_q",
                "sql": "select * from a_totally_different_table",
                "source": "${ref(warehouse)}",
            }
        ]
        project, dag, _ = build_draft_overlay(
            flask_app, insight_config(), draft_models=draft_models
        )
        shadowed = dag.get_descendant_by_name("orders_q")
        assert "a_totally_different_table" in shadowed.sql
        # The REAL, live project object is untouched.
        assert project_with_model.models[0].sql == "select * from orders"
