"""Flask test-client coverage for the stateless insight compile-draft
endpoint (Explore 2.0 Phase 4, S2's resolved design). Uses a minimal Flask-app
STUB (`.project` only) behind a bare Flask app — mirrors
`test_exploration_views.py`'s "prefer real objects over mocking" convention;
`inject_cached_objects` skips every manager it can't find via `getattr`, so a
stub with no managers is a faithful "nothing cached" state.
"""

import json

import pytest
from flask import Flask

from tests.factories.model_factories import SourceFactory, SqlModelFactory
from visivo.models.project import Project
from visivo.server.views.insight_compile_views import register_insight_compile_views


class FlaskAppStub:
    def __init__(self, project):
        self.project = project


@pytest.fixture
def project_with_model():
    source = SourceFactory(name="warehouse")
    model = SqlModelFactory(name="orders_q", sql="select * from orders", source="ref(warehouse)")
    return Project(name="test_project", sources=[source], models=[model])


@pytest.fixture
def app(tmp_path, project_with_model):
    app = Flask(__name__)
    app.config["TESTING"] = True
    flask_app_stub = FlaskAppStub(project_with_model)
    register_insight_compile_views(app, flask_app_stub, str(tmp_path))
    app.flask_app = flask_app_stub
    return app


@pytest.fixture
def client(app):
    return app.test_client()


def insight_payload(name="draft_insight", model_name="orders_q"):
    return {
        "insight": {
            "name": name,
            "props": {
                "type": "scatter",
                "x": f"?{{${{ref({model_name}).region}}}}",
                "y": f"?{{sum(${{ref({model_name}).amount}})}}",
            },
        }
    }


def write_schema(tmp_path, model_name, model_hash, columns):
    schema_dir = tmp_path / "main" / "schemas" / model_name
    schema_dir.mkdir(parents=True)
    (schema_dir / "schema.json").write_text(json.dumps({model_hash: columns}))


class TestCompileDraftHappyPath:
    def test_returns_query_info_for_an_already_published_model(self, client, tmp_path):
        from visivo.models.base.named_model import alpha_hash

        write_schema(
            tmp_path, "orders_q", alpha_hash("orders_q"), {"region": "VARCHAR", "amount": "DOUBLE"}
        )
        resp = client.post("/api/insight-compile-draft/", json=insight_payload())
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["post_query"] is not None
        assert data["pre_query"] is None
        assert data["type"] == "scatter"
        assert {"name": "orders_q", "name_hash": alpha_hash("orders_q")} in data["models"]

    def test_never_writes_to_disk_or_the_output_dir(self, client, tmp_path):
        from visivo.models.base.named_model import alpha_hash

        write_schema(
            tmp_path, "orders_q", alpha_hash("orders_q"), {"region": "VARCHAR", "amount": "DOUBLE"}
        )
        before = set(tmp_path.rglob("*"))
        client.post("/api/insight-compile-draft/", json=insight_payload())
        after = set(tmp_path.rglob("*"))
        assert before == after


class TestCompileDraftScratchModel:
    def test_a_brand_new_scratch_model_with_no_schema_returns_graceful_422(self, client):
        resp = client.post(
            "/api/insight-compile-draft/",
            json={
                **insight_payload(model_name="cohort_q"),
                "draft_models": [
                    {
                        "name": "cohort_q",
                        "sql": "select * from cohorts",
                        "source": "${ref(warehouse)}",
                    }
                ],
            },
        )
        assert resp.status_code == 422
        data = resp.get_json()
        assert data["error_type"] == "model_not_run"
        assert data["model"] == "cohort_q"
        assert "error" in data

    def test_client_supplied_model_schemas_close_the_gap(self, client):
        resp = client.post(
            "/api/insight-compile-draft/",
            json={
                **insight_payload(model_name="cohort_q"),
                "draft_models": [
                    {
                        "name": "cohort_q",
                        "sql": "select * from cohorts",
                        "source": "${ref(warehouse)}",
                    }
                ],
                "model_schemas": {"cohort_q": {"region": "VARCHAR", "amount": "DOUBLE"}},
            },
        )
        assert resp.status_code == 200
        assert resp.get_json()["post_query"] is not None


class TestCompileDraftValidation:
    def test_missing_body_is_400(self, client):
        resp = client.post("/api/insight-compile-draft/", content_type="application/json")
        assert resp.status_code == 400

    def test_non_object_body_is_400(self, client):
        resp = client.post(
            "/api/insight-compile-draft/", data="[1,2]", content_type="application/json"
        )
        assert resp.status_code == 400

    def test_missing_insight_is_400(self, client):
        resp = client.post("/api/insight-compile-draft/", json={})
        assert resp.status_code == 400

    def test_insight_missing_name_is_400(self, client):
        resp = client.post(
            "/api/insight-compile-draft/", json={"insight": {"props": {"type": "scatter"}}}
        )
        assert resp.status_code == 400

    def test_invalid_insight_config_is_400(self, client):
        resp = client.post(
            "/api/insight-compile-draft/",
            json={"insight": {"name": "bad", "props": {"type": "not-a-real-chart-type"}}},
        )
        assert resp.status_code == 400

    def test_invalid_draft_model_is_400(self, client):
        resp = client.post(
            "/api/insight-compile-draft/",
            json={**insight_payload(), "draft_models": [{"name": "missing_required_fields"}]},
        )
        assert resp.status_code == 400

    def test_ref_to_a_nonexistent_model_is_400(self, client):
        resp = client.post(
            "/api/insight-compile-draft/",
            json=insight_payload(model_name="totally_made_up_model"),
        )
        assert resp.status_code == 400


# The run-isolation regression (this endpoint must never schedule a run) is
# covered in tests/server/test_run_views.py, alongside the sibling
# `TestExplorationRunIsolation` class — it needs `run_views.py`'s hooks
# mounted on the SAME Flask app (via the shared `integration_app`/
# `integration_client` fixtures), which this file's minimal stub app
# deliberately doesn't carry.
