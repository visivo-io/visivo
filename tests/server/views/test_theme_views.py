from flask import Flask

from tests.factories.model_factories import ProjectFactory, ThemeFactory
from visivo.models.theme import Theme
from visivo.server.views.theme_views import register_theme_views


class FakeFlaskApp:
    def __init__(self, project):
        self.project = project
        self._cached_theme = None


def _client(project=None):
    app = Flask(__name__)
    flask_app = FakeFlaskApp(project or ProjectFactory())
    register_theme_views(app, flask_app)
    return app.test_client(), flask_app


def test_get_is_empty_when_project_has_no_theme():
    client, _ = _client()
    response = client.get("/api/theme/")
    assert response.status_code == 200
    assert response.get_json() == {}


def test_get_returns_published_theme():
    client, _ = _client(ProjectFactory(theme=ThemeFactory()))
    assert client.get("/api/theme/").get_json()["mode"] == "dark"


def test_get_prefers_the_draft_over_the_published_theme():
    client, flask_app = _client(ProjectFactory(theme=ThemeFactory()))
    flask_app._cached_theme = Theme(mode="auto")
    assert client.get("/api/theme/").get_json()["mode"] == "auto"


def test_post_caches_a_valid_theme_as_a_draft():
    client, flask_app = _client()
    response = client.post("/api/theme/", json={"mode": "dark", "dark": {"accent": "#c98aab"}})
    assert response.status_code == 200
    assert flask_app._cached_theme.dark.accent == "#c98aab"
    assert flask_app.project.theme is None


def test_post_rejects_an_invalid_theme_without_caching_it():
    client, flask_app = _client()
    response = client.post("/api/theme/", json={"dark": {"surface": "navy"}})
    assert response.status_code == 400
    assert "dark.surface" in response.get_json()["error"]
    assert flask_app._cached_theme is None


def test_post_requires_a_json_object():
    client, _ = _client()
    assert client.post("/api/theme/", json=["dark"]).status_code == 400
    assert client.post("/api/theme/", content_type="application/json").status_code == 400
