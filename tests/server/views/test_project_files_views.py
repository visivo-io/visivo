import os
import subprocess
from unittest.mock import Mock, patch

import pytest
from flask import Flask

from visivo.server.views.project_files_views import register_project_files_views


def make_client(working_dir):
    app = Flask(__name__)
    flask_app = Mock(spec=["_working_dir"])
    flask_app._working_dir = working_dir
    register_project_files_views(app, flask_app, "/tmp/output")
    return app.test_client()


@pytest.fixture
def client(tmp_path):
    return make_client(str(tmp_path))


def write(root, relative, content=b"a,b\n1,2\n"):
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return path


def paths(response):
    return [entry["path"] for entry in response.get_json()["files"]]


def test_lists_project_relative_files_with_the_file_version_shape(tmp_path, client):
    write(tmp_path, "files/sales.csv", b"region,units\nWest,12\n")
    write(tmp_path, "data/budget.xlsx")

    response = client.get("/api/project-files/")

    assert response.status_code == 200
    body = response.get_json()
    assert [f["format"] for f in body["formats"]] == ["csv", "xlsx", "duckdb", "sqlite"]
    assert body["max_bytes"] == 100 * 1024 * 1024
    assert paths(response) == ["data/budget.xlsx", "files/sales.csv"]
    sales = body["files"][1]
    assert sales["filename"] == "sales.csv"
    assert sales["original_filename"] == "sales.csv"
    assert sales["format"] == "csv"
    assert sales["size"] == len(b"region,units\nWest,12\n")
    assert sales["version_id"] is None
    assert sales["sha256"] is None
    assert sales["created_at"].endswith("Z")


def test_ext_filters_case_insensitively(tmp_path, client):
    write(tmp_path, "a.csv")
    write(tmp_path, "b.XLSX")
    write(tmp_path, "c.parquet")
    write(tmp_path, "project.visivo.yml", b"name: p\n")

    response = client.get("/api/project-files/?ext=csv,xlsx")

    assert paths(response) == ["a.csv", "b.XLSX"]


@pytest.mark.parametrize("ext", ["../csv", "c/v", "c v", "x" * 17])
def test_bad_ext_is_an_invalid_request(client, ext):
    response = client.get(f"/api/project-files/?ext={ext}")

    assert response.status_code == 400
    assert response.get_json()["code"] == "invalid_request"


def test_skips_hidden_and_build_output(tmp_path, client):
    write(tmp_path, "keep.csv")
    write(tmp_path, ".env.csv")
    write(tmp_path, ".visivo/explorations/x.csv")
    write(tmp_path, "target/main/out.csv")
    write(tmp_path, "node_modules/pkg/data.csv")

    assert paths(client.get("/api/project-files/?ext=csv")) == ["keep.csv"]


def test_skips_symlinks_that_resolve_outside_the_root(tmp_path):
    root = tmp_path / "project"
    outside = write(tmp_path, "secret.csv")
    write(root, "inside.csv")
    os.symlink(outside, root / "escape.csv")
    os.symlink(tmp_path, root / "parent_dir")
    os.symlink(root / "inside.csv", root / "alias.csv")

    response = make_client(str(root)).get("/api/project-files/?ext=csv")

    assert paths(response) == ["alias.csv", "inside.csv"]


def test_honours_gitignore_in_a_git_project(tmp_path, client):
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    write(tmp_path, ".gitignore", b"exports/\n*.tmp.csv\n")
    write(tmp_path, "files/sales.csv")
    write(tmp_path, "exports/big.csv")
    write(tmp_path, "scratch.tmp.csv")

    assert paths(client.get("/api/project-files/?ext=csv")) == ["files/sales.csv"]


def test_works_without_git(tmp_path, client):
    write(tmp_path, "files/sales.csv")
    write(tmp_path, "target/out.csv")

    with patch("visivo.server.project_files.subprocess.run", side_effect=FileNotFoundError):
        response = client.get("/api/project-files/?ext=csv")

    assert paths(response) == ["files/sales.csv"]


def test_depth_is_limited(tmp_path, client):
    write(tmp_path, "/".join(["d"] * 8) + "/ok.csv")
    write(tmp_path, "/".join(["d"] * 9) + "/too_deep.csv")

    assert paths(client.get("/api/project-files/?ext=csv")) == ["/".join(["d"] * 8) + "/ok.csv"]


def test_lists_the_served_root_not_the_process_directory(tmp_path, monkeypatch):
    served = tmp_path / "served"
    write(served, "files/sales.csv")
    elsewhere = tmp_path / "elsewhere"
    write(elsewhere, "other.csv")
    monkeypatch.chdir(elsewhere)

    assert paths(make_client(str(served)).get("/api/project-files/?ext=csv")) == ["files/sales.csv"]


class TestUsedBy:
    """The Files page's "Used by" column: the sources, and models with an
    inline source, whose config names the file."""

    def _client(self, root, sources, models=()):
        from tests.factories.model_factories import ProjectFactory
        from visivo.server.flask_app import FlaskApp

        project = ProjectFactory(sources=list(sources), models=list(models), dashboards=[])
        return FlaskApp(root, project, working_dir=root).app.test_client()

    def _csv(self, name, file):
        from visivo.models.sources.csv_source import CSVFileSource

        return CSVFileSource(name=name, type="csv", file=file)

    def _listed(self, client):
        return {f["path"]: f for f in client.get("/api/project-files/").get_json()["files"]}

    def test_a_file_lists_each_source_that_names_it(self, tmp_path):
        root = str(tmp_path / "project")
        os.makedirs(os.path.join(root, "files"))
        for name in ("sales.csv", "unused.csv"):
            with open(os.path.join(root, "files", name), "w") as f:
                f.write("a,b\n1,2\n")
        client = self._client(
            root,
            [
                self._csv("by_relative", "./files/sales.csv"),
                self._csv("by_absolute", os.path.join(root, "files", "sales.csv")),
            ],
        )

        listed = self._listed(client)

        assert [(u["type"], u["name"]) for u in listed["files/sales.csv"]["used_by"]] == [
            ("source", "by_absolute"),
            ("source", "by_relative"),
        ]
        assert listed["files/unused.csv"]["used_by"] == []
        assert listed["files/sales.csv"]["uploaded_by"] is None

    def test_a_model_with_an_inline_source_is_a_use(self, tmp_path):
        from tests.factories.model_factories import SqlModelFactory

        root = str(tmp_path / "project")
        os.makedirs(os.path.join(root, "files"))
        with open(os.path.join(root, "files", "sales.csv"), "w") as f:
            f.write("a,b\n1,2\n")
        model = SqlModelFactory(name="orders", source=self._csv("inline", "files/sales.csv"))
        client = self._client(root, [], [model])

        used = self._listed(client)["files/sales.csv"]["used_by"]

        assert ("model", "orders") in [(u["type"], u["name"]) for u in used]

    def test_a_path_outside_the_project_is_never_a_use(self, tmp_path):
        root = str(tmp_path / "project")
        os.makedirs(os.path.join(root, "files"))
        with open(os.path.join(root, "files", "sales.csv"), "w") as f:
            f.write("a,b\n1,2\n")
        client = self._client(root, [self._csv("outside", str(tmp_path / "sales.csv"))])

        assert self._listed(client)["files/sales.csv"]["used_by"] == []
