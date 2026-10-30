"""Rename through the real API, then commit, then read the YAML (VIS-1538).

The editor saves a form's other fields under the current name and then renames.
For a source that was never committed, that used to record a rename of an object
with no YAML entry: the commit found nothing to rename, wrote nothing, and the
source was gone.
"""

import json

import pytest
import ruamel.yaml

from visivo.commands.parse_project_phase import parse_project_phase
from visivo.server.flask_app import FlaskApp

PROJECT = """\
name: rename_draft
sources:
  - name: base
    type: sqlite
    database: base.db
models:
  - name: m
    sql: select 1 as x
    source: ${ref(base)}
"""


@pytest.fixture
def project_dir(tmp_path):
    (tmp_path / "project.visivo.yml").write_text(PROJECT)
    return tmp_path


@pytest.fixture
def client(project_dir, monkeypatch):
    from visivo.server.views import run_views

    monkeypatch.setattr(run_views, "request_run", lambda app, names: None)
    monkeypatch.chdir(project_dir)
    project = parse_project_phase(
        working_dir=str(project_dir),
        output_dir=str(project_dir / "target"),
        default_source=None,
        dbt_profile=None,
        dbt_target=None,
    )
    app = FlaskApp(str(project_dir / "target"), project, working_dir=str(project_dir))
    app.app.config["TESTING"] = True
    return app.app.test_client()


def _sources_on_disk(project_dir):
    with open(project_dir / "project.visivo.yml") as handle:
        return {s["name"]: dict(s) for s in ruamel.yaml.YAML(typ="safe").load(handle)["sources"]}


def _ok(response):
    assert response.status_code in (200, 201), response.data
    return json.loads(response.data)


def _save_then_rename(client, old_name, new_name, config):
    _ok(client.post(f"/api/sources/{old_name}/", json={"name": old_name, **config}))
    _ok(
        client.post(
            "/api/rename/",
            json={"type": "sources", "old_name": old_name, "new_name": new_name},
        )
    )


def test_a_new_source_renamed_and_retyped_in_one_save_is_committed(client, project_dir):
    _ok(
        client.post(
            "/api/sources/new-source/",
            json={"name": "new-source", "type": "sqlite", "database": ":memory:"},
        )
    )

    _save_then_rename(
        client, "new-source", "warehouse", {"type": "duckdb", "database": "warehouse.duckdb"}
    )

    pending = _ok(client.get("/api/commit/pending/"))["pending"]
    assert [(p["name"], p["status"]) for p in pending] == [("warehouse", "new")]
    listed = [s["name"] for s in _ok(client.get("/api/sources/"))["sources"]]
    assert "new-source" not in listed

    _ok(client.post("/api/commit/", json={}))

    sources = _sources_on_disk(project_dir)
    assert set(sources) == {"base", "warehouse"}
    assert sources["warehouse"]["type"] == "duckdb"
    assert sources["warehouse"]["database"] == "warehouse.duckdb"
    assert not (project_dir / "new-source.db").exists()


def test_a_published_source_renamed_and_edited_in_one_save_keeps_both(client, project_dir):
    _save_then_rename(client, "base", "warehouse", {"type": "sqlite", "database": "other.db"})

    pending = _ok(client.get("/api/commit/pending/"))["pending"]
    assert {(p["name"], p["status"]) for p in pending} == {
        ("warehouse", "renamed"),
        ("m", "modified"),
    }

    _ok(client.post("/api/commit/", json={}))

    sources = _sources_on_disk(project_dir)
    assert set(sources) == {"warehouse"}
    assert sources["warehouse"]["database"] == "other.db"
    with open(project_dir / "project.visivo.yml") as handle:
        assert "${ref(warehouse)}" in handle.read()


def test_a_pure_rename_of_a_published_object_counts_as_unpublished(client):
    assert _ok(client.get("/api/commit/status/"))["has_unpublished_changes"] is False

    _ok(client.post("/api/rename/", json={"type": "models", "old_name": "m", "new_name": "n"}))

    pending = _ok(client.get("/api/commit/pending/"))["pending"]
    assert [(p["name"], p["status"]) for p in pending] == [("n", "renamed")]
    assert _ok(client.get("/api/commit/status/"))["has_unpublished_changes"] is True
