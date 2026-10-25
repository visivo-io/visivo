import re

from visivo.models.sources.duckdb_source import DuckdbSource
import pytest
from pydantic import ValidationError


def test_DuckdbSource_simple_data():
    data = {"name": "source", "database": "database", "type": "duckdb"}
    source = DuckdbSource(**data)
    assert source.name == "source"


def test_DuckdbSource_missing_data():
    with pytest.raises(ValidationError) as exc_info:
        DuckdbSource()

    error = exc_info.value.errors()[0]

    assert error["msg"] == "Field required"
    assert error["type"] == "missing"


def test_DuckdbSource_memory_database_ignores_read_only():
    """DuckDB rejects read_only=True on ':memory:' outright ("Cannot launch
    in-memory database in read-only mode!"), but every schema/query path
    defaults to read_only=True — so a ':memory:' primary (the shape used to
    host an `attach:`ed source) could never connect at all."""
    source = DuckdbSource(name="source", database=":memory:", type="duckdb")

    connection = source.get_connection(read_only=True)
    try:
        # An in-memory database has nothing on disk for "read-only" to
        # protect — prove the connection is actually writable.
        connection.execute("CREATE TABLE t (x INTEGER)")
    finally:
        connection.close()


def test_check_database_files_exist_missing_duckdb_file(tmp_path):
    source = DuckdbSource(name="d", type="duckdb", database=str(tmp_path / "missing.duckdb"))
    with pytest.raises(FileNotFoundError, match="File not found: .*missing.duckdb"):
        source.check_database_files_exist()


def test_check_database_files_exist_missing_duckdb_attachment(tmp_path):
    import duckdb

    main = tmp_path / "main.duckdb"
    duckdb.connect(str(main)).close()
    source = DuckdbSource(
        name="d",
        type="duckdb",
        database=str(main),
        attach=[
            {
                "schema_name": "other",
                "source": {"name": "o", "type": "duckdb", "database": str(tmp_path / "nope.db")},
            }
        ],
    )
    with pytest.raises(FileNotFoundError, match="nope.db"):
        source.check_database_files_exist()


def test_check_database_files_exist_resolves_a_relative_path_in_the_project(tmp_path):
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "real.duckdb").write_bytes(b"")
    source = DuckdbSource(name="d", type="duckdb", database="data/real.duckdb")

    source.check_database_files_exist(str(tmp_path))
    with pytest.raises(FileNotFoundError, match=re.escape(f"File not found: {tmp_path / 'x'}")):
        source.check_database_files_exist(str(tmp_path / "x"))


def test_check_database_files_exist_accepts_memory_and_an_absolute_path(tmp_path):
    existing = tmp_path / "there.duckdb"
    existing.write_bytes(b"")
    DuckdbSource(name="m", type="duckdb", database=":memory:").check_database_files_exist()
    DuckdbSource(name="a", type="duckdb", database=str(existing)).check_database_files_exist(
        str(tmp_path / "elsewhere")
    )


def test_a_duckdb_attachment_is_queryable_and_listed(tmp_path):
    import duckdb

    other = tmp_path / "other.duckdb"
    with duckdb.connect(str(other)) as connection:
        connection.execute("CREATE TABLE t AS SELECT 7 AS n")
    main = tmp_path / "main.duckdb"
    duckdb.connect(str(main)).close()
    source = DuckdbSource(
        name="d",
        type="duckdb",
        database=str(main),
        attach=[
            {
                "schema_name": "other",
                "source": {"name": "o", "type": "duckdb", "database": str(other)},
            }
        ],
    )

    with source.connect(read_only=True) as connection:
        source._setup_connection(connection)
        source._setup_connection(connection)
        assert connection.execute("SELECT n FROM other.t").fetchone() == (7,)

    assert source.get_connection_dialect() == "duckdb"
    assert source.description() == f"duckdb source 'd' (database: {main})"


def test_list_databases_names_main_and_attachments(tmp_path):
    import duckdb

    other = tmp_path / "other.duckdb"
    duckdb.connect(str(other)).close()
    main = tmp_path / "main.duckdb"
    duckdb.connect(str(main)).close()
    source = DuckdbSource(
        name="d",
        type="duckdb",
        database=str(main),
        attach=[
            {
                "schema_name": "other",
                "source": {"name": "o", "type": "duckdb", "database": str(other)},
            }
        ],
    )

    databases = source.list_databases()

    assert databases[0] == "main"
    assert "other" in databases


def test_get_connection_joins_a_relative_path_to_the_working_dir(tmp_path):
    from pathlib import Path

    source = DuckdbSource(name="d", type="duckdb", database="nested/new.duckdb")

    source.get_connection(working_dir=Path(tmp_path)).close()

    assert (tmp_path / "nested" / "new.duckdb").exists()
