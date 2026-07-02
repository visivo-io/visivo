"""Coverage-focused behavioral tests for sqlglot_utils helper functions.

Targets the branches the primary test_sqlglot_utils.py suite leaves uncovered:
extract_column_references, get_expression_for_groupby, supports_qualify,
validate_query (empty / unparseable / non-raising), the schema_from_sql
OptimizeError arm, and the None/MODE aggregate-detection short circuits.
"""

import pytest
from sqlglot import exp

from visivo.query.sqlglot_utils import (
    extract_column_references,
    get_expression_for_groupby,
    has_aggregate_function,
    has_window_function,
    parse_expression,
    schema_from_sql,
    supports_qualify,
    validate_query,
)


class TestExtractColumnReferences:
    def test_returns_empty_set_for_none(self):
        assert extract_column_references(None) == set()

    def test_extracts_qualified_and_unqualified_columns(self):
        expr = parse_expression("a + b * c", dialect="duckdb")
        cols = extract_column_references(expr)
        assert cols == {"a", "b", "c"}


class TestGetExpressionForGroupby:
    def test_empty_expression_returns_empty_string(self):
        assert get_expression_for_groupby(None) == ""

    def test_alias_unwrapped_to_underlying_expression(self):
        expr = parse_expression("amount AS total", dialect="duckdb")
        assert isinstance(expr, exp.Alias)
        # GROUP BY should reference the expression, not the alias name.
        assert get_expression_for_groupby(expr) == "amount"

    def test_non_alias_returns_own_sql(self):
        expr = parse_expression("amount + 1", dialect="duckdb")
        assert get_expression_for_groupby(expr) == "amount + 1"


class TestAggregateShortCircuits:
    def test_none_is_not_aggregate(self):
        assert has_aggregate_function(None) is False

    def test_none_is_not_window(self):
        assert has_window_function(None) is False

    def test_duckdb_mode_recognized_as_aggregate(self):
        # MODE parses to Anonymous in SQLGlot but is a DuckDB aggregate.
        expr = parse_expression("MODE(category)", dialect="duckdb")
        assert has_aggregate_function(expr) is True


class TestSupportsQualify:
    def test_empty_dialect_is_false(self):
        assert supports_qualify("") is False
        assert supports_qualify(None) is False

    def test_snowflake_supports_qualify(self):
        assert supports_qualify("snowflake") is True

    def test_unknown_dialect_returns_false(self):
        # get_sqlglot_dialect raises NotImplementedError inside the try → False.
        assert supports_qualify("not_a_real_dialect") is False


class TestValidateQuery:
    def test_empty_query_is_valid(self):
        assert validate_query("", dialect="duckdb") == (True, None)
        assert validate_query("   ", dialect="duckdb") == (True, None)

    def test_valid_query_passes(self):
        assert validate_query("SELECT * FROM users", dialect="duckdb") == (True, None)

    def test_invalid_query_returns_failure_when_not_raising(self):
        is_valid, error = validate_query(
            "SELECT * FROM WHERE",
            dialect="duckdb",
            insight_name="broken",
            raise_on_error=False,
        )
        assert is_valid is False
        assert error is not None

    def test_invalid_query_raises_when_configured(self):
        from visivo.query.sql_validation_error import SqlValidationError

        with pytest.raises(SqlValidationError):
            validate_query(
                "SELECT * FROM WHERE",
                dialect="duckdb",
                insight_name="broken",
                query_type="post_query",
                raise_on_error=True,
            )


class TestSchemaFromSqlErrors:
    def test_unknown_column_raises_actionable_click_exception(self):
        """A column absent from the (nested) schema surfaces a ClickException
        that lists the available schema names."""
        import click

        schema = {
            "EDW": {"fact_order": {"col1": exp.DataType.build("INT")}},
        }
        sql = "SELECT does_not_exist FROM fact_order"
        with pytest.raises(click.ClickException) as exc:
            schema_from_sql("snowflake", sql, schema, "model", default_schema="EDW")
        assert "EDW" in str(exc.value)


class TestParseExpressionContextString:
    def test_context_string_is_quoted_before_parsing(self):
        # A ${ref(...)} context string must be wrapped so SQLGlot can parse it.
        expr = parse_expression("${ ref(orders) }", dialect="duckdb")
        assert expr is not None
