import os

import pytest

from visivo.models.sources.csv_source import CSVFileSource
from visivo.models.sources.project_root import resolve_project_path, set_project_root


@pytest.fixture(autouse=True)
def reset_project_root():
    yield
    set_project_root(None)


def test_relative_paths_resolve_against_the_project_root(tmp_path):
    set_project_root(str(tmp_path))

    assert resolve_project_path("files/a.csv") == os.path.join(str(tmp_path), "files/a.csv")
    assert resolve_project_path("/abs/a.csv") == "/abs/a.csv"


def test_without_a_root_paths_are_unchanged():
    assert resolve_project_path("files/a.csv") == "files/a.csv"


def test_a_csv_source_reads_its_file_from_another_working_directory(tmp_path, monkeypatch):
    project = tmp_path / "project"
    (project / "files").mkdir(parents=True)
    (project / "files" / "sales.csv").write_text("region,units\nWest,12\n")
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    monkeypatch.chdir(elsewhere)
    set_project_root(str(project))

    source = CSVFileSource(name="sales", type="csv", file="files/sales.csv")

    assert source.read_sql('SELECT units FROM "sales"') == [{"units": 12}]
