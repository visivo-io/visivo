import pytest
from unittest.mock import MagicMock
from copy import deepcopy

from visivo.server.jobs.preview_job_executor import _inject_cached_objects, MANAGER_TO_PROJECT_FIELD
from tests.factories.model_factories import (
    ProjectFactory,
    SqlModelFactory,
    SourceFactory,
    InsightFactory,
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
