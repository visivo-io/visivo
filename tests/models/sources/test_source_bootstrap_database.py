"""M10: a local file-backed source must be able to create its own database.

`seeds:` on a fresh DuckDB source died with `[Errno 2] No such file or
directory: ''` — `os.path.dirname("bike.duckdb")` is `''` and `makedirs('')`
raises. Creating the identical file by hand outside Visivo made the project
work, which is exactly the escape hatch six of eight field testers used.
"""

import os

import duckdb
import polars as pl
import pytest
from sqlalchemy import text

from visivo.jobs.run_source_schema_job import run_seeds
from visivo.models.sources.duckdb_source import DuckdbSource
from visivo.models.sources.seed import Seed
from visivo.models.sources.sqlite_source import SqliteSource


def test_duckdb_bare_filename_creates_the_database_on_first_write(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    source = DuckdbSource(name="bike_db", database="bike.duckdb", type="duckdb")
    source.write_dataframe("rides", pl.DataFrame({"id": [1, 2]}))
    assert os.path.exists("bike.duckdb")
    con = duckdb.connect("bike.duckdb")
    try:
        assert con.execute("SELECT COUNT(*) FROM rides").fetchone()[0] == 2
    finally:
        con.close()


def test_duckdb_nested_path_creates_parent_directories(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    source = DuckdbSource(name="bike_db", database="nested/dir/bike.duckdb", type="duckdb")
    source.write_dataframe("rides", pl.DataFrame({"id": [1]}))
    assert os.path.exists("nested/dir/bike.duckdb")


def test_duckdb_create_empty_database_accepts_a_bare_filename(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    DuckdbSource.create_empty_database("bare.duckdb")
    assert os.path.exists("bare.duckdb")


def test_sqlite_nested_path_creates_parent_directories(tmp_path):
    db_path = str(tmp_path / "nested" / "dir" / "local.db")
    source = SqliteSource(name="local_db", database=db_path, type="sqlite")
    engine = source.get_engine()
    with engine.connect() as connection:
        connection.execute(text("CREATE TABLE t (x INTEGER)"))
        connection.commit()
    assert os.path.exists(db_path)


def test_seed_on_a_fresh_duckdb_source_creates_the_database_and_loads_the_table(
    tmp_path, monkeypatch
):
    """The full M10 repro: a four-line duckdb source whose only content is a
    seed, against a database file that does not exist yet."""
    monkeypatch.chdir(tmp_path)
    csv_path = tmp_path / "teams.csv"
    csv_path.write_text("team,wins\nnorth,10\nsouth,7\n")

    source = DuckdbSource(
        name="seeded_db",
        database="seeded.duckdb",
        type="duckdb",
        seeds=[Seed(table_name="teams", args=["cat", str(csv_path)])],
    )
    loaded = run_seeds(source, working_dir=str(tmp_path))
    assert loaded == 1
    con = duckdb.connect("seeded.duckdb")
    try:
        assert con.execute("SELECT COUNT(*) FROM teams").fetchone()[0] == 2
    finally:
        con.close()
