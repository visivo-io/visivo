"""
Tests for visivo.query.sqlglot_utils module.

This module tests SQL utility functions including:
- identify_column_references: Column qualification with sort order preservation
- classify_statement: SQL statement classification (aggregate, vanilla, window)
- strip_sort_order: ASC/DESC removal from expressions
- normalize_identifier_for_dialect: Dialect-aware identifier case normalization
- Other SQL parsing utilities
"""

import pytest
from visivo.query.sqlglot_utils import (
    identify_column_references,
    classify_statement,
    strip_sort_order,
    parse_expression,
    has_aggregate_function,
    has_window_function,
    find_non_aggregated_expressions,
    normalize_identifier_for_dialect,
)


class TestIdentifyColumnReferences:
    """Tests for the identify_column_references function."""

    def test_simple_column_qualification(self):
        """Test qualifying a simple column reference."""
        model_hash = "model_abc"
        model_schema = {model_hash: {"amount": "INT", "date": "DATE"}}

        result = identify_column_references(
            model_hash=model_hash,
            model_schema=model_schema,
            expr_sql="amount",
            dialect="duckdb",
        )

        assert '"model_abc"."amount"' in result
        assert "ASC" not in result
        assert "DESC" not in result

    def test_expression_with_function(self):
        """Test qualifying an expression with aggregate function."""
        model_hash = "model_abc"
        model_schema = {model_hash: {"amount": "INT"}}

        result = identify_column_references(
            model_hash=model_hash,
            model_schema=model_schema,
            expr_sql="SUM(amount)",
            dialect="duckdb",
        )

        assert "SUM" in result.upper()
        assert '"model_abc"."amount"' in result

    def test_expression_with_desc(self):
        """Test that DESC sort order is preserved."""
        model_hash = "model_abc"
        model_schema = {model_hash: {"amount": "INT", "date": "DATE"}}

        result = identify_column_references(
            model_hash=model_hash,
            model_schema=model_schema,
            expr_sql="amount DESC",
            dialect="duckdb",
        )

        assert "DESC" in result
        assert '"model_abc"."amount"' in result
        # Should NOT be treated as an alias
        assert "AS" not in result or '"DESC"' not in result

    def test_expression_with_asc(self):
        """Test that ASC sort order is preserved."""
        model_hash = "model_abc"
        model_schema = {model_hash: {"date": "DATE"}}

        result = identify_column_references(
            model_hash=model_hash,
            model_schema=model_schema,
            expr_sql="date ASC",
            dialect="duckdb",
        )

        assert "ASC" in result
        assert '"model_abc"."date"' in result
        # Should NOT be treated as an alias
        assert "AS" not in result or '"ASC"' not in result

    def test_aggregate_expression_with_desc(self):
        """Test that DESC is preserved with aggregate expressions."""
        model_hash = "model_abc"
        model_schema = {model_hash: {"amount": "DECIMAL"}}

        result = identify_column_references(
            model_hash=model_hash,
            model_schema=model_schema,
            expr_sql="SUM(amount) DESC",
            dialect="duckdb",
        )

        assert "SUM" in result.upper()
        assert "DESC" in result
        assert '"model_abc"."amount"' in result

    def test_multiple_columns_no_ordering(self):
        """Test expression with multiple columns without ordering."""
        model_hash = "model_abc"
        model_schema = {model_hash: {"price": "DECIMAL", "quantity": "INT"}}

        result = identify_column_references(
            model_hash=model_hash,
            model_schema=model_schema,
            expr_sql="price * quantity",
            dialect="duckdb",
        )

        assert '"model_abc"."price"' in result
        assert '"model_abc"."quantity"' in result
        assert "ASC" not in result
        assert "DESC" not in result

    def test_case_expression_without_ordering(self):
        """Test CASE expression without sort order."""
        model_hash = "model_abc"
        model_schema = {model_hash: {"status": "VARCHAR", "amount": "DECIMAL"}}

        result = identify_column_references(
            model_hash=model_hash,
            model_schema=model_schema,
            expr_sql="CASE WHEN status = 'active' THEN amount ELSE 0 END",
            dialect="duckdb",
        )

        assert "CASE" in result.upper()
        assert '"model_abc"."status"' in result
        assert '"model_abc"."amount"' in result


class TestClassifyStatement:
    """Tests for the classify_statement function."""

    def test_classify_vanilla_statement(self):
        """Test classifying a simple SELECT statement."""
        result = classify_statement("column_name", dialect="duckdb")
        assert result == "vanilla"

    def test_classify_aggregate_statement(self):
        """Test classifying an aggregate statement."""
        result = classify_statement("SUM(amount)", dialect="duckdb")
        assert result == "aggregate"

    def test_classify_window_statement(self):
        """Test classifying a window function statement."""
        result = classify_statement(
            "ROW_NUMBER() OVER (PARTITION BY category ORDER BY amount)", dialect="duckdb"
        )
        assert result == "window"

    def test_classify_count_aggregate(self):
        """Test classifying COUNT as aggregate."""
        result = classify_statement("COUNT(*)", dialect="duckdb")
        assert result == "aggregate"

    def test_classify_avg_aggregate(self):
        """Test classifying AVG as aggregate."""
        result = classify_statement("AVG(price)", dialect="duckdb")
        assert result == "aggregate"


class TestStripSortOrder:
    """Tests for the strip_sort_order function."""

    def test_strip_desc(self):
        """Test stripping DESC from expression."""
        result = strip_sort_order("column_name DESC", dialect="duckdb")
        assert "DESC" not in result
        assert "column_name" in result

    def test_strip_asc(self):
        """Test stripping ASC from expression."""
        result = strip_sort_order("column_name ASC", dialect="duckdb")
        assert "ASC" not in result
        assert "column_name" in result

    def test_strip_no_ordering(self):
        """Test expression without ordering passes through unchanged."""
        result = strip_sort_order("column_name", dialect="duckdb")
        assert result == "column_name"

    def test_strip_from_aggregate(self):
        """Test stripping ordering from aggregate expression."""
        result = strip_sort_order("SUM(amount) DESC", dialect="duckdb")
        assert "DESC" not in result
        assert "SUM" in result.upper()
        assert "amount" in result


class TestParseExpression:
    """Tests for the parse_expression function."""

    def test_parse_simple_column(self):
        """Test parsing a simple column reference."""
        result = parse_expression("column_name", dialect="duckdb")
        assert result is not None

    def test_parse_aggregate_function(self):
        """Test parsing an aggregate function."""
        result = parse_expression("SUM(amount)", dialect="duckdb")
        assert result is not None
        assert has_aggregate_function(result) is True

    def test_parse_window_function(self):
        """Test parsing a window function."""
        result = parse_expression(
            "ROW_NUMBER() OVER (PARTITION BY category ORDER BY amount)", dialect="duckdb"
        )
        assert result is not None
        assert has_window_function(result) is True

    def test_parse_empty_string(self):
        """Test parsing empty string returns None."""
        result = parse_expression("", dialect="duckdb")
        assert result is None

    def test_parse_whitespace_only(self):
        """Test parsing whitespace only returns None."""
        result = parse_expression("   ", dialect="duckdb")
        assert result is None


class TestHasAggregateFunction:
    """Tests for the has_aggregate_function function."""

    def test_sum_is_aggregate(self):
        """Test SUM is detected as aggregate."""
        expr = parse_expression("SUM(amount)", dialect="duckdb")
        assert has_aggregate_function(expr) is True

    def test_count_is_aggregate(self):
        """Test COUNT is detected as aggregate."""
        expr = parse_expression("COUNT(*)", dialect="duckdb")
        assert has_aggregate_function(expr) is True

    def test_avg_is_aggregate(self):
        """Test AVG is detected as aggregate."""
        expr = parse_expression("AVG(price)", dialect="duckdb")
        assert has_aggregate_function(expr) is True

    def test_simple_column_not_aggregate(self):
        """Test simple column is not aggregate."""
        expr = parse_expression("column_name", dialect="duckdb")
        assert has_aggregate_function(expr) is False

    def test_arithmetic_not_aggregate(self):
        """Test arithmetic expression is not aggregate."""
        expr = parse_expression("price * quantity", dialect="duckdb")
        assert has_aggregate_function(expr) is False


class TestIdentifyColumnReferencesDialects:
    """Tests for dialect-specific identifier quoting in identify_column_references."""

    def test_bigquery_uses_backticks(self):
        """Test that BigQuery dialect uses backticks for identifiers."""
        model_hash = "model_abc"
        model_schema = {model_hash: {"amount": "INT", "date": "DATE"}}

        result = identify_column_references(
            model_hash=model_hash,
            model_schema=model_schema,
            expr_sql="amount",
            dialect="bigquery",
        )

        # BigQuery uses backticks for identifiers
        assert "`model_abc`.`amount`" in result
        # Should NOT use double quotes
        assert '"model_abc"' not in result

    def test_bigquery_aggregate_with_backticks(self):
        """Test that BigQuery uses backticks for aggregate expressions."""
        model_hash = "model_abc"
        model_schema = {model_hash: {"amount": "DECIMAL"}}

        result = identify_column_references(
            model_hash=model_hash,
            model_schema=model_schema,
            expr_sql="SUM(amount)",
            dialect="bigquery",
        )

        # BigQuery uses backticks
        assert "`model_abc`.`amount`" in result
        assert "SUM" in result.upper()

    def test_bigquery_case_expression(self):
        """Test that BigQuery uses backticks in CASE expressions."""
        model_hash = "model_abc"
        model_schema = {model_hash: {"status": "VARCHAR", "amount": "DECIMAL"}}

        result = identify_column_references(
            model_hash=model_hash,
            model_schema=model_schema,
            expr_sql="CASE WHEN status = 'active' THEN amount ELSE 0 END",
            dialect="bigquery",
        )

        # BigQuery uses backticks
        assert "`model_abc`.`status`" in result
        assert "`model_abc`.`amount`" in result
        # Should NOT use double quotes for identifiers
        assert '"model_abc"' not in result

    def test_postgres_uses_double_quotes(self):
        """Test that PostgreSQL dialect uses double quotes for identifiers."""
        model_hash = "model_abc"
        model_schema = {model_hash: {"amount": "INT"}}

        result = identify_column_references(
            model_hash=model_hash,
            model_schema=model_schema,
            expr_sql="amount",
            dialect="postgresql",
        )

        # PostgreSQL uses double quotes
        assert '"model_abc"."amount"' in result
        # Should NOT use backticks
        assert "`model_abc`" not in result

    def test_snowflake_uses_double_quotes_uppercase(self):
        """Test that Snowflake dialect uses UPPERCASE double-quoted identifiers.

        Snowflake stores unquoted identifiers as UPPERCASE, so our quoted
        identifiers must also be uppercase to match when accessed.
        """
        model_hash = "model_abc"
        model_schema = {model_hash: {"amount": "INT"}}

        result = identify_column_references(
            model_hash=model_hash,
            model_schema=model_schema,
            expr_sql="amount",
            dialect="snowflake",
        )

        # Snowflake uses double quotes with UPPERCASE identifiers
        assert '"MODEL_ABC"."AMOUNT"' in result

    def test_bigquery_with_sort_order(self):
        """Test that BigQuery preserves sort order with backticks."""
        model_hash = "model_abc"
        model_schema = {model_hash: {"date": "DATE"}}

        result = identify_column_references(
            model_hash=model_hash,
            model_schema=model_schema,
            expr_sql="date DESC",
            dialect="bigquery",
        )

        # BigQuery uses backticks and preserves sort order
        assert "`model_abc`.`date`" in result
        assert "DESC" in result

    def test_clickhouse_uses_double_quotes(self):
        """Test that ClickHouse dialect uses double quotes for identifiers."""
        model_hash = "model_abc"
        model_schema = {model_hash: {"amount": "INT"}}

        result = identify_column_references(
            model_hash=model_hash,
            model_schema=model_schema,
            expr_sql="amount",
            dialect="clickhouse",
        )

        # ClickHouse uses double quotes
        assert '"model_abc"."amount"' in result
        # Should NOT use backticks
        assert "`model_abc`" not in result

    def test_clickhouse_aggregate_with_double_quotes(self):
        """Test that ClickHouse uses double quotes for aggregate expressions."""
        model_hash = "model_abc"
        model_schema = {model_hash: {"amount": "DECIMAL"}}

        result = identify_column_references(
            model_hash=model_hash,
            model_schema=model_schema,
            expr_sql="SUM(amount)",
            dialect="clickhouse",
        )

        # ClickHouse uses double quotes
        assert '"model_abc"."amount"' in result
        assert "SUM" in result.upper()

    def test_clickhouse_with_sort_order(self):
        """Test that ClickHouse preserves sort order with double quotes."""
        model_hash = "model_abc"
        model_schema = {model_hash: {"date": "DATE"}}

        result = identify_column_references(
            model_hash=model_hash,
            model_schema=model_schema,
            expr_sql="date DESC",
            dialect="clickhouse",
        )

        # ClickHouse uses double quotes and preserves sort order
        assert '"model_abc"."date"' in result
        assert "DESC" in result


class TestFindNonAggregatedExpressionsDialects:
    """Tests for dialect-specific identifier quoting in find_non_aggregated_expressions."""

    def test_bigquery_uses_backticks_in_group_by(self):
        """Test that BigQuery dialect uses backticks for GROUP BY expressions."""
        # Parse a CASE expression that would need to go in GROUP BY
        expr = parse_expression(
            "CASE WHEN `model_hash`.`status` = 'active' THEN 'yes' ELSE 'no' END",
            dialect="bigquery",
        )

        result = find_non_aggregated_expressions(expr, dialect="bigquery")

        # Should have at least one expression
        assert len(result) > 0
        # All expressions should use backticks, not double quotes
        for expr_sql in result:
            assert "`" in expr_sql
            assert '"model_hash"' not in expr_sql

    def test_postgres_uses_double_quotes_in_group_by(self):
        """Test that PostgreSQL dialect uses double quotes for GROUP BY expressions."""
        expr = parse_expression(
            '"model_hash"."column" + 1',
            dialect="postgres",
        )

        result = find_non_aggregated_expressions(expr, dialect="postgresql")

        # Should have at least one expression
        assert len(result) > 0
        # All expressions should use double quotes
        for expr_sql in result:
            assert '"' in expr_sql or "model_hash" in expr_sql

    def test_aggregate_not_in_group_by(self):
        """Test that aggregate expressions are not included in GROUP BY."""
        expr = parse_expression(
            "SUM(`model_hash`.`amount`)",
            dialect="bigquery",
        )

        result = find_non_aggregated_expressions(expr, dialect="bigquery")

        # Aggregates should not be in GROUP BY
        assert len(result) == 0

    def test_mixed_aggregate_and_column(self):
        """Test expression with both aggregate and non-aggregate parts."""
        expr = parse_expression(
            "CASE WHEN `model_hash`.`status` = 'active' THEN SUM(`model_hash`.`amount`) ELSE 0 END",
            dialect="bigquery",
        )

        result = find_non_aggregated_expressions(expr, dialect="bigquery")

        # Should include the status column reference but not the amount (inside aggregate)
        assert any("`status`" in expr_sql for expr_sql in result)


class TestSchemaFromSqlMultiSchema:
    """Tests for schema_from_sql with multi-schema (nested) schema structures."""

    def test_schema_from_sql_with_nested_schema(self):
        """Test schema resolution with nested schema structure."""
        from sqlglot import exp
        from visivo.query.sqlglot_utils import schema_from_sql

        schema = {
            "EDW": {"fact_order": {"col1": exp.DataType.build("INT")}},
            "REPORTING": {"goals": {"goal_col": exp.DataType.build("DECIMAL")}},
        }
        sql = "SELECT col1 FROM fact_order"
        result = schema_from_sql("snowflake", sql, schema, "test", default_schema="EDW")
        assert "test" in result
        assert "col1" in result["test"]

    def test_schema_from_sql_with_qualified_table(self):
        """Test schema resolution when table is explicitly qualified."""
        from sqlglot import exp
        from visivo.query.sqlglot_utils import schema_from_sql

        schema = {
            "EDW": {"fact_order": {"col1": exp.DataType.build("INT")}},
            "REPORTING": {"goals": {"goal_col": exp.DataType.build("DECIMAL")}},
        }
        sql = "SELECT goal_col FROM REPORTING.goals"
        result = schema_from_sql("snowflake", sql, schema, "test", default_schema="EDW")
        assert "test" in result
        assert "goal_col" in result["test"]

    def test_schema_from_sql_with_flat_schema_backwards_compatible(self):
        """Test that flat schema still works (backwards compatibility)."""
        from sqlglot import exp
        from visivo.query.sqlglot_utils import schema_from_sql

        schema = {
            "fact_order": {"col1": exp.DataType.build("INT")},
            "goals": {"goal_col": exp.DataType.build("DECIMAL")},
        }
        sql = "SELECT col1 FROM fact_order"
        result = schema_from_sql("snowflake", sql, schema, "test")
        assert "test" in result
        assert "col1" in result["test"]

    def test_schema_from_sql_default_schema_none(self):
        """Test that default_schema=None still works for flat schemas."""
        from sqlglot import exp
        from visivo.query.sqlglot_utils import schema_from_sql

        schema = {
            "users": {"id": exp.DataType.build("INT"), "name": exp.DataType.build("VARCHAR")},
        }
        sql = "SELECT id, name FROM users"
        result = schema_from_sql("duckdb", sql, schema, "test_model", default_schema=None)
        assert "test_model" in result
        assert "id" in result["test_model"]
        assert "name" in result["test_model"]


class TestHasWindowFunction:
    """Tests for the has_window_function function."""

    def test_row_number_is_window(self):
        """Test ROW_NUMBER is detected as window function."""
        expr = parse_expression("ROW_NUMBER() OVER (ORDER BY amount)", dialect="duckdb")
        assert has_window_function(expr) is True

    def test_rank_is_window(self):
        """Test RANK is detected as window function."""
        expr = parse_expression(
            "RANK() OVER (PARTITION BY category ORDER BY amount)", dialect="duckdb"
        )
        assert has_window_function(expr) is True

    def test_sum_over_is_window(self):
        """Test SUM OVER is detected as window function."""
        expr = parse_expression("SUM(amount) OVER (PARTITION BY category)", dialect="duckdb")
        assert has_window_function(expr) is True

    def test_simple_aggregate_not_window(self):
        """Test simple aggregate without OVER is not window."""
        expr = parse_expression("SUM(amount)", dialect="duckdb")
        assert has_window_function(expr) is False

    def test_simple_column_not_window(self):
        """Test simple column is not window function."""
        expr = parse_expression("column_name", dialect="duckdb")
        assert has_window_function(expr) is False


class TestSchemaFromSqlWithComments:
    """Tests for schema_from_sql handling of SQL comments.

    SQL comments in column references can cause qualify() to fail
    because the string representation includes the comment text.
    For example: '"col" /* comment */' won't match schema entry '"col"'.
    """

    def test_column_with_inline_comment_resolves(self):
        """Columns with /* comments */ should resolve correctly."""
        from sqlglot import exp
        from visivo.query.sqlglot_utils import schema_from_sql

        sql = 'SELECT col AS "result" /* comment */ FROM t'
        schema = {"t": {"col": exp.DataType.build("INT")}}
        result = schema_from_sql("duckdb", sql, schema, "model")
        assert "model" in result
        assert "result" in result["model"]

    def test_column_alias_with_trailing_comment(self):
        """Column aliases followed by comments should resolve."""
        from sqlglot import exp
        from visivo.query.sqlglot_utils import schema_from_sql

        sql = 'SELECT a AS "col1" /* First column */, b FROM t'
        schema = {"t": {"a": exp.DataType.build("INT"), "b": exp.DataType.build("VARCHAR")}}
        result = schema_from_sql("snowflake", sql, schema, "model")
        assert "model" in result
        assert "col1" in result["model"]
        assert "b" in result["model"]

    def test_multiline_comment_in_select(self):
        """Multiline comments should not break column resolution."""
        from sqlglot import exp
        from visivo.query.sqlglot_utils import schema_from_sql

        sql = """
        SELECT
            /* This is a multiline
               comment explaining the column */
            amount,
            date_col
        FROM orders
        """
        schema = {
            "orders": {
                "amount": exp.DataType.build("DECIMAL"),
                "date_col": exp.DataType.build("DATE"),
            }
        }
        result = schema_from_sql("duckdb", sql, schema, "model")
        assert "model" in result
        assert "amount" in result["model"]
        assert "date_col" in result["model"]

    def test_double_dash_comment_in_select(self):
        """Double-dash comments should not break column resolution."""
        from sqlglot import exp
        from visivo.query.sqlglot_utils import schema_from_sql

        sql = """
        SELECT
            amount, -- this is the order amount
            quantity -- number of items
        FROM orders
        """
        schema = {
            "orders": {
                "amount": exp.DataType.build("DECIMAL"),
                "quantity": exp.DataType.build("INT"),
            }
        }
        result = schema_from_sql("duckdb", sql, schema, "model")
        assert "model" in result
        assert "amount" in result["model"]
        assert "quantity" in result["model"]

    def test_comment_after_quoted_identifier(self):
        """Comments after quoted identifiers should not break resolution."""
        from sqlglot import exp
        from visivo.query.sqlglot_utils import schema_from_sql

        sql = 'SELECT "escalation_in_next_1d" /* Escalation predictions */ FROM predictions'
        schema = {
            "predictions": {
                "escalation_in_next_1d": exp.DataType.build("BOOLEAN"),
            }
        }
        result = schema_from_sql("duckdb", sql, schema, "model")
        assert "model" in result
        assert "escalation_in_next_1d" in result["model"]

    def test_complex_query_with_multiple_comments(self):
        """Complex query with multiple comments in various places."""
        from sqlglot import exp
        from visivo.query.sqlglot_utils import schema_from_sql

        sql = """
        SELECT
            /* Selecting user data */
            u.id,           -- user identifier
            u.name,         /* user name */
            o.total AS order_total  -- aggregated total
        FROM users u  /* main user table */
        JOIN orders o /* order details */
            ON u.id = o.user_id
        """
        schema = {
            "users": {
                "id": exp.DataType.build("INT"),
                "name": exp.DataType.build("VARCHAR"),
            },
            "orders": {
                "user_id": exp.DataType.build("INT"),
                "total": exp.DataType.build("DECIMAL"),
            },
        }
        result = schema_from_sql("duckdb", sql, schema, "model")
        assert "model" in result
        assert "id" in result["model"]
        assert "name" in result["model"]
        assert "order_total" in result["model"]


class TestNormalizeIdentifierForDialect:
    """Tests for dialect-aware identifier case normalization.

    Different SQL dialects have different case-folding rules:
    - Snowflake: unquoted identifiers stored as UPPERCASE
    - PostgreSQL: unquoted identifiers stored as lowercase
    - MySQL/BigQuery/DuckDB: case is generally preserved
    """

    def test_snowflake_uppercases_identifier(self):
        """Test that Snowflake dialect uppercases identifiers."""
        result = normalize_identifier_for_dialect("my_column", "snowflake")
        assert result.this == "MY_COLUMN"
        assert result.args.get("quoted") is True

    def test_snowflake_uppercases_mixed_case(self):
        """Test that Snowflake uppercases mixed case identifiers."""
        result = normalize_identifier_for_dialect("MyColumn", "snowflake")
        assert result.this == "MYCOLUMN"

    def test_postgres_lowercases_identifier(self):
        """Test that PostgreSQL dialect lowercases identifiers."""
        result = normalize_identifier_for_dialect("MY_COLUMN", "postgresql")
        assert result.this == "my_column"
        assert result.args.get("quoted") is True

    def test_postgres_lowercases_mixed_case(self):
        """Test that PostgreSQL lowercases mixed case identifiers."""
        result = normalize_identifier_for_dialect("MyColumn", "postgresql")
        assert result.this == "mycolumn"

    def test_mysql_preserves_case(self):
        """Test that MySQL dialect preserves case."""
        result = normalize_identifier_for_dialect("MyColumn", "mysql")
        assert result.this == "MyColumn"
        assert result.args.get("quoted") is True

    def test_bigquery_preserves_case(self):
        """Test that BigQuery dialect preserves case."""
        result = normalize_identifier_for_dialect("MyColumn", "bigquery")
        assert result.this == "MyColumn"
        assert result.args.get("quoted") is True

    def test_duckdb_preserves_case(self):
        """Test that DuckDB dialect preserves case."""
        result = normalize_identifier_for_dialect("MyColumn", "duckdb")
        assert result.this == "MyColumn"
        assert result.args.get("quoted") is True

    def test_unquoted_option(self):
        """Test that quoted=False produces unquoted identifier."""
        result = normalize_identifier_for_dialect("my_column", "duckdb", quoted=False)
        assert result.this == "my_column"
        assert result.args.get("quoted") is False

    def test_snowflake_sql_output(self):
        """Test that Snowflake identifier generates correct SQL."""
        result = normalize_identifier_for_dialect("my_column", "snowflake")
        sql = result.sql(dialect="snowflake")
        assert sql == '"MY_COLUMN"'

    def test_bigquery_sql_output(self):
        """Test that BigQuery identifier generates correct SQL with backticks."""
        result = normalize_identifier_for_dialect("my_column", "bigquery")
        sql = result.sql(dialect="bigquery")
        assert sql == "`my_column`"

    def test_mysql_sql_output(self):
        """Test that MySQL identifier generates correct SQL with backticks."""
        result = normalize_identifier_for_dialect("my_column", "mysql")
        sql = result.sql(dialect="mysql")
        assert sql == "`my_column`"

    def test_postgres_sql_output(self):
        """Test that PostgreSQL identifier generates correct SQL."""
        result = normalize_identifier_for_dialect("MY_COLUMN", "postgresql")
        sql = result.sql(dialect="postgres")
        assert sql == '"my_column"'

    def test_clickhouse_preserves_case(self):
        """Test that ClickHouse dialect preserves case."""
        result = normalize_identifier_for_dialect("MyColumn", "clickhouse")
        assert result.this == "MyColumn"
        assert result.args.get("quoted") is True

    def test_clickhouse_sql_output(self):
        """Test that ClickHouse identifier generates correct SQL with double quotes."""
        result = normalize_identifier_for_dialect("my_column", "clickhouse")
        sql = result.sql(dialect="clickhouse")
        assert sql == '"my_column"'

    def test_clickhouse_mixed_case_preserved(self):
        """Test that ClickHouse preserves mixed case identifiers."""
        result = normalize_identifier_for_dialect("MyMixedCase", "clickhouse")
        assert result.this == "MyMixedCase"
        sql = result.sql(dialect="clickhouse")
        assert sql == '"MyMixedCase"'
