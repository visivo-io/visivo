import pytest
from unittest.mock import Mock
from flask import Flask

from visivo.server.views.exploration_views import register_exploration_views


class TestExplorationViews:

    @pytest.fixture
    def app(self):
        app = Flask(__name__)
        app.config["TESTING"] = True

        flask_app = Mock()
        flask_app.exploration_repo = Mock()

        register_exploration_views(app, flask_app, "/tmp/output")

        app.flask_app = flask_app
        return app

    @pytest.fixture
    def client(self, app):
        return app.test_client()

    def test_list_explorations(self, client, app):
        app.flask_app.exploration_repo.list_explorations.return_value = [
            {"id": "1", "name": "Test", "sql": "SELECT 1"},
        ]

        response = client.get("/api/explorations/")
        assert response.status_code == 200
        data = response.get_json()
        assert len(data) == 1
        assert data[0]["name"] == "Test"

    def test_create_exploration(self, client, app):
        app.flask_app.exploration_repo.create_exploration.return_value = {
            "id": "new-id",
            "name": "My Exploration",
        }

        response = client.post(
            "/api/explorations/",
            json={"name": "My Exploration"},
        )
        assert response.status_code == 201
        data = response.get_json()
        assert data["name"] == "My Exploration"
        app.flask_app.exploration_repo.create_exploration.assert_called_once_with(
            name="My Exploration"
        )

    def test_create_exploration_default_name(self, client, app):
        app.flask_app.exploration_repo.create_exploration.return_value = {
            "id": "new-id",
            "name": "Untitled",
        }

        response = client.post("/api/explorations/", json={})
        assert response.status_code == 201
        app.flask_app.exploration_repo.create_exploration.assert_called_once_with(name="Untitled")

    def test_get_exploration(self, client, app):
        app.flask_app.exploration_repo.get_exploration.return_value = {
            "id": "1",
            "name": "Test",
        }

        response = client.get("/api/explorations/1/")
        assert response.status_code == 200
        data = response.get_json()
        assert data["id"] == "1"

    def test_get_nonexistent_returns_404(self, client, app):
        app.flask_app.exploration_repo.get_exploration.return_value = None

        response = client.get("/api/explorations/nonexistent/")
        assert response.status_code == 404

    def test_update_exploration(self, client, app):
        app.flask_app.exploration_repo.update_exploration.return_value = {
            "id": "1",
            "name": "Updated",
            "sql": "SELECT 2",
        }

        response = client.put(
            "/api/explorations/1/",
            json={"name": "Updated", "sql": "SELECT 2"},
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["name"] == "Updated"

    def test_update_nonexistent_returns_404(self, client, app):
        app.flask_app.exploration_repo.update_exploration.return_value = None

        response = client.put(
            "/api/explorations/nonexistent/",
            json={"name": "Updated"},
        )
        assert response.status_code == 404

    def test_update_empty_json_returns_400(self, client, app):
        response = client.put(
            "/api/explorations/1/",
            json=None,
        )
        assert response.status_code == 400

    def test_delete_exploration(self, client, app):
        app.flask_app.exploration_repo.delete_exploration.return_value = True

        response = client.delete("/api/explorations/1/")
        assert response.status_code == 200

    def test_delete_nonexistent_returns_404(self, client, app):
        app.flask_app.exploration_repo.delete_exploration.return_value = False

        response = client.delete("/api/explorations/nonexistent/")
        assert response.status_code == 404

    def test_list_explorations_error_returns_500(self, client, app):
        app.flask_app.exploration_repo.list_explorations.side_effect = Exception("DB error")

        response = client.get("/api/explorations/")
        assert response.status_code == 500
