"""Postgres reads its columns from pg_catalog instead of SQLAlchemy reflection.

SQLAlchemy's batched ``get_multi_columns`` joins ``pg_collation`` and
``pg_constraint``. A locked-down server denies those while still allowing
ordinary reflection, which drops the source onto the per-table fallback —
~1.9s/table, so a 186-table schema takes ~6 minutes and the caller times out
first and reports an empty schema. The override reads only pg_attribute,
pg_class and pg_namespace, so it cannot hit that wall.

The rows below are real ``format_type`` output, taken from a live Postgres
database, so the type assertions pin what Postgres actually emits rather than
what it is assumed to emit.
"""

import pytest

from visivo.models.sources.postgresql_source import PostgresqlSource


@pytest.fixture
def source():
    return PostgresqlSource(
        name="pg",
        type="postgresql",
        database="db",
        username="u",
        password="p",
        host="localhost",
        port=5432,
    )


# (table_name, column_name, format_type(...), NOT attnotnull)
_CATALOG_ROWS = [
    ("account", "id", "uuid", False),
    ("account", "created_at", "timestamp with time zone", False),
    ("account", "slug", "character varying(128)", False),
    ("account", "auto_associate_domain", "character varying(128)", True),
    ("dashboard", "config", "jsonb", True),
    ("dashboard", "position", "numeric(10,2)", True),
    ("dashboard", "tags", "integer[]", True),
]


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return self._rows


class _Connection:
    """Stands in for the DBAPI connection, recording what it was asked."""

    def __init__(self, rows, raises=None):
        self._rows = rows
        self._raises = raises
        self.executed = []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, statement, params=None):
        if self._raises:
            raise self._raises
        self.executed.append((str(statement), params))
        return _Result(self._rows)


class _Inspector:
    def __init__(self, connection):
        self.engine = self
        self._connection = connection

    def connect(self):
        return self._connection


def test_groups_catalog_rows_by_table(source):
    connection = _Connection(_CATALOG_ROWS)
    errors = []

    columns = source._columns_by_table(_Inspector(connection), "public", errors)

    assert sorted(columns) == ["account", "dashboard"]
    assert [c["name"] for c in columns["account"]] == [
        "id",
        "created_at",
        "slug",
        "auto_associate_domain",
    ]
    assert errors == []


def test_nullability_survives_the_not_attnotnull_inversion(source):
    """The catalog stores attnotnull; the schema wants nullable. Inverting that
    in SQL is easy to get backwards and nothing downstream would notice."""
    connection = _Connection(_CATALOG_ROWS)

    columns = source._columns_by_table(_Inspector(connection), "public", [])

    by_name = {c["name"]: c for c in columns["account"]}
    assert by_name["id"]["nullable"] is False
    assert by_name["auto_associate_domain"]["nullable"] is True


def test_scopes_the_query_to_the_requested_schema(source):
    connection = _Connection(_CATALOG_ROWS)

    source._columns_by_table(_Inspector(connection), "analytics", [])

    _statement, params = connection.executed[0]
    assert params == {"schema": "analytics"}


def test_passes_none_through_for_the_default_schema(source):
    """``_schemas_to_scan`` yields None when it cannot enumerate schemas. The
    query resolves that with current_schema(), so None must reach the bind
    rather than being turned into a literal."""
    connection = _Connection(_CATALOG_ROWS)

    source._columns_by_table(_Inspector(connection), None, [])

    _statement, params = connection.executed[0]
    assert params == {"schema": None}


def test_query_avoids_the_catalogs_that_forced_this_override(source):
    """The whole point: no pg_collation, no pg_constraint, no pg_attrdef."""
    connection = _Connection(_CATALOG_ROWS)

    source._columns_by_table(_Inspector(connection), "public", [])

    statement = connection.executed[0][0]
    for catalog in ("pg_collation", "pg_constraint", "pg_attrdef"):
        assert catalog not in statement
    assert "has_table_privilege" in statement


def test_falls_back_to_generic_reflection_and_says_so(source, monkeypatch):
    """An unexpected catalog restriction should degrade to the generic path,
    which has its own batched attempt and per-table fallback — not fail the
    source."""
    from visivo.models.sources.sqlalchemy_source import SqlalchemySource

    monkeypatch.setattr(
        SqlalchemySource,
        "_columns_by_table",
        lambda self, inspector, schema, errors: {"from_generic": []},
    )
    connection = _Connection([], raises=PermissionError("permission denied for pg_class"))
    errors = []

    columns = source._columns_by_table(_Inspector(connection), "public", errors)

    assert columns == {"from_generic": []}
    assert any("fell back to generic reflection" in e for e in errors)
    assert any("permission denied for pg_class" in e for e in errors)


@pytest.mark.parametrize(
    "column, expected",
    [
        ("id", "UUID"),
        ("created_at", "TIMESTAMPTZ"),
        ("slug", "VARCHAR(128)"),
    ],
)
def test_format_type_strings_resolve_to_sqlglot_types(source, column, expected):
    """Types arrive as format_type strings, not SQLAlchemy objects.
    ``_build_table_schema`` handles that through its string fallback, so the
    override needs no change to the shared builder — pin it."""
    columns = source._columns_by_table(_Inspector(_Connection(_CATALOG_ROWS)), "public", [])

    built = source._build_table_schema("account", "public", columns["account"], [])

    assert str(built["columns"][column]["sqlglot_datatype"]) == expected


def test_postgres_specific_spellings_are_not_flattened(source):
    """jsonb, numeric(p,s) and array types are where a naive string mapper
    quietly degrades everything to VARCHAR."""
    columns = source._columns_by_table(_Inspector(_Connection(_CATALOG_ROWS)), "public", [])

    built = source._build_table_schema("dashboard", "public", columns["dashboard"], [])
    types = {name: str(info["sqlglot_datatype"]) for name, info in built["columns"].items()}

    assert types == {
        "config": "JSON",
        "position": "DECIMAL(10, 2)",
        "tags": "ARRAY<INT>",
    }
