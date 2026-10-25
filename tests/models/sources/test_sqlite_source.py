from visivo.models.sources.sqlite_source import SqliteSource
from pydantic import ValidationError
from tests.factories.model_factories import SourceFactory
import pytest


def test_SqliteSource_simple_data():
    data = {"name": "source", "database": "database", "type": "sqlite"}
    source = SqliteSource(**data)
    assert source.name == "source"


def test_Source_missing_data():
    with pytest.raises(ValidationError) as exc_info:
        SqliteSource()

    error = exc_info.value.errors()[0]

    assert error["msg"] == "Field required"
    assert error["type"] == "missing"


def test_Source_password_json():
    source = SourceFactory(password="password")

    assert "**********" in source.model_dump_json()


def test_check_database_files_exist_missing_file(tmp_path):
    source = SqliteSource(name="s", type="sqlite", database=str(tmp_path / "missing.db"))
    with pytest.raises(FileNotFoundError, match="File not found: .*missing.db"):
        source.check_database_files_exist()


def test_check_database_files_exist_missing_attachment(tmp_path):
    import sqlite3

    main = tmp_path / "main.db"
    sqlite3.connect(main).close()
    source = SqliteSource(
        name="s",
        type="sqlite",
        database=str(main),
        attach=[
            {
                "schema_name": "other",
                "source": {
                    "name": "o",
                    "type": "sqlite",
                    "database": str(tmp_path / "nope.db"),
                },
            }
        ],
    )
    with pytest.raises(FileNotFoundError, match="nope.db"):
        source.check_database_files_exist()


def test_check_database_files_exist_accepts_existing_and_memory(tmp_path):
    import sqlite3

    existing = tmp_path / "there.db"
    sqlite3.connect(existing).close()
    SqliteSource(name="s", type="sqlite", database=str(existing)).check_database_files_exist()
    SqliteSource(name="m", type="sqlite", database=":memory:").check_database_files_exist()


def test_get_engine_still_creates_parent_for_a_new_database(tmp_path):
    target = tmp_path / "nested" / "new.db"
    source = SqliteSource(name="s", type="sqlite", database=str(target))
    source.read_sql("SELECT 1 AS x")
    assert target.exists()
