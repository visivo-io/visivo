"""Coverage-focused behavioral tests for commit_views.

Exercises the object-type loops in the pending/changes/commit endpoints across
EVERY managed type (using real factory Pydantic models), the project-scoped
capabilities/draft endpoints, the model-scoped metric/dimension file-path
resolution in _build_child_info, the deleted-object path, and the error arms of
status/pending/discard.
"""

import pytest
from unittest.mock import Mock, patch
from flask import Flask

from tests.factories.model_factories import (
    ChartFactory,
    DashboardFactory,
    DefaultsFactory,
    DimensionFactory,
    InsightFactory,
    MetricFactory,
    MultiSelectInputFactory,
    RelationFactory,
    SourceFactory,
    SqlModelFactory,
    TableFactory,
)
from visivo.models.markdown import Markdown
from visivo.server.managers.object_manager import ObjectStatus
from visivo.server.views.commit_views import register_commit_views

# (manager attribute, pending/changes "type" string, factory for a real object)
MANAGER_SPECS = [
    ("source_manager", "source", lambda: SourceFactory()),
    ("model_manager", "model", lambda: SqlModelFactory()),
    ("dimension_manager", "dimension", lambda: DimensionFactory()),
    ("metric_manager", "metric", lambda: MetricFactory()),
    ("relation_manager", "relation", lambda: RelationFactory()),
    ("insight_manager", "insight", lambda: InsightFactory()),
    ("markdown_manager", "markdown", lambda: Markdown(name="md", content="# Hi")),
    ("chart_manager", "chart", lambda: ChartFactory()),
    ("table_manager", "table", lambda: TableFactory()),
    ("dashboard_manager", "dashboard", lambda: DashboardFactory()),
    ("input_manager", "input", lambda: MultiSelectInputFactory()),
]


@pytest.fixture
def env():
    app = Flask(__name__)
    app.config["TESTING"] = True

    flask_app = Mock()
    flask_app.project.project_file_path = "/tmp/project.yaml"
    flask_app.hot_reload_server = None
    flask_app._cached_defaults = None

    for attr, _, _ in MANAGER_SPECS:
        manager = Mock()
        manager.cached_objects = {}
        manager.published_objects = {}
        manager.has_unpublished_changes.return_value = False
        manager.get_status.return_value = ObjectStatus.PUBLISHED
        setattr(flask_app, attr, manager)

    register_commit_views(app, flask_app, "/tmp/output")
    app.flask_app = flask_app
    return app, flask_app


@pytest.fixture
def client(env):
    app, _ = env
    return app.test_client()


class TestPendingAllTypes:
    def test_lists_every_object_type_and_defaults(self, env, client):
        _, flask_app = env
        for attr, type_name, make in MANAGER_SPECS:
            manager = getattr(flask_app, attr)
            manager.cached_objects = {f"{type_name}_x": make()}
            manager.get_status.return_value = ObjectStatus.MODIFIED
        flask_app._cached_defaults = DefaultsFactory()

        data = client.get("/api/commit/pending/").get_json()

        assert data["count"] == len(MANAGER_SPECS) + 1  # +1 for defaults
        seen = {entry["type"] for entry in data["pending"]}
        expected = {type_name for _, type_name, _ in MANAGER_SPECS} | {"defaults"}
        assert seen == expected


class TestChangesEndpoint:
    def test_splits_publish_remove_and_defaults(self, env, client):
        _, flask_app = env
        flask_app.source_manager.cached_objects = {"s": SourceFactory()}
        flask_app.source_manager.get_status.return_value = ObjectStatus.NEW
        # A deleted object (None in cache) lands in to_remove.
        flask_app.model_manager.cached_objects = {"gone": None}
        flask_app.model_manager.get_status.return_value = ObjectStatus.DELETED
        flask_app._cached_defaults = DefaultsFactory()

        data = client.get("/api/projects/proj1/changes/").get_json()

        assert data["has_changes"] is True
        assert any(e["type"] == "source" for e in data["to_publish"])
        assert any(e["name"] == "defaults" for e in data["to_publish"])
        assert data["to_remove"] == [{"name": "gone", "type": "model", "status": "deleted"}]

    def test_no_changes_reports_empty(self, client):
        data = client.get("/api/projects/proj1/changes/").get_json()
        assert data == {"to_publish": [], "to_remove": [], "has_changes": False}


class TestProjectScopedContract:
    def test_capabilities_shape(self, client):
        data = client.get("/api/projects/proj1/capabilities/").get_json()
        assert data["can_edit"] is True
        assert data["can_branch"] is False
        assert data["is_draft"] is True
        assert data["draft_id"] is None

    def test_draft_echoes_project_id(self, client):
        data = client.post("/api/projects/proj1/draft/").get_json()
        assert data == {"id": "proj1", "name": "proj1"}


class TestCommitAllTypes:
    @patch("visivo.server.views.commit_views.ProjectWriter")
    def test_commit_writes_every_type_and_defaults(self, writer_cls, env, client):
        _, flask_app = env
        for attr, type_name, make in MANAGER_SPECS:
            manager = getattr(flask_app, attr)
            manager.cached_objects = {f"{type_name}_x": make()}
            manager.published_objects = {}
            manager.get_status.return_value = ObjectStatus.NEW
        flask_app._cached_defaults = DefaultsFactory()

        writer_cls.return_value = Mock()
        data = client.post("/api/commit/").get_json()

        assert data["published_count"] == len(MANAGER_SPECS) + 1
        for attr, _, _ in MANAGER_SPECS:
            getattr(flask_app, attr).clear_cache.assert_called_once()
        assert flask_app._cached_defaults is None

        # The defaults child_info is threaded to ProjectWriter with type_key.
        named_children = writer_cls.call_args[0][0]
        assert named_children["defaults"]["type_key"] == "defaults"


class TestBuildChildInfoScoping:
    @patch("visivo.server.views.commit_views.ProjectWriter")
    def test_scoped_metric_lands_in_published_parent_model_file(self, writer_cls, env, client):
        _, flask_app = env
        metric = MetricFactory()
        metric.set_parent_name("orders")
        flask_app.metric_manager.cached_objects = {"total_revenue": metric}
        flask_app.metric_manager.published_objects = {}
        flask_app.metric_manager.get_status.return_value = ObjectStatus.NEW

        parent = SqlModelFactory(name="orders")
        parent.file_path = "/tmp/models/orders.yml"
        flask_app.model_manager.published_objects = {"orders": parent}
        flask_app.model_manager.cached_objects = {}

        writer_cls.return_value = Mock()
        client.post("/api/commit/")

        child = writer_cls.call_args[0][0]["total_revenue"]
        assert child["parent_model"] == "orders"
        assert child["file_path"] == "/tmp/models/orders.yml"

    @patch("visivo.server.views.commit_views.ProjectWriter")
    def test_scoped_metric_with_new_parent_falls_back_to_project_file(
        self, writer_cls, env, client
    ):
        _, flask_app = env
        metric = MetricFactory()
        metric.set_parent_name("orders")
        flask_app.metric_manager.cached_objects = {"total_revenue": metric}
        flask_app.metric_manager.published_objects = {}
        flask_app.metric_manager.get_status.return_value = ObjectStatus.NEW

        # Parent is a brand-new model (cached, no file_path yet).
        parent = SqlModelFactory(name="orders")
        flask_app.model_manager.published_objects = {}
        flask_app.model_manager.cached_objects = {"orders": parent}

        writer_cls.return_value = Mock()
        client.post("/api/commit/")

        child = writer_cls.call_args[0][0]["total_revenue"]
        assert child["parent_model"] == "orders"
        assert child["file_path"] == "/tmp/project.yaml"

    @patch("visivo.server.views.commit_views.ProjectWriter")
    def test_scoped_metric_with_unknown_parent_uses_project_file(self, writer_cls, env, client):
        _, flask_app = env
        metric = MetricFactory()
        metric.set_parent_name("ghost")
        flask_app.metric_manager.cached_objects = {"total_revenue": metric}
        flask_app.metric_manager.published_objects = {}
        flask_app.metric_manager.get_status.return_value = ObjectStatus.NEW
        flask_app.model_manager.published_objects = {}
        flask_app.model_manager.cached_objects = {}

        writer_cls.return_value = Mock()
        client.post("/api/commit/")

        child = writer_cls.call_args[0][0]["total_revenue"]
        assert child["parent_model"] == "ghost"
        assert child["file_path"] == "/tmp/project.yaml"

    @patch("visivo.server.views.commit_views.ProjectWriter")
    def test_deleted_object_uses_published_file_path(self, writer_cls, env, client):
        _, flask_app = env
        published_source = SourceFactory()
        published_source.file_path = "/tmp/sources/db.yml"
        flask_app.source_manager.cached_objects = {"db": None}  # None ⇒ deleted
        flask_app.source_manager.published_objects = {"db": published_source}
        flask_app.source_manager.get_status.return_value = ObjectStatus.DELETED

        writer_cls.return_value = Mock()
        client.post("/api/commit/")

        child = writer_cls.call_args[0][0]["db"]
        assert child["status"] == "Deleted"
        assert child["file_path"] == "/tmp/sources/db.yml"
        assert child["config"] == {}


class TestCommitResyncErrorLogging:
    @patch("visivo.server.views.commit_views.ProjectWriter")
    def test_resync_failure_after_write_failure_is_logged(self, writer_cls, env, client):
        _, flask_app = env
        flask_app.source_manager.cached_objects = {"s": SourceFactory()}
        flask_app.source_manager.published_objects = {}
        flask_app.source_manager.get_status.return_value = ObjectStatus.NEW

        writer = Mock()
        writer.write.side_effect = RuntimeError("disk full mid-write")
        writer_cls.return_value = writer

        hot_reload = Mock()
        # The resync itself ALSO fails — that failure must be logged, not masked.
        hot_reload.on_project_change.side_effect = RuntimeError("resync also failed")
        flask_app.hot_reload_server = hot_reload

        response = client.post("/api/commit/")

        assert response.status_code == 500
        hot_reload.on_project_change.assert_called_once_with(one_shot=False)
        hot_reload.resume_file_watcher.assert_called_once()


class TestErrorArms:
    def test_status_error_returns_500(self, env, client):
        _, flask_app = env
        flask_app.source_manager.has_unpublished_changes.side_effect = RuntimeError("boom")
        response = client.get("/api/commit/status/")
        assert response.status_code == 500
        assert "boom" in response.get_json()["error"]

    def test_pending_error_returns_500(self, env, client):
        _, flask_app = env
        flask_app.source_manager.cached_objects = {"s": Mock()}
        flask_app.source_manager.get_status.side_effect = RuntimeError("status boom")
        response = client.get("/api/commit/pending/")
        assert response.status_code == 500
        assert "status boom" in response.get_json()["error"]

    def test_changes_error_returns_500(self, env, client):
        _, flask_app = env
        flask_app.source_manager.cached_objects = {"s": Mock()}
        flask_app.source_manager.get_status.side_effect = RuntimeError("changes boom")
        response = client.get("/api/projects/p/changes/")
        assert response.status_code == 500
        assert "changes boom" in response.get_json()["error"]

    def test_discard_error_returns_500(self, env, client):
        _, flask_app = env
        flask_app.source_manager.cached_objects = {"s": Mock()}
        flask_app.source_manager.get_status.side_effect = RuntimeError("discard boom")
        response = client.post("/api/commit/discard/")
        assert response.status_code == 500
        assert "discard boom" in response.get_json()["error"]
