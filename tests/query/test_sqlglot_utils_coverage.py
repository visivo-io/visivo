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


class TestDefaultContext:
    """Full-path schemas resolve through the catalog and schema SQLGlot is given."""

    SCHEMA = {
        "saas": {
            "main": {"orders": {"id": exp.DataType.build("INT")}},
            "analytics": {"fct_mrr": {"mrr": exp.DataType.build("DOUBLE")}},
        },
        "other": {"main": {"ext": {"x": exp.DataType.build("INT")}}},
    }

    def _columns(self, sql, **context):
        return schema_from_sql("duckdb", sql, self.SCHEMA, "m", **context)["m"]

    def test_schema_depth(self):
        from visivo.query.sqlglot_utils import _schema_depth

        assert _schema_depth({}) == 0
        assert _schema_depth({"t": {"a": "INT"}}) == 1
        assert _schema_depth({"s": {"t": {"a": "INT"}}}) == 2
        assert _schema_depth(self.SCHEMA) == 3

    def test_catalog_and_schema_qualify_unqualified_names(self):
        context = {"default_catalog": "saas", "default_schema": "main"}

        assert self._columns("select * from orders", **context) == {"id": "INT"}
        assert self._columns("select * from analytics.fct_mrr", **context) == {"mrr": "DOUBLE"}
        assert self._columns("select * from fct_mrr", **context) == {"*": "UNKNOWN"}

    def test_attached_database_reads_as_its_main_schema(self):
        context = {"default_catalog": "SAAS", "default_schema": "main"}

        assert self._columns("select * from other.ext", **context) == {"x": "INT"}
        assert self._columns("select * from OTHER.main.ext", **context) == {"x": "INT"}

    def test_a_schema_of_the_default_database_wins_over_a_database(self):
        schema = {
            "saas": {"other": {"ext": {"y": exp.DataType.build("INT")}}},
            "other": {"main": {"ext": {"x": exp.DataType.build("INT")}}},
        }

        columns = schema_from_sql("duckdb", "select * from other.ext", schema, "m", "main", "saas")[
            "m"
        ]

        assert columns == {"y": "INT"}

    def test_attached_binding_is_duckdb_only(self):
        columns = schema_from_sql(
            "postgres",
            "select * from other.ext",
            self.SCHEMA,
            "m",
            default_schema="main",
            default_catalog="saas",
        )["m"]

        assert columns == {"*": "UNKNOWN"}


class TestInferenceContext:
    def test_source_context_overrides_stored_metadata(self):
        from visivo.query.model_schema_inference import resolve_default_context

        metadata = {"database": "saas", "default_schema": "main"}

        assert resolve_default_context(metadata) == ("saas", "main")
        assert resolve_default_context(metadata, {"schema": "analytics"}) == ("saas", "analytics")
        assert resolve_default_context(None, {"catalog": "c", "schema": "s"}) == ("c", "s")
        assert resolve_default_context(None) == (None, None)

    def test_source_default_context_tolerates_objects_without_one(self):
        from visivo.query.model_schema_inference import source_default_context

        class NoContext:
            pass

        class BadContext:
            def get_default_context(self):
                return "main"

        assert source_default_context(NoContext()) == {}
        assert source_default_context(BadContext()) == {}

    def test_three_level_schema_converts_to_datatypes(self):
        from visivo.query.model_schema_inference import sqlglot_schema_to_datatypes

        converted = sqlglot_schema_to_datatypes(
            {"saas": {"main": {"orders": {"id": "INT"}, "bad": "x"}, "junk": 1}}
        )

        assert converted == {"saas": {"main": {"orders": {"id": exp.DataType.build("INT")}}}}
