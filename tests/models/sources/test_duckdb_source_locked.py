"""M11: a DuckDB lock/config conflict must produce an actionable error.

"Can't open a connection to same database file with a different
configuration" used to surface as "Ensure the database exists and the
connection properties are correct" — unfollowable advice for a lock the
user can actually clear.
"""

import duckdb
import click
import pytest

from visivo.models.sources.duckdb_source import DuckdbSource, _is_lock_conflict


@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "warehouse.duckdb")
    con = duckdb.connect(path)
    con.execute("CREATE TABLE t (x INTEGER)")
    con.close()
    return path


def test_lock_conflict_error_names_the_source_path_and_way_out(db_path):
    source = DuckdbSource(name="warehouse", database=db_path, type="duckdb")
    holder = duckdb.connect(db_path)  # read-write hold, default config
    try:
        with pytest.raises(click.ClickException) as excinfo:
            source.get_connection(read_only=True)
        message = excinfo.value.message
        assert "warehouse" in message
        assert db_path in message
        assert "source_locked" in message
        assert "Close other connections" in message
        assert "Ensure the database exists" not in message
    finally:
        holder.close()


def test_unrelated_connect_failure_keeps_the_generic_message(tmp_path):
    # A directory where the database file should be → not a lock conflict.
    bogus = tmp_path / "a_directory"
    bogus.mkdir()
    source = DuckdbSource(name="broken", database=str(bogus), type="duckdb")
    with pytest.raises(click.ClickException) as excinfo:
        source.get_connection(read_only=True)
    assert "source_locked" not in excinfo.value.message


def test_is_lock_conflict_classification():
    assert _is_lock_conflict(duckdb.ConnectionException("boom"))
    assert _is_lock_conflict(
        Exception("Can't open a connection to same database file with a different configuration")
    )
    assert _is_lock_conflict(Exception("Conflicting lock is held by another process"))
    assert not _is_lock_conflict(Exception("no such file or directory"))
