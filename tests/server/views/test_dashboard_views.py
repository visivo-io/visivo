"""Tests for dashboard API endpoints (focused on the rename surface added in VIS-749)."""

import pytest
from unittest.mock import Mock
from flask import Flask

from visivo.server.views.dashboard_views import register_dashboard_views
from visivo.server.managers.object_manager import ObjectStatus


class TestDashboardRenameEndpoint:
    """Tests for POST /api/dashboards/<name>/rename/ and the preview endpoint."""

    @pytest.fixture
    def app(self):
        app = Flask(__name__)
        app.config["TESTING"] = True

        flask_app = Mock()
        flask_app.dashboard_manager = Mock()
        flask_app.dashboard_manager.cached_objects = {}
        flask_app.dashboard_manager.published_objects = {}

        register_dashboard_views(app, flask_app, "/tmp/output")

        app.flask_app = flask_app
        return app

    @pytest.fixture
    def client(self, app):
        return app.test_client()

    # ---------- /rename/ ----------

    def test_rename_success(self, client, app):
        renamed = Mock()
        renamed.name = "new-dashboard"
        app.flask_app.dashboard_manager.rename.return_value = renamed
        app.flask_app.dashboard_manager.get_status.return_value = ObjectStatus.NEW

        response = client.post(
            "/api/dashboards/old-dashboard/rename/",
            json={"new_name": "new-dashboard"},
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["old_name"] == "old-dashboard"
        assert data["new_name"] == "new-dashboard"
        assert data["status"] == "new"
        assert data["rewritten_ref_count"] == 0
        app.flask_app.dashboard_manager.rename.assert_called_once_with(
            "old-dashboard", "new-dashboard"
        )

    def test_rename_missing_new_name_returns_400(self, client, app):
        response = client.post(
            "/api/dashboards/old/rename/",
            json={},
            content_type="application/json",
        )
        assert response.status_code == 400
        assert "new_name is required" in response.get_json()["error"]
        app.flask_app.dashboard_manager.rename.assert_not_called()

    def test_rename_blank_new_name_returns_400(self, client, app):
        response = client.post(
            "/api/dashboards/old/rename/",
            json={"new_name": "   "},
            content_type="application/json",
        )
        assert response.status_code == 400
        app.flask_app.dashboard_manager.rename.assert_not_called()

    def test_rename_nonexistent_returns_404(self, client, app):
        app.flask_app.dashboard_manager.rename.return_value = None

        response = client.post(
            "/api/dashboards/missing/rename/",
            json={"new_name": "anything"},
            content_type="application/json",
        )
        assert response.status_code == 404
        assert "not found" in response.get_json()["error"]

    def test_rename_collision_returns_400(self, client, app):
        app.flask_app.dashboard_manager.rename.side_effect = ValueError(
            "another object already uses that name"
        )

        response = client.post(
            "/api/dashboards/old/rename/",
            json={"new_name": "taken"},
            content_type="application/json",
        )
        assert response.status_code == 400
        assert "already uses that name" in response.get_json()["error"]

    def test_rename_same_name_returns_400(self, client, app):
        app.flask_app.dashboard_manager.rename.side_effect = ValueError(
            "New name must be different from the old name"
        )

        response = client.post(
            "/api/dashboards/old/rename/",
            json={"new_name": "old"},
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_rename_strips_whitespace(self, client, app):
        renamed = Mock()
        renamed.name = "trimmed"
        app.flask_app.dashboard_manager.rename.return_value = renamed
        app.flask_app.dashboard_manager.get_status.return_value = ObjectStatus.NEW

        response = client.post(
            "/api/dashboards/old/rename/",
            json={"new_name": "  trimmed  "},
            content_type="application/json",
        )

        assert response.status_code == 200
        # The endpoint should pass the trimmed name to the manager.
        app.flask_app.dashboard_manager.rename.assert_called_once_with("old", "trimmed")

    # ---------- /preview-rename/ ----------

    def test_preview_rename_valid(self, client, app):
        # Source exists, destination is free.
        app.flask_app.dashboard_manager.get.return_value = Mock()
        app.flask_app.dashboard_manager.cached_objects = {}
        app.flask_app.dashboard_manager.published_objects = {"old": Mock()}

        response = client.get("/api/dashboards/old/preview-rename/?new_name=new")

        assert response.status_code == 200
        data = response.get_json()
        assert data["valid"] is True
        assert data["rewritten_ref_count"] == 0

    def test_preview_rename_missing_new_name_returns_400(self, client, app):
        response = client.get("/api/dashboards/old/preview-rename/")
        assert response.status_code == 400
        assert "new_name query parameter is required" in response.get_json()["error"]

    def test_preview_rename_source_missing_returns_404(self, client, app):
        app.flask_app.dashboard_manager.get.return_value = None

        response = client.get("/api/dashboards/missing/preview-rename/?new_name=anything")
        assert response.status_code == 404

    def test_preview_rename_same_name_invalid(self, client, app):
        app.flask_app.dashboard_manager.get.return_value = Mock()

        response = client.get("/api/dashboards/foo/preview-rename/?new_name=foo")
        assert response.status_code == 200
        data = response.get_json()
        assert data["valid"] is False
        assert "different" in data["error"]

    def test_preview_rename_collision_with_published(self, client, app):
        app.flask_app.dashboard_manager.get.return_value = Mock()
        app.flask_app.dashboard_manager.cached_objects = {}
        app.flask_app.dashboard_manager.published_objects = {
            "old": Mock(),
            "taken": Mock(),
        }

        response = client.get("/api/dashboards/old/preview-rename/?new_name=taken")

        assert response.status_code == 200
        data = response.get_json()
        assert data["valid"] is False
        assert "already used" in data["error"]

    def test_preview_rename_collision_with_cached(self, client, app):
        app.flask_app.dashboard_manager.get.return_value = Mock()
        app.flask_app.dashboard_manager.cached_objects = {"taken": Mock()}
        app.flask_app.dashboard_manager.published_objects = {"old": Mock()}

        response = client.get("/api/dashboards/old/preview-rename/?new_name=taken")

        assert response.status_code == 200
        data = response.get_json()
        assert data["valid"] is False

    def test_preview_rename_destination_marked_for_deletion_is_free(self, client, app):
        """If the destination is marked for deletion (None in cache), preview
        treats the name as taken because the *published* entry still exists.
        Mirrors the rename endpoint's conservative collision check."""
        app.flask_app.dashboard_manager.get.return_value = Mock()
        app.flask_app.dashboard_manager.cached_objects = {"taken": None}
        app.flask_app.dashboard_manager.published_objects = {
            "old": Mock(),
            "taken": Mock(),
        }

        response = client.get("/api/dashboards/old/preview-rename/?new_name=taken")

        assert response.status_code == 200
        data = response.get_json()
        # The published entry still exists, so this is treated as taken.
        assert data["valid"] is False
