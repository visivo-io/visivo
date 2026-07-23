"""Tests for the Explore 2.0 Phase 4 draft-overlay builder (S2's resolved
design). Uses a minimal Flask-app STUB (just `.project`, no managers) —
`inject_cached_objects` skips every manager attr it can't find via
`getattr(flask_app, manager_attr, None)`, so omitting them entirely is a
faithful "no cached edits" state, not a shortcut around real behavior.
"""

import json

import pytest

from tests.factories.model_factories import SourceFactory, SqlModelFactory
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
        schema_dir = tmp_path / "schemas" / "orders_q"
        schema_dir.mkdir(parents=True)
        (schema_dir / "schema.json").write_text(
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
