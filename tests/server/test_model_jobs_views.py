"""/api/model-jobs/ — a model's built data as a file reference.

The third member of the deploy-artifact family (insight-jobs, input-jobs), and
the reason it exists: the older /api/models/<name>/data/ reads the parquet
server-side and inlines up to 10k rows, so the server pays the memory, the rows
are silently truncated, and in cloud the bytes travel back through the API
instead of being fetched from storage. Every other artifact type hands back a
URL; this makes models consistent.
"""

import json
import os

import pytest

from visivo.server.flask_app import FlaskApp
from tests.factories.model_factories import ProjectFactory


@pytest.fixture
def client(tmp_path):
    project = ProjectFactory.build()
    output_dir = str(tmp_path / "target")
    os.makedirs(os.path.join(output_dir, "main", "models"), exist_ok=True)
    app = FlaskApp(output_dir=output_dir, project=project).app
    app.config["TESTING"] = True
    return app.test_client(), output_dir


def _write_parquet(output_dir, name, run_id="main"):
    path = os.path.join(output_dir, run_id, "models", f"{name}.parquet")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "wb").write(b"PAR1")  # contents never read — only existence
    return path


def test_returns_a_file_reference_not_the_rows(client):
    """The whole point: a URL the client fetches, never inlined data."""
    c, output_dir = client
    _write_parquet(output_dir, "orders")

    resp = c.get("/api/model-jobs/?project_id=p1&model_names=orders")

    assert resp.status_code == 200
    body = json.loads(resp.data)
    assert body == [
        {
            "id": "orders",
            "name": "orders",
            "signed_data_file_url": "/api/files/orders/main/",
        }
    ]
    assert "rows" not in json.dumps(body)


def test_several_models_in_one_call(client):
    c, output_dir = client
    _write_parquet(output_dir, "orders")
    _write_parquet(output_dir, "users")

    resp = c.get("/api/model-jobs/?model_names=orders&model_names=users")

    assert resp.status_code == 200
    assert sorted(j["name"] for j in json.loads(resp.data)) == ["orders", "users"]


def test_a_model_with_no_built_data_is_omitted_not_an_error(client):
    """Never run, or run before the model existed — a normal state, so the
    models that DO have data still come back."""
    c, output_dir = client
    _write_parquet(output_dir, "orders")

    resp = c.get("/api/model-jobs/?model_names=orders&model_names=never_run")

    assert resp.status_code == 200
    assert [j["name"] for j in json.loads(resp.data)] == ["orders"]


def test_404_only_when_nothing_was_found(client):
    c, _ = client
    resp = c.get("/api/model-jobs/?model_names=never_run")
    assert resp.status_code == 404
    assert "never_run" in json.loads(resp.data)["error"]


def test_model_names_is_required(client):
    c, _ = client
    resp = c.get("/api/model-jobs/")
    assert resp.status_code == 400
    assert "model_names" in json.loads(resp.data)["error"]


def test_run_id_selects_the_run(client):
    c, output_dir = client
    _write_parquet(output_dir, "orders", run_id="preview-x")

    assert c.get("/api/model-jobs/?model_names=orders").status_code == 404
    resp = c.get("/api/model-jobs/?model_names=orders&run_id=preview-x")
    assert resp.status_code == 200
    assert json.loads(resp.data)[0]["signed_data_file_url"] == "/api/files/orders/preview-x/"


def test_project_id_is_accepted_and_ignored(client):
    """This server has one project; cloud requires the param and the viewer is
    the same code in both, so it must not be rejected here."""
    c, output_dir = client
    _write_parquet(output_dir, "orders")

    assert c.get("/api/model-jobs/?model_names=orders&project_id=whatever").status_code == 200
