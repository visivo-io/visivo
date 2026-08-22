import tempfile
from pathlib import Path

from visivo.commands.utils import create_source
from visivo.models.source import SourceTypeEnum


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
