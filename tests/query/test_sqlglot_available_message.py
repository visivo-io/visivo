"""The "what could I resolve against" line in a schema-validation failure.

It used to read ``Available schemas: <keys>`` while only ever collecting keys
whose value was itself a dict — the NESTED ``{schema: {table: {col}}}`` shape.
DuckDB and SQLite produce a FLAT ``{table: {col}}``, so the line always said
``Available schemas: None`` regardless of whether anything had loaded.

That is worse than unhelpful. It claims nothing was loaded at exactly the moment
you are trying to establish whether anything was loaded, and sends you looking
for a missing schema when the real cause is usually a mistyped column.
"""

from sqlglot import exp

from visivo.query.sqlglot_utils import _describe_available


def _cols(*names):
    return {name: exp.DataType.build("INT") for name in names}


def test_a_flat_schema_names_its_tables_rather_than_claiming_none():
    """The regression. A duckdb source with tables used to print 'None'."""
    message = _describe_available({"orders": _cols("id"), "users": _cols("id")})

    assert "orders" in message and "users" in message
    assert "None" not in message


def test_a_nested_schema_still_names_its_schemas():
    message = _describe_available({"EDW": {"fact_order": _cols("col1")}})

    assert message == "Available schemas: EDW"


def test_an_empty_schema_says_so_unambiguously():
    """The case the old message was accidentally right about — now it is the
    only case that reports nothing, so the report means something."""
    message = _describe_available({})

    assert "EMPTY" in message
    assert "no schema was loaded" in message


def test_a_long_table_list_is_capped():
    """A warehouse source can carry hundreds of tables; an error that scrolls
    off the screen is its own problem."""
    message = _describe_available({f"t{i}": _cols("id") for i in range(50)})

    assert "+30 more" in message
    assert len(message) < 400


def test_a_non_dict_schema_does_not_raise_inside_the_error_path():
    """This runs while already raising — it must not raise again."""
    assert "EMPTY" in _describe_available(None)
