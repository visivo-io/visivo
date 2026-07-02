"""Coverage-focused behavioral tests for SqlalchemySource introspection.

Uses a real on-disk SQLite database (no live server needed) to exercise
introspect(), get_schema() + its table-extraction helpers, and the granular
get_schemas / get_tables / get_columns / get_table_preview methods.
"""

import sqlite3

import pytest
from sqlalchemy import inspect

from visivo.models.sources.sqlite_source import Attachment, SqliteSource


class FakeInspector:
    """A minimal SQLAlchemy-Inspector stand-in for injecting introspection
    outcomes/errors without a live database (mirrors the FK test's approach)."""

    def __init__(
        self,
        schemas=None,
        tables=None,
        columns=None,
        schema_names_error=False,
        table_names_error=False,
        columns_error=False,
    ):
        self._schemas = schemas if schemas is not None else []
        self._tables = tables if tables is not None else []
        self._columns = columns if columns is not None else []
        self._schema_names_error = schema_names_error
        self._table_names_error = table_names_error
        self._columns_error = columns_error

    def get_schema_names(self):
        if self._schema_names_error:
            raise RuntimeError("no schema names")
        return self._schemas

    def get_table_names(self, schema=None):
        if self._table_names_error:
            raise RuntimeError("no table names")
        return self._tables

    def get_columns(self, table, schema=None):
        if self._columns_error:
            raise RuntimeError("no columns")
        return [{"name": c} for c in self._columns]

    def get_foreign_keys(self, table, schema=None):
        return []


@pytest.fixture
def sqlite_db(tmp_path):
    """A small SQLite database with two tables and one view."""
    db = tmp_path / "shop.sqlite"
    conn = sqlite3.connect(str(db))
    conn.executescript("""
        CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT);
        CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER, total REAL);
        CREATE VIEW customer_orders AS
            SELECT c.name, o.total FROM customers c JOIN orders o ON c.id = o.customer_id;
        INSERT INTO customers (name, email) VALUES ('Ada', 'ada@example.com'), ('Grace', NULL);
        INSERT INTO orders (customer_id, total) VALUES (1, 9.99), (1, 4.50), (2, 100.0);
        """)
    conn.commit()
    conn.close()
    return SqliteSource(name="shop", type="sqlite", database=str(db))


class TestIntrospect:
    def test_introspect_returns_tables_and_columns(self, sqlite_db):
        meta = sqlite_db.introspect()

        assert meta["name"] == "shop"
        assert meta["type"] == "sqlite"
        assert "error" not in meta
        # Flatten every table entry across whichever shape sqlite yields.
        tables = []
        for db in meta["databases"]:
            tables.extend(db.get("tables", []))
            for schema in db.get("schemas", []):
                tables.extend(schema.get("tables", []))
        by_name = {t["name"]: t for t in tables}
        assert "customers" in by_name
        assert "id" in by_name["customers"]["columns"]
        assert "email" in by_name["customers"]["columns"]

    def test_introspect_records_error_when_introspection_fails(self, sqlite_db, mocker):
        # A failure once introspection is underway (inside the guarded block) is
        # recorded on the result rather than raised. list_databases still
        # succeeds; the per-dialect introspection step blows up.
        mocker.patch.object(
            SqliteSource,
            "_introspect_via_single_connection",
            side_effect=RuntimeError("introspection blew up"),
        )
        meta = sqlite_db.introspect()
        assert "error" in meta
        assert meta["databases"] == []


class TestGetSchema:
    def test_builds_sqlglot_schema_for_all_tables(self, sqlite_db):
        schema = sqlite_db.get_schema()

        assert "customers" in schema["tables"]
        assert "orders" in schema["tables"]
        cust_cols = schema["tables"]["customers"]["columns"]
        assert "id" in cust_cols and "name" in cust_cols
        assert schema["metadata"]["total_tables"] >= 2
        assert schema["metadata"]["total_columns"] >= 5

    def test_filters_to_requested_tables(self, sqlite_db):
        schema = sqlite_db.get_schema(table_names=["customers"])
        assert "customers" in schema["tables"]
        assert "orders" not in schema["tables"]

    def test_requested_missing_table_yields_no_tables(self, sqlite_db):
        schema = sqlite_db.get_schema(table_names=["does_not_exist"])
        assert schema["tables"] == {}

    def test_returns_minimal_schema_on_error(self, sqlite_db, mocker):
        mocker.patch(
            "visivo.models.sources.sqlalchemy_source.inspect",
            side_effect=RuntimeError("inspector unavailable"),
        )
        schema = sqlite_db.get_schema()
        assert schema["tables"] == {}
        assert "error" in schema["metadata"]


class TestGranularIntrospection:
    def test_get_schemas_filters_system_schemas(self, sqlite_db):
        schemas = sqlite_db.get_schemas("main")
        # SQLite's non-system schema list should not include information_schema.
        assert "information_schema" not in schemas

    def test_get_tables_includes_tables_and_views_sorted(self, sqlite_db):
        tables = sqlite_db.get_tables("main")
        names = [t["name"] for t in tables]
        assert "customers" in names and "orders" in names
        # customer_orders is a view.
        view = next(t for t in tables if t["name"] == "customer_orders")
        assert view["type"] == "view"
        assert names == sorted(names)

    def test_get_columns_reports_type_and_nullable(self, sqlite_db):
        columns = sqlite_db.get_columns("main", "customers")
        by_name = {c["name"]: c for c in columns}
        assert set(by_name) == {"id", "name", "email"}
        assert "type" in by_name["name"]
        assert by_name["name"]["nullable"] is False

    def test_get_table_preview_returns_rows(self, sqlite_db):
        preview = sqlite_db.get_table_preview("main", "customers", limit=1)
        assert preview["row_count"] == 1
        assert "name" in preview["columns"]
        assert len(preview["rows"]) == 1

    def test_get_table_preview_clamps_limit(self, sqlite_db):
        # A huge limit is clamped; only 3 orders exist.
        preview = sqlite_db.get_table_preview("main", "orders", limit=99999)
        assert preview["row_count"] == 3

    def test_get_table_preview_with_schema_qualifies_table(self, sqlite_db):
        # Passing a schema builds a "schema"."table" qualified name.
        preview = sqlite_db.get_table_preview("main", "customers", schema_name="main", limit=2)
        assert "name" in preview["columns"]


class TestIntrospectDatabaseHelper:
    """_introspect_database drives off the SQLAlchemy Inspector; drive its
    schema/no-schema and best-effort error arms with a fake inspector."""

    def test_no_schemas_lists_tables_directly(self, sqlite_db):
        inspector = FakeInspector(schemas=[], tables=["events"], columns=["id", "ts"])
        db_entry = sqlite_db._introspect_database(inspector, "analytics")

        assert db_entry["name"] == "analytics"
        assert "tables" in db_entry  # no-schema shape
        assert db_entry["tables"][0]["name"] == "events"
        assert db_entry["tables"][0]["columns"] == ["id", "ts"]

    def test_schema_names_error_falls_back_to_flat_tables(self, sqlite_db):
        inspector = FakeInspector(schema_names_error=True, tables=["t"], columns=["c"])
        db_entry = sqlite_db._introspect_database(inspector, "db")
        assert "tables" in db_entry

    def test_no_schema_table_names_error_yields_no_tables(self, sqlite_db):
        inspector = FakeInspector(schemas=[], table_names_error=True)
        db_entry = sqlite_db._introspect_database(inspector, "db")
        assert db_entry["tables"] == []

    def test_no_schema_column_error_yields_empty_columns(self, sqlite_db):
        inspector = FakeInspector(schemas=[], tables=["t"], columns_error=True)
        db_entry = sqlite_db._introspect_database(inspector, "db")
        assert db_entry["tables"][0]["columns"] == []

    def test_schema_table_names_error_yields_empty_table_list(self, sqlite_db):
        inspector = FakeInspector(schemas=["public"], table_names_error=True)
        db_entry = sqlite_db._introspect_database(inspector, "db")
        assert db_entry["schemas"][0]["tables"] == []

    def test_schema_column_error_yields_empty_columns(self, sqlite_db):
        inspector = FakeInspector(schemas=["public"], tables=["t"], columns_error=True)
        db_entry = sqlite_db._introspect_database(inspector, "db")
        assert db_entry["schemas"][0]["tables"][0]["columns"] == []


class TestMultipleConnectionsHelper:
    """_introspect_via_multiple_connections (the per-database PostgreSQL path)
    is dialect-agnostic enough to drive with two on-disk SQLite files."""

    def test_same_and_different_database_paths(self, sqlite_db, tmp_path):
        other = tmp_path / "other.sqlite"
        conn = sqlite3.connect(str(other))
        conn.executescript("CREATE TABLE widgets (id INTEGER, sku TEXT);")
        conn.commit()
        conn.close()

        # First entry == self.database (reuses the primary engine); second is a
        # different database (a fresh engine is built and disposed).
        results = sqlite_db._introspect_via_multiple_connections([sqlite_db.database, str(other)])
        assert len(results) == 2


class TestExtractTableSchemaHelper:
    def test_success_and_schema_qualified_name(self, sqlite_db):
        inspector = inspect(sqlite_db.get_engine())

        plain = sqlite_db._extract_table_schema(inspector, "customers")
        assert set(plain["columns"]) == {"id", "name", "email"}

        qualified = sqlite_db._extract_table_schema(inspector, "main.customers")
        assert qualified["metadata"]["schema"] == "main"

    def test_uses_source_db_schema_when_unqualified(self, tmp_path):
        db = tmp_path / "s.sqlite"
        conn = sqlite3.connect(str(db))
        conn.executescript("CREATE TABLE t (a INTEGER);")
        conn.commit()
        conn.close()
        source = SqliteSource(name="s", type="sqlite", database=str(db), db_schema="main")
        inspector = inspect(source.get_engine())

        result = source._extract_table_schema(inspector, "t")
        assert result["metadata"]["schema"] == "main"

    def test_missing_table_returns_none(self, sqlite_db):
        inspector = inspect(sqlite_db.get_engine())
        assert sqlite_db._extract_table_schema(inspector, "no_such_table") is None

    def test_empty_columns_returns_none(self, sqlite_db):
        inspector = FakeInspector(columns=[])
        assert sqlite_db._extract_table_schema(inspector, "empty") is None


class TestAvailableTablesForSchemaHelper:
    def test_filter_with_db_schema(self, tmp_path):
        db = tmp_path / "s.sqlite"
        conn = sqlite3.connect(str(db))
        conn.executescript("CREATE TABLE a (x INTEGER); CREATE TABLE b (y INTEGER);")
        conn.commit()
        conn.close()
        source = SqliteSource(name="s", type="sqlite", database=str(db), db_schema="main")
        inspector = inspect(source.get_engine())

        # Requested names are intersected with what actually exists.
        filtered = source._get_available_tables_for_schema(inspector, table_names=["a"])
        assert "a" in filtered

    def test_all_tables_with_db_schema(self, tmp_path):
        db = tmp_path / "s.sqlite"
        conn = sqlite3.connect(str(db))
        conn.executescript("CREATE TABLE a (x INTEGER);")
        conn.commit()
        conn.close()
        source = SqliteSource(name="s", type="sqlite", database=str(db), db_schema="main")
        inspector = inspect(source.get_engine())

        tables = source._get_available_tables_for_schema(inspector, table_names=None)
        assert "a" in tables

    def test_inspector_error_yields_empty(self, sqlite_db):
        class Boom:
            def get_table_names(self, schema=None):
                raise RuntimeError("cannot list")

        # Best-effort: an inspector that can't list tables yields no tables.
        assert sqlite_db._get_available_tables_for_schema(Boom(), table_names=None) == []


class TestConnectionSideEffects:
    def test_after_connect_statement_runs_on_connect(self, tmp_path):
        db = tmp_path / "hooked.sqlite"
        conn = sqlite3.connect(str(db))
        conn.executescript("CREATE TABLE t (a INTEGER);")
        conn.commit()
        conn.close()
        source = SqliteSource(
            name="hooked", type="sqlite", database=str(db), after_connect="SELECT 1"
        )

        # Opening a connection fires the after_connect hook without error.
        connection = source.get_connection()
        connection.close()

    def test_attach_makes_second_database_available(self, tmp_path):
        primary = tmp_path / "primary.sqlite"
        secondary = tmp_path / "secondary.sqlite"
        for path in (primary, secondary):
            conn = sqlite3.connect(str(path))
            conn.executescript("CREATE TABLE t (a INTEGER);")
            conn.commit()
            conn.close()

        attached = SqliteSource(name="secondary", type="sqlite", database=str(secondary))
        source = SqliteSource(
            name="primary",
            type="sqlite",
            database=str(primary),
            attach=[Attachment(schema_name="second", source=attached)],
        )

        connection = source.get_connection()
        connection.close()
