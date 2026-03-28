import pytest
from unittest.mock import MagicMock
from copy import deepcopy

from visivo.server.jobs.preview_job_executor import (
    _inject_cached_objects,
    _inject_context_objects,
    MANAGER_TO_PROJECT_FIELD,
    CONTEXT_OBJECT_TYPES,
)
from tests.factories.model_factories import (
    ProjectFactory,
    SqlModelFactory,
    SourceFactory,
    InsightFactory,
    MetricFactory,
    DimensionFactory,
)


def _make_project(**kwargs):
    defaults = {"dashboards": []}
    defaults.update(kwargs)
    return ProjectFactory(**defaults)


def _make_flask_app_mock(project, cached_overrides=None):
    flask_app = MagicMock()
    flask_app.project = project

    for manager_attr, _ in MANAGER_TO_PROJECT_FIELD:
        manager = MagicMock()
        manager.cached_objects = {}
        setattr(flask_app, manager_attr, manager)

    if cached_overrides:
        for manager_attr, cached in cached_overrides.items():
            getattr(flask_app, manager_attr).cached_objects = cached

    return flask_app


class TestInjectCachedObjects:
    def test_no_cached_objects_leaves_project_unchanged(self):
        source = SourceFactory(name="src")
        model = SqlModelFactory(name="my_model", source="ref(src)")
        project = _make_project(sources=[source], models=[model])
        preview_project = deepcopy(project)
        flask_app = _make_flask_app_mock(project)

        _inject_cached_objects(flask_app, preview_project)

        assert len(preview_project.models) == 1
        assert preview_project.models[0].name == "my_model"

    def test_cached_model_added_to_project(self):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[])
        preview_project = deepcopy(project)

        cached_model = SqlModelFactory(name="cached_model", source="ref(src)")
        flask_app = _make_flask_app_mock(
            project, cached_overrides={"model_manager": {"cached_model": cached_model}}
        )

        _inject_cached_objects(flask_app, preview_project)

        assert len(preview_project.models) == 1
        assert preview_project.models[0].name == "cached_model"

    def test_cached_model_overrides_published_with_same_name(self):
        source = SourceFactory(name="src")
        published_model = SqlModelFactory(name="my_model", sql="SELECT 1", source="ref(src)")
        project = _make_project(sources=[source], models=[published_model])
        preview_project = deepcopy(project)

        cached_model = SqlModelFactory(name="my_model", sql="SELECT 2", source="ref(src)")
        flask_app = _make_flask_app_mock(
            project, cached_overrides={"model_manager": {"my_model": cached_model}}
        )

        _inject_cached_objects(flask_app, preview_project)

        assert len(preview_project.models) == 1
        assert preview_project.models[0].sql == "SELECT 2"

    def test_none_cached_objects_are_skipped(self):
        source = SourceFactory(name="src")
        published_model = SqlModelFactory(name="my_model", sql="SELECT 1", source="ref(src)")
        project = _make_project(sources=[source], models=[published_model])
        preview_project = deepcopy(project)

        flask_app = _make_flask_app_mock(
            project, cached_overrides={"model_manager": {"my_model": None}}
        )

        _inject_cached_objects(flask_app, preview_project)

        assert len(preview_project.models) == 1
        assert preview_project.models[0].sql == "SELECT 1"

    def test_multiple_managers_inject(self):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[], insights=[])
        preview_project = deepcopy(project)

        cached_model = SqlModelFactory(name="new_model", source="ref(src)")
        cached_insight = InsightFactory(name="new_insight")
        flask_app = _make_flask_app_mock(
            project,
            cached_overrides={
                "model_manager": {"new_model": cached_model},
                "insight_manager": {"new_insight": cached_insight},
            },
        )

        _inject_cached_objects(flask_app, preview_project)

        assert len(preview_project.models) == 1
        assert preview_project.models[0].name == "new_model"
        insight_names = [i.name for i in preview_project.insights]
        assert "new_insight" in insight_names

    def test_cached_source_added_to_project(self):
        project = _make_project(sources=[], models=[])
        preview_project = deepcopy(project)

        cached_source = SourceFactory(name="cached_src")
        flask_app = _make_flask_app_mock(
            project, cached_overrides={"source_manager": {"cached_src": cached_source}}
        )

        _inject_cached_objects(flask_app, preview_project)

        source_names = [s.name for s in preview_project.sources]
        assert "cached_src" in source_names

    def test_missing_manager_is_gracefully_skipped(self):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[])
        preview_project = deepcopy(project)

        flask_app = _make_flask_app_mock(project)
        flask_app.model_manager = None

        _inject_cached_objects(flask_app, preview_project)

        assert len(preview_project.models) == 0

    def test_cached_objects_are_deepcopied(self):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[])
        preview_project = deepcopy(project)

        cached_model = SqlModelFactory(name="m", source="ref(src)")
        flask_app = _make_flask_app_mock(
            project, cached_overrides={"model_manager": {"m": cached_model}}
        )

        _inject_cached_objects(flask_app, preview_project)

        assert preview_project.models[0] is not cached_model
        assert preview_project.models[0].name == cached_model.name

    def test_cached_and_published_coexist(self):
        source = SourceFactory(name="src")
        published_model = SqlModelFactory(name="pub_model", source="ref(src)")
        project = _make_project(sources=[source], models=[published_model])
        preview_project = deepcopy(project)

        cached_model = SqlModelFactory(name="cached_model", source="ref(src)")
        flask_app = _make_flask_app_mock(
            project, cached_overrides={"model_manager": {"cached_model": cached_model}}
        )

        _inject_cached_objects(flask_app, preview_project)

        assert len(preview_project.models) == 2
        model_names = [m.name for m in preview_project.models]
        assert "pub_model" in model_names
        assert "cached_model" in model_names


class TestInjectContextObjects:
    def test_none_context_objects_is_noop(self):
        source = SourceFactory(name="src")
        model = SqlModelFactory(name="my_model", source="ref(src)")
        project = _make_project(sources=[source], models=[model])
        preview_project = deepcopy(project)

        _inject_context_objects(None, preview_project)

        assert len(preview_project.models) == 1
        assert preview_project.models[0].name == "my_model"

    def test_empty_context_objects_is_noop(self):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[])
        preview_project = deepcopy(project)

        _inject_context_objects({}, preview_project)

        assert len(preview_project.models) == 0

    def test_context_model_added_to_project(self):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[])
        preview_project = deepcopy(project)

        context_objects = {
            "models": [{"name": "ctx_model", "sql": "SELECT 1", "source": "${ref(src)}"}],
        }
        _inject_context_objects(context_objects, preview_project)

        assert len(preview_project.models) == 1
        assert preview_project.models[0].name == "ctx_model"
        assert preview_project.models[0].sql == "SELECT 1"

    def test_context_model_overrides_existing(self):
        source = SourceFactory(name="src")
        existing_model = SqlModelFactory(name="my_model", sql="SELECT old", source="ref(src)")
        project = _make_project(sources=[source], models=[existing_model])
        preview_project = deepcopy(project)

        context_objects = {
            "models": [{"name": "my_model", "sql": "SELECT new", "source": "${ref(src)}"}],
        }
        _inject_context_objects(context_objects, preview_project)

        assert len(preview_project.models) == 1
        assert preview_project.models[0].sql == "SELECT new"

    def test_context_dimensions_added(self):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[], dimensions=[])
        preview_project = deepcopy(project)

        context_objects = {
            "dimensions": [{"name": "order_month", "expression": "DATE_TRUNC('month', date)"}],
        }
        _inject_context_objects(context_objects, preview_project)

        assert len(preview_project.dimensions) == 1
        assert preview_project.dimensions[0].name == "order_month"

    def test_context_metrics_added(self):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[], metrics=[])
        preview_project = deepcopy(project)

        context_objects = {
            "metrics": [{"name": "total_rev", "expression": "SUM(amount)"}],
        }
        _inject_context_objects(context_objects, preview_project)

        assert len(preview_project.metrics) == 1
        assert preview_project.metrics[0].name == "total_rev"

    def test_context_overrides_cached_objects(self):
        source = SourceFactory(name="src")
        cached_model = SqlModelFactory(name="my_model", sql="SELECT cached", source="ref(src)")
        project = _make_project(sources=[source], models=[])
        preview_project = deepcopy(project)

        flask_app = _make_flask_app_mock(
            project, cached_overrides={"model_manager": {"my_model": cached_model}}
        )
        _inject_cached_objects(flask_app, preview_project)

        assert preview_project.models[0].sql == "SELECT cached"

        context_objects = {
            "models": [{"name": "my_model", "sql": "SELECT context", "source": "${ref(src)}"}],
        }
        _inject_context_objects(context_objects, preview_project)

        assert len(preview_project.models) == 1
        assert preview_project.models[0].sql == "SELECT context"

    def test_unknown_type_is_ignored(self):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[])
        preview_project = deepcopy(project)

        context_objects = {
            "unknown_type": [{"name": "foo"}],
        }
        _inject_context_objects(context_objects, preview_project)

        assert len(preview_project.models) == 0

    def test_multiple_types_injected(self):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[], dimensions=[], metrics=[])
        preview_project = deepcopy(project)

        context_objects = {
            "models": [{"name": "m1", "sql": "SELECT 1", "source": "${ref(src)}"}],
            "dimensions": [{"name": "d1", "expression": "col_a"}],
            "metrics": [{"name": "met1", "expression": "SUM(col_b)"}],
        }
        _inject_context_objects(context_objects, preview_project)

        assert len(preview_project.models) == 1
        assert len(preview_project.dimensions) == 1
        assert len(preview_project.metrics) == 1


class TestManagerConfig:
    def test_csv_script_model_manager_in_map(self):
        field_map = dict(MANAGER_TO_PROJECT_FIELD)
        assert "csv_script_model_manager" in field_map
        assert field_map["csv_script_model_manager"] == "csv_script_models"

    def test_local_merge_model_manager_in_map(self):
        field_map = dict(MANAGER_TO_PROJECT_FIELD)
        assert "local_merge_model_manager" in field_map
        assert field_map["local_merge_model_manager"] == "local_merge_models"

    def test_context_object_types_is_set(self):
        assert isinstance(CONTEXT_OBJECT_TYPES, (set, frozenset))
