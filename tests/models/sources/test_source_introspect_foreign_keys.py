"""Foreign-key introspection for the source ERD relationship edges (VIS-1014)."""

import sqlite3

from visivo.models.sources.sqlite_source import SqliteSource


def _all_tables(meta):
    """Flatten every table entry across databases/schemas of an introspect()."""
    tables = []
    for db in meta.get("databases", []):
        if "tables" in db:
            tables.extend(db["tables"])
        for schema in db.get("schemas", []):
            tables.extend(schema.get("tables", []))
    return tables


class _MockInspector:
    def __init__(self, fks):
        self._fks = fks

    def get_foreign_keys(self, table, schema=None):
        return self._fks


def test_introspect_foreign_keys_normalizes_sqlalchemy_shape():
    source = SqliteSource(name="s", type="sqlite", database=":memory:")
    inspector = _MockInspector(
        [
            {
                "constrained_columns": ["author_id"],
                "referred_schema": None,
                "referred_table": "authors",
                "referred_columns": ["id"],
                "name": "fk_books_author",
                "options": {},
            }
        ]
    )
    assert source._introspect_foreign_keys(inspector, "books") == [
        {
            "columns": ["author_id"],
            "references_schema": None,
            "references_table": "authors",
            "references_columns": ["id"],
        }
    ]


def test_introspect_foreign_keys_skips_incomplete_and_survives_errors():
    source = SqliteSource(name="s", type="sqlite", database=":memory:")
    # An FK missing the referred table or constrained columns is dropped.
    partial = _MockInspector([{"constrained_columns": [], "referred_table": "x"}])
    assert source._introspect_foreign_keys(partial, "t") == []

    class _Boom:
        def get_foreign_keys(self, table, schema=None):
            raise RuntimeError("dialect has no FK support")

    assert source._introspect_foreign_keys(_Boom(), "t") == []


def test_introspect_includes_foreign_keys_end_to_end(tmp_path):
    db = tmp_path / "fk.sqlite"
    conn = sqlite3.connect(str(db))
    conn.executescript("""
        CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE books (
            id INTEGER PRIMARY KEY,
            title TEXT,
            author_id INTEGER REFERENCES authors(id)
        );
        """)
    conn.commit()
    conn.close()

    source = SqliteSource(name="lib", type="sqlite", database=str(db))
    meta = source.introspect()

    tables = {t["name"]: t for t in _all_tables(meta)}
    assert "books" in tables and "authors" in tables
    # Every table entry now carries a foreign_keys list.
    assert tables["authors"]["foreign_keys"] == []
    book_fks = tables["books"]["foreign_keys"]
    assert len(book_fks) == 1
    assert book_fks[0]["columns"] == ["author_id"]
    assert book_fks[0]["references_table"] == "authors"
    assert book_fks[0]["references_columns"] == ["id"]
