import contextlib
import sqlite3
import tempfile
from pathlib import Path

import duckdb

from visivo.commands.utils import create_source
from visivo.models.source import SourceTypeEnum


def _sqlite_table_names(path):
    with contextlib.closing(sqlite3.connect(path)) as conn:
        rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    return {row[0] for row in rows}


def _duckdb_table_names(path):
    conn = duckdb.connect(str(path))
    try:
        return {row[0] for row in conn.execute("SHOW TABLES").fetchall()}
    finally:
        conn.close()


def test_create_source_sqlite_uses_the_typed_path_verbatim():
    """B1 regression: the database path must NOT gain an extra `.db`.

    A user who types `shop.db` (as the field placeholder tells them to) used to
    get `shop.db.db` — a decoy empty database created next to the real file on
    connect.
    """
    with tempfile.TemporaryDirectory() as project_dir:
        source = create_source(
            source_name="shop",
            source_type=SourceTypeEnum.sqlite,
            database="shop.db",
            project_dir=project_dir,
        )
        assert source.database == str(Path(project_dir) / "shop.db")
        assert not source.database.endswith(".db.db")


def test_create_source_duckdb_uses_the_typed_path_verbatim():
    with tempfile.TemporaryDirectory() as project_dir:
        source = create_source(
            source_name="analytics",
            source_type=SourceTypeEnum.duckdb,
            database="warehouse.duckdb",
            project_dir=project_dir,
        )
        # Verbatim — never `warehouse.duckdb.db`.
        assert source.database == str(Path(project_dir) / "warehouse.duckdb")


def test_create_source_defaults_to_local_db_when_no_path_given():
    """The empty-path default is unchanged: a bare `local.db` in the project."""
    with tempfile.TemporaryDirectory() as project_dir:
        source = create_source(
            source_name="local",
            source_type=SourceTypeEnum.sqlite,
            database="",
            project_dir=project_dir,
        )
        assert source.database == str(Path(project_dir) / "local.db")


def test_create_source_sqlite_never_writes_tables_into_an_existing_database():
    """M9 regression: saving a source must not run DDL against the user's database.

    `create_source` used to call `create_file_database`, which wrote
    `test_table` / `second_test_table` (plus six rows each) into whatever
    database the typed path resolved to. With the B1 path fix, that lands in
    the user's REAL database on the default onboarding path.
    """
    with tempfile.TemporaryDirectory() as project_dir:
        db_path = Path(project_dir) / "shop.db"
        with contextlib.closing(sqlite3.connect(db_path)) as conn:
            conn.execute("CREATE TABLE orders (id INTEGER, total REAL)")
            conn.execute("INSERT INTO orders VALUES (1, 9.99)")
            conn.commit()
        size_before = db_path.stat().st_size

        create_source(
            source_name="shop",
            source_type=SourceTypeEnum.sqlite,
            database="shop.db",
            project_dir=project_dir,
        )

        assert _sqlite_table_names(db_path) == {"orders"}
        assert db_path.stat().st_size == size_before
        with contextlib.closing(sqlite3.connect(db_path)) as conn:
            assert conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0] == 1


def test_create_source_duckdb_never_writes_tables_into_an_existing_database():
    with tempfile.TemporaryDirectory() as project_dir:
        db_path = Path(project_dir) / "warehouse.duckdb"
        conn = duckdb.connect(str(db_path))
        conn.execute("CREATE TABLE readings (site VARCHAR, value DOUBLE)")
        conn.execute("INSERT INTO readings VALUES ('north', 1.5)")
        conn.close()

        create_source(
            source_name="analytics",
            source_type=SourceTypeEnum.duckdb,
            database="warehouse.duckdb",
            project_dir=project_dir,
        )

        assert _duckdb_table_names(db_path) == {"readings"}


def test_create_source_sqlite_creates_an_empty_database_when_the_file_is_missing():
    """A brand-new file source still gets its file created — just with no tables."""
    with tempfile.TemporaryDirectory() as project_dir:
        source = create_source(
            source_name="fresh",
            source_type=SourceTypeEnum.sqlite,
            database="fresh.db",
            project_dir=project_dir,
        )
        db_path = Path(source.database)
        assert db_path.exists()
        assert _sqlite_table_names(db_path) == set()


def test_create_source_duckdb_creates_an_empty_database_when_the_file_is_missing():
    with tempfile.TemporaryDirectory() as project_dir:
        source = create_source(
            source_name="fresh",
            source_type=SourceTypeEnum.duckdb,
            database="fresh.duckdb",
            project_dir=project_dir,
        )
        db_path = Path(source.database)
        assert db_path.exists()
        assert _duckdb_table_names(db_path) == set()


def test_create_source_sqlite_creates_missing_parent_directories():
    """A wizard entry like `data/shop.db` must not 500 on a missing `data/`."""
    with tempfile.TemporaryDirectory() as project_dir:
        source = create_source(
            source_name="nested",
            source_type=SourceTypeEnum.sqlite,
            database="data/shop.db",
            project_dir=project_dir,
        )
        db_path = Path(source.database)
        assert db_path.exists()
        assert _sqlite_table_names(db_path) == set()
