"""Schema scanning in ``SqlalchemySource.get_schema``.

Three behaviours, each of which was a real failure against a live Postgres
source before it was fixed:

* every non-system schema is scanned, not just the connection's default —
  otherwise a database whose tables live in a named schema reports "no tables"
  while ``public`` is legitimately empty;
* columns are reflected per SCHEMA rather than per TABLE, because per-table
  reflection measured ~1.9s/table against a remote warehouse (a 186-table
  schema took ~6 minutes and callers gave up first);
* when reflection fails the result says so. The bug these replace returned an
  empty schema on failure, which is indistinguishable from an empty database.
"""

import sqlite3

import pytest

from visivo.models.sources.sqlite_source import SqliteSource


@pytest.fixture
def sqlite_source(tmp_path):
    """A two-table SQLite source. SQLite has one schema (``main``), which is
    also its default — so it exercises the default-schema key shape."""
    db = tmp_path / "scan.db"
    con = sqlite3.connect(db)
    con.execute("CREATE TABLE orders (id INTEGER, total REAL)")
    con.execute("CREATE TABLE users (id INTEGER, email TEXT)")
    con.commit()
    con.close()
    return SqliteSource(name="scan", type="sqlite", database=str(db))


def test_reports_tables_and_columns(sqlite_source):
    result = sqlite_source.get_schema()

    assert sorted(result["tables"]) == ["orders", "users"]
    assert sorted(result["tables"]["orders"]["columns"]) == ["id", "total"]
    assert result["metadata"]["total_tables"] == 2
    assert result["metadata"]["total_columns"] == 4


def test_default_schema_tables_keep_bare_names(sqlite_source):
    """Tables in the default schema stay unqualified. Downstream code and
    stored schema payloads key off this shape, so scanning extra schemas must
    not silently start qualifying names that were previously bare."""
    result = sqlite_source.get_schema()

    assert "orders" in result["tables"]
    assert not any("." in name for name in result["tables"])


def test_records_which_schemas_were_scanned(sqlite_source):
    """The scan is self-describing: a zero-table answer can be read alongside
    the list of schemas that were actually looked at."""
    result = sqlite_source.get_schema()

    assert result["metadata"]["scanned_schemas"] == ["main"]
    assert result["metadata"]["errors"] == []


def test_table_names_filter_still_applies(sqlite_source):
    result = sqlite_source.get_schema(table_names=["orders"])

    assert list(result["tables"]) == ["orders"]
    assert result["metadata"]["total_tables"] == 1


def test_falls_back_to_per_table_reflection(sqlite_source, monkeypatch):
    """Batched reflection is not universally available — SQLAlchemy's
    multi-column query joins ``pg_collation``/``pg_constraint`` and a
    locked-down server can deny those while still permitting ordinary
    per-table reflection. The fallback is what stops batching turning "slow"
    into "broken" on those servers.
    """
    from sqlalchemy.engine.reflection import Inspector

    def deny(self, *args, **kwargs):
        raise PermissionError("permission denied for table pg_collation")

    monkeypatch.setattr(Inspector, "get_multi_columns", deny)

    result = sqlite_source.get_schema()

    # Same answer, reached the slow way.
    assert sorted(result["tables"]) == ["orders", "users"]
    assert result["metadata"]["total_tables"] == 2
    # And it is not silent about having degraded.
    assert any("fell back to per-table" in e for e in result["metadata"]["errors"])


def test_column_failure_is_reported_not_swallowed(sqlite_source, monkeypatch):
    """The original bug: reflection failures were caught and turned into an
    empty schema, so a permissions error looked exactly like a database with
    no tables. Zero tables is now always accompanied by a reason."""
    from sqlalchemy.engine.reflection import Inspector

    def deny(self, *args, **kwargs):
        raise PermissionError("permission denied for table pg_collation")

    monkeypatch.setattr(Inspector, "get_multi_columns", deny)
    monkeypatch.setattr(Inspector, "get_columns", deny)

    result = sqlite_source.get_schema()

    assert result["metadata"]["total_tables"] == 0
    errors = result["metadata"]["errors"]
    assert errors, "an empty schema must carry the reason it is empty"
    assert any("pg_collation" in e for e in errors)


class _FakeInspector:
    """Just enough inspector to exercise schema selection."""

    def __init__(self, schemas):
        self._schemas = schemas

    def get_schema_names(self):
        return self._schemas


def test_scans_every_non_system_schema(sqlite_source):
    """The headline fix. A Postgres source reported "no tables" while sitting
    on 186 of them, because it only ever looked at the connection's default
    schema and ``public`` was genuinely empty — the tables were in ``rnacen``.
    """
    errors = []
    schemas = sqlite_source._schemas_to_scan(
        _FakeInspector(["public", "rnacen", "pg_catalog", "information_schema"]),
        errors,
    )

    assert schemas == ["public", "rnacen"]
    assert errors == []


def test_explicit_db_schema_is_scanned_alone(sqlite_source):
    """An explicit db_schema is a narrowing instruction, so it wins outright
    rather than being added to a full scan."""
    sqlite_source.db_schema = "rnacen"
    errors = []

    schemas = sqlite_source._schemas_to_scan(_FakeInspector(["public", "rnacen", "other"]), errors)

    assert schemas == ["rnacen"]


def test_schema_listing_failure_falls_back_and_says_so(sqlite_source, monkeypatch):
    """If schemas cannot be listed we still scan the default one rather than
    returning nothing — but the narrower scan is recorded."""
    from sqlalchemy.engine.reflection import Inspector

    def deny(self, *args, **kwargs):
        raise PermissionError("nope")

    monkeypatch.setattr(Inspector, "get_schema_names", deny)

    result = sqlite_source.get_schema()

    assert sorted(result["tables"]) == ["orders", "users"]
    assert any("could not list schemas" in e for e in result["metadata"]["errors"])
