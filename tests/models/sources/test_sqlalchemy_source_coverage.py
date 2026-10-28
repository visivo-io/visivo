"""Coverage-focused behavioral tests for SqlalchemySource introspection.

Uses a real on-disk SQLite database (no live server needed) to exercise
introspect(), get_schema() + its table-extraction helpers, and the granular
get_schemas / get_tables / get_columns / get_table_preview methods.
"""

import sqlite3
from datetime import datetime, time
from decimal import Decimal

import click
import polars as pl
import psycopg2
import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy.pool import NullPool

from visivo.models.sources.postgresql_source import PostgresqlSource
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


class FailingDefaultSchemaInspector(FakeInspector):
    @property
    def default_schema_name(self):
        raise RuntimeError("no default schema")


def unreachable_postgres():
    def refuse():
        raise psycopg2.OperationalError("server closed the connection")

    source = PostgresqlSource(name="pg", type="postgresql", database="prod")
    source._engine = create_engine("postgresql+psycopg2://", creator=refuse, poolclass=NullPool)
    return source


class TestWriteDataframe:
    def test_decimal_datetime_and_time_columns_round_trip(self, sqlite_db):
        frame = pl.DataFrame(
            {
                "amount": pl.Series([Decimal("1.25")], dtype=pl.Decimal(10, 2)),
                "seen_at": [datetime(2026, 1, 2, 3, 4, 5)],
                "opens": [time(9, 30)],
            }
        )

        sqlite_db.write_dataframe("readings", frame)

        columns = {c["name"]: c["type"] for c in sqlite_db.get_columns("main", "readings")}
        assert columns == {"amount": "NUMERIC", "seen_at": "DATETIME", "opens": "TIME"}
        assert sqlite_db.read_sql("select count(*) as n from readings") == [{"n": 1}]

    def test_write_failure_names_the_table_and_source(self, sqlite_db):
        with pytest.raises(click.ClickException) as exc:
            sqlite_db.write_dataframe(
                "customer_orders", pl.DataFrame({"name": ["Ada"]}), replace=False
            )

        assert exc.value.message.startswith(
            "Error writing table 'customer_orders' to sqlite source 'shop':"
        )


class TestTableExists:
    def test_reports_present_and_missing_tables(self, sqlite_db):
        assert sqlite_db.table_exists("customers") is True
        assert sqlite_db.table_exists("no_such_table") is False

    def test_unreachable_server_reports_missing(self):
        assert unreachable_postgres().table_exists("customers") is False


class TestIntrospectPerDatabaseFailures:
    def test_single_connection_records_a_failed_database(self, sqlite_db, mocker):
        mocker.patch.object(
            SqliteSource, "_introspect_database", side_effect=RuntimeError("db unreadable")
        )

        databases = sqlite_db._introspect_via_single_connection(
            sqlite_db.get_engine(), [sqlite_db.database]
        )

        assert databases == [{"name": sqlite_db.database, "error": "db unreadable"}]

    def test_multiple_connections_records_a_failed_database(self, sqlite_db, mocker):
        mocker.patch.object(
            SqliteSource, "_introspect_database", side_effect=RuntimeError("db unreadable")
        )

        databases = sqlite_db._introspect_via_multiple_connections([sqlite_db.database])

        assert databases == [{"name": sqlite_db.database, "error": "db unreadable"}]


class TestIntrospectPostgresPath:
    def test_postgres_dialect_introspects_each_database_on_its_own_engine(self, mocker):
        source = unreachable_postgres()
        mocker.patch.object(PostgresqlSource, "list_databases", return_value=["prod"])

        meta = source.introspect()

        assert [db["name"] for db in meta["databases"]] == ["prod"]
        assert "server closed the connection" in meta["databases"][0]["error"]


class TestGetSchemaPartialFailures:
    def test_unresolvable_default_schema_is_recorded_and_scan_continues(self, sqlite_db, mocker):
        inspector = FailingDefaultSchemaInspector(tables=["events"], columns=["id"])
        mocker.patch("visivo.models.sources.sqlalchemy_source.inspect", return_value=inspector)

        schema = sqlite_db.get_schema()

        errors = schema["metadata"]["errors"]
        assert "could not resolve default schema: no default schema" in errors
        assert "error" not in schema["metadata"]

    def test_table_that_fails_to_build_is_skipped_and_recorded(self, sqlite_db, mocker):
        mocker.patch.object(
            SqliteSource, "_build_table_schema", side_effect=RuntimeError("unmappable column")
        )

        schema = sqlite_db.get_schema()

        assert schema["tables"] == {}
        assert "could not build schema for customers: unmappable column" in (
            schema["metadata"]["errors"]
        )

    def test_table_with_no_schema_is_skipped(self, sqlite_db, mocker):
        mocker.patch.object(SqliteSource, "_build_table_schema", return_value=None)

        schema = sqlite_db.get_schema()

        assert schema["tables"] == {}
        assert schema["metadata"]["total_tables"] == 0


class TestColumnsByTableFallback:
    def test_unlistable_schema_yields_no_columns_and_an_error(self, sqlite_db):
        errors = []

        columns = sqlite_db._columns_by_table(FakeInspector(table_names_error=True), "s", errors)

        assert columns == {}
        assert errors[-1] == "could not list tables in schema s: no table names"

    def test_failures_name_three_sample_tables_and_count_the_rest(self, sqlite_db):
        errors = []
        inspector = FakeInspector(tables=["a", "b", "c", "d", "e"], columns_error=True)

        assert sqlite_db._columns_by_table(inspector, None, errors) == {}

        assert errors[-1] == (
            "could not reflect columns for 5 table(s) in default (a, b, c and 2 more): no columns"
        )


class TestConciseError:
    def test_long_first_line_is_truncated_with_an_ellipsis(self):
        message = SqliteSource._concise_error(RuntimeError("x" * 500 + "\nsecond line"))

        assert len(message) == 200
        assert message.endswith("…")


class TestAvailableTablesForSchemaErrors:
    class Boom:
        def get_table_names(self, schema=None):
            raise RuntimeError("cannot list")

    def test_requested_tables_with_unlistable_schemas_yield_none(self, tmp_path):
        source = SqliteSource(name="s", type="sqlite", database=str(tmp_path / "s.sqlite"))
        source.db_schema = "main"

        assert source._get_available_tables_for_schema(self.Boom(), table_names=["a"]) == []

    def test_all_tables_with_unlistable_db_schema_yield_none(self, tmp_path):
        source = SqliteSource(name="s", type="sqlite", database=str(tmp_path / "s.sqlite"))
        source.db_schema = "main"

        assert source._get_available_tables_for_schema(self.Boom(), table_names=None) == []
