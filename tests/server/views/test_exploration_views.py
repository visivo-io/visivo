"""Flask test-client coverage for the Exploration CRUD endpoints (S3 contract).

Uses a REAL ExplorationRepository backed by a tmp dir (not a mock) mounted
behind a bare Flask app, per the "prefer factories/real objects over mocking"
convention — the repository is cheap and deterministic, so mocking it would
only hide real serialization/validation bugs.
"""

import pytest
from flask import Flask

from visivo.server.repositories.exploration_repository import ExplorationRepository
from visivo.server.views.exploration_views import register_exploration_views


@pytest.fixture
def app(tmp_path):
    app = Flask(__name__)
    app.config["TESTING"] = True

    flask_app = type("FlaskAppStub", (), {})()
    flask_app.exploration_repo = ExplorationRepository(str(tmp_path / ".visivo" / "explorations"))

    register_exploration_views(app, flask_app, str(tmp_path))
    app.flask_app = flask_app
    return app


@pytest.fixture
def client(app):
    return app.test_client()


class TestList:
    def test_list_empty(self, client):
        resp = client.get("/api/explorations/")
        assert resp.status_code == 200
        assert resp.get_json() == []

    def test_list_returns_created_explorations(self, client):
        client.post("/api/explorations/", json={"name": "A"})
        client.post("/api/explorations/", json={"name": "B"})
        resp = client.get("/api/explorations/")
        assert resp.status_code == 200
        names = {e["name"] for e in resp.get_json()}
        assert names == {"A", "B"}

    def test_list_ordered_by_updated_at_desc(self, client):
        first = client.post("/api/explorations/", json={"name": "First"}).get_json()
        client.post("/api/explorations/", json={"name": "Second"})
        client.post(f"/api/explorations/{first['id']}/", json={"name": "First touched"})

        resp = client.get("/api/explorations/")
        data = resp.get_json()
        assert data[0]["id"] == first["id"]


class TestCreate:
    def test_create_returns_201_with_minted_id(self, client):
        resp = client.post("/api/explorations/", json={"name": "My Exploration"})
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["name"] == "My Exploration"
        assert data["id"].startswith("exp_")

    def test_create_no_body_defaults_name_to_scratch(self, client):
        resp = client.post("/api/explorations/", content_type="application/json")
        assert resp.status_code == 201
        assert resp.get_json()["name"] == "Scratch"

    def test_create_empty_json_object_defaults_name(self, client):
        resp = client.post("/api/explorations/", json={})
        assert resp.status_code == 201
        assert resp.get_json()["name"] == "Scratch"

    def test_create_second_defaults_to_exploration_2(self, client):
        client.post("/api/explorations/", json={})
        resp = client.post("/api/explorations/", json={})
        assert resp.get_json()["name"] == "Exploration 2"

    def test_create_with_seeded_from(self, client):
        resp = client.post(
            "/api/explorations/",
            json={"seeded_from": {"type": "model", "name": "orders"}},
        )
        assert resp.status_code == 201
        assert resp.get_json()["seeded_from"] == {"type": "model", "name": "orders"}

    def test_create_with_draft(self, client):
        resp = client.post(
            "/api/explorations/",
            json={
                "draft": {
                    "queries": [{"name": "q1", "sql": "SELECT 1", "source": "warehouse"}],
                    "insights": [{"anything": "goes"}],
                }
            },
        )
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["draft"]["queries"][0]["name"] == "q1"
        assert data["draft"]["insights"] == [{"anything": "goes"}]

    def test_create_non_object_body_is_malformed(self, client):
        resp = client.post("/api/explorations/", data="[1, 2, 3]", content_type="application/json")
        assert resp.status_code == 400
        assert "error" in resp.get_json()

    def test_create_malformed_draft_shape_is_400(self, client):
        resp = client.post("/api/explorations/", json={"draft": "not an object"})
        assert resp.status_code == 400
        assert "error" in resp.get_json()

    def test_create_query_missing_required_field_is_400(self, client):
        resp = client.post(
            "/api/explorations/",
            json={"draft": {"queries": [{"name": "missing_sql"}]}},
        )
        assert resp.status_code == 400

    def test_create_never_validates_insight_draft_content(self, client):
        # Deliberately semantically-invalid insight config — must still 201.
        resp = client.post(
            "/api/explorations/",
            json={"draft": {"insights": [{"type": "bar", "missing_everything_else": True}]}},
        )
        assert resp.status_code == 201


class TestGetOne:
    def test_get_existing(self, client):
        created = client.post("/api/explorations/", json={"name": "Get me"}).get_json()
        resp = client.get(f"/api/explorations/{created['id']}/")
        assert resp.status_code == 200
        assert resp.get_json()["id"] == created["id"]

    def test_get_missing_is_404(self, client):
        resp = client.get("/api/explorations/exp_missing/")
        assert resp.status_code == 404
        assert "error" in resp.get_json()


class TestUpdate:
    def test_update_name(self, client):
        created = client.post("/api/explorations/", json={"name": "Old"}).get_json()
        resp = client.post(f"/api/explorations/{created['id']}/", json={"name": "New"})
        assert resp.status_code == 200
        assert resp.get_json()["name"] == "New"

    def test_update_draft(self, client):
        created = client.post("/api/explorations/", json={}).get_json()
        resp = client.post(
            f"/api/explorations/{created['id']}/",
            json={"draft": {"queries": [{"name": "q", "sql": "SELECT 2"}]}},
        )
        assert resp.status_code == 200
        assert resp.get_json()["draft"]["queries"][0]["sql"] == "SELECT 2"

    def test_update_missing_is_404(self, client):
        resp = client.post("/api/explorations/exp_missing/", json={"name": "x"})
        assert resp.status_code == 404

    def test_update_no_body_is_400(self, client):
        created = client.post("/api/explorations/", json={}).get_json()
        resp = client.post(f"/api/explorations/{created['id']}/", content_type="application/json")
        assert resp.status_code == 400

    def test_update_non_object_body_is_400(self, client):
        created = client.post("/api/explorations/", json={}).get_json()
        resp = client.post(
            f"/api/explorations/{created['id']}/",
            data='"just a string"',
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_update_ignores_immutable_fields(self, client):
        created = client.post(
            "/api/explorations/",
            json={"seeded_from": {"type": "model", "name": "orders"}},
        ).get_json()
        resp = client.post(
            f"/api/explorations/{created['id']}/",
            json={
                "id": "exp_hijacked",
                "created_at": "2000-01-01T00:00:00Z",
                "seeded_from": {"type": "model", "name": "hijacked"},
                "promoted": [
                    {"type": "metric", "name": "hijacked", "promoted_at": "2000-01-01T00:00:00Z"}
                ],
                "name": "Renamed",
            },
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["id"] == created["id"]
        assert data["created_at"] == created["created_at"]
        assert data["seeded_from"] == {"type": "model", "name": "orders"}
        assert data["promoted"] == []
        assert data["name"] == "Renamed"


class TestDelete:
    def test_delete_existing_returns_204(self, client):
        created = client.post("/api/explorations/", json={}).get_json()
        resp = client.delete(f"/api/explorations/{created['id']}/")
        assert resp.status_code == 204
        assert resp.get_data() == b""
        assert client.get(f"/api/explorations/{created['id']}/").status_code == 404

    def test_delete_missing_returns_404(self, client):
        resp = client.delete("/api/explorations/exp_missing/")
        assert resp.status_code == 404


class TestConsumeReturnTo:
    def test_consume_nulls_return_to(self, client):
        created = client.post(
            "/api/explorations/",
            json={"return_to": {"dashboard": "kpis", "slot": "r1-i1"}},
        ).get_json()
        assert created["return_to"] == {"dashboard": "kpis", "slot": "r1-i1"}

        resp = client.post(f"/api/explorations/{created['id']}/consume-return-to/")
        assert resp.status_code == 200
        assert resp.get_json()["return_to"] is None

        # Survives being re-fetched — the null persisted, not just the response.
        assert client.get(f"/api/explorations/{created['id']}/").get_json()["return_to"] is None

    def test_consume_missing_is_404(self, client):
        resp = client.post("/api/explorations/exp_missing/consume-return-to/")
        assert resp.status_code == 404

    def test_consume_idempotent(self, client):
        created = client.post("/api/explorations/", json={}).get_json()
        assert created["return_to"] is None
        resp = client.post(f"/api/explorations/{created['id']}/consume-return-to/")
        assert resp.status_code == 200
        assert resp.get_json()["return_to"] is None
