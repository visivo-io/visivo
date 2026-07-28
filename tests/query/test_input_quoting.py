"""Tests for type-aware input-placeholder quoting (smoke-test bug #13)."""

from visivo.query.input_quoting import quote_bare_string_placeholders

# Convenience predicates.
QUOTE_ALL = lambda name, acc: True
QUOTE_NONE = lambda name, acc: False


def test_bare_string_placeholder_is_wrapped():
    sql = 'SELECT * FROM "t" WHERE "h"."equipment" = ${pick.value}'
    out = quote_bare_string_placeholders(sql, QUOTE_ALL)
    assert out == 'SELECT * FROM "t" WHERE "h"."equipment" = \'${pick.value}\''


def test_already_quoted_placeholder_is_left_alone_no_double_quote():
    # Back-compat: the established manual-quote pattern must NOT become ''...''.
    sql = 'SELECT * FROM "t" WHERE "h"."equipment" = \'${pick.value}\''
    out = quote_bare_string_placeholders(sql, QUOTE_ALL)
    assert out == sql
    assert "''" not in out


def test_numeric_placeholder_is_not_wrapped():
    # should_quote False (a numeric value) -> leave bare.
    sql = 'SELECT * FROM "t" WHERE "h"."age" = ${pick.value}'
    out = quote_bare_string_placeholders(sql, QUOTE_NONE)
    assert out == sql


def test_placeholder_embedded_in_a_larger_string_is_left_alone():
    sql = 'SELECT * FROM "t" WHERE "h"."c" = \'prefix ${pick.value} suffix\''
    out = quote_bare_string_placeholders(sql, QUOTE_ALL)
    assert out == sql


def test_multiselect_values_in_list_is_not_wrapped_when_should_quote_false():
    # A multi-select .values is a pre-quoted IN-list; the caller passes
    # should_quote False for it, so it stays untouched.
    sql = 'SELECT * FROM "t" WHERE "h"."equipment" IN (${pick.values})'
    should_quote = lambda name, acc: acc != "values"
    out = quote_bare_string_placeholders(sql, should_quote)
    assert out == sql


def test_mixed_placeholders_quote_only_the_string_ones():
    sql = 'SELECT * FROM "t" WHERE "h"."equip" = ${eq.value} AND "h"."age" = ${age.value}'
    should_quote = lambda name, acc: name == "eq"
    out = quote_bare_string_placeholders(sql, should_quote)
    assert "'${eq.value}'" in out
    assert "= ${age.value}" in out  # numeric input left bare
    assert "'${age.value}'" not in out


def test_no_placeholders_returns_unchanged():
    sql = 'SELECT * FROM "t" WHERE "h"."x" = 1'
    assert quote_bare_string_placeholders(sql, QUOTE_ALL) == sql


def test_unparseable_sql_is_returned_unchanged_failsafe():
    # If SQLGlot can't parse it, never risk corrupting the query.
    sql = "this is (not )( valid sql ${pick.value}"
    assert quote_bare_string_placeholders(sql, QUOTE_ALL) == sql


class _FakeInput:
    def __init__(self, options=None, range=None):
        self.options = options
        self.range = range


def test_input_value_type_classification():
    from visivo.query.input_quoting import input_value_type

    assert input_value_type(_FakeInput(options=["a", "b"])) == "string"  # static list
    assert input_value_type(_FakeInput(range=object())) == "number"  # range-based
    assert input_value_type(_FakeInput()) == "unknown"  # neither
    assert input_value_type(_FakeInput(options="?{SELECT DISTINCT x}")) == "unknown"  # query-based


def test_build_should_quote_predicate():
    from visivo.query.input_quoting import build_should_quote

    sq = build_should_quote(
        {"str_in": _FakeInput(options=["a"]), "num_in": _FakeInput(range=object())}
    )
    assert sq("str_in", "value") is True
    assert sq("str_in", "first") is True
    assert sq("str_in", "values") is False  # .values IN-list is pre-quoted
    assert sq("num_in", "value") is False  # numeric -> never quoted
    assert sq("undefined", "value") is False
