"""
Test suite for run_input_job module.

This tests the Input Job System Core - processing both static and query-based input options.
"""

import pytest
from pathlib import Path
from visivo.jobs.run_input_job import action, job
from tests.factories.model_factories import (
    InputFactory,
    ProjectFactory,
    SqlModelFactory,
    SourceFactory,
)
from tests.support.utils import temp_folder
import polars as pl
from sqlglot import parse_one
from sqlglot.optimizer import qualify


class TestRunInputJob:
    """Test suite for Input Job execution."""

    def test_static_options_stores_parquet(self):
        """Verify static options stored as parquet with correct data."""
        # ARRANGE
        input_obj = InputFactory(name="category_filter", options=["electronics", "books", "toys"])
        project = ProjectFactory(inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        # ACT
        result = action(input_obj, dag, output_dir)

        # ASSERT
        assert result.success
        parquet_path = Path(output_dir) / "inputs" / f"{input_obj.name_hash()}.parquet"
        assert parquet_path.exists()

        df = pl.read_parquet(parquet_path)
        assert df.shape[0] == 3
        assert set(df["option"].to_list()) == {"electronics", "books", "toys"}

    def test_query_based_options_executes_on_source(self):
        """Verify query runs on source backend, not DuckDB."""
        # ARRANGE
        source = SourceFactory(name="source")
        model = SqlModelFactory(
            name="products",
            sql="SELECT 'cat_a' as category UNION SELECT 'cat_b'",
            source="ref(source)",
        )
        input_obj = InputFactory(
            name="category_input",
            options="?{ SELECT category FROM ${ref(products)} }",
        )
        project = ProjectFactory(sources=[source], models=[model], inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        # ACT
        result = action(input_obj, dag, output_dir)

        # ASSERT
        assert result.success
        parquet_path = Path(output_dir) / "inputs" / f"{input_obj.name_hash()}.parquet"
        assert parquet_path.exists()

        df = pl.read_parquet(parquet_path)
        assert df.shape[0] == 2
        assert "option" in df.columns

    def test_query_with_subquery_replacement(self):
        """Verify ${ref(model)} replaced with (model.sql) subquery."""
        # ARRANGE
        source = SourceFactory(name="source")
        model = SqlModelFactory(
            name="orders", sql="SELECT 'shipped' as status", source="ref(source)"
        )
        input_obj = InputFactory(
            name="status_filter",
            options="?{ SELECT DISTINCT status FROM ${ref(orders)} }",
        )
        project = ProjectFactory(sources=[source], models=[model], inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        # ACT
        result = action(input_obj, dag, output_dir)

        # ASSERT
        assert result.success
        parquet_path = Path(output_dir) / "inputs" / f"{input_obj.name_hash()}.parquet"
        assert parquet_path.exists()

        df = pl.read_parquet(parquet_path)
        assert df.shape[0] == 1
        assert df["option"][0] == "shipped"

    def test_empty_result_raises_error(self):
        """Verify helpful error when query returns 0 results."""
        # ARRANGE
        source = SourceFactory(name="source")
        model = SqlModelFactory(
            name="empty_model", sql="SELECT 'test' as col WHERE 1=0", source="ref(source)"
        )
        input_obj = InputFactory(
            name="empty_input",
            options="?{ SELECT col FROM ${ref(empty_model)} }",
        )
        project = ProjectFactory(sources=[source], models=[model], inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        # ACT
        result = action(input_obj, dag, output_dir)

        # ASSERT
        assert not result.success
        assert "0 rows" in result.message or "empty" in result.message.lower()

    def test_empty_static_options_raises_error(self):
        """Verify error when static options list is empty."""
        # ARRANGE
        input_obj = InputFactory(name="empty_static", options=[])
        project = ProjectFactory(inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        # ACT
        result = action(input_obj, dag, output_dir)

        # ASSERT
        assert not result.success
        assert "empty" in result.message.lower() or "0" in result.message

    def test_multiple_inputs_each_get_own_file(self):
        """Verify each input creates separate parquet."""
        # ARRANGE
        input1 = InputFactory(name="input_one", options=["a", "b"])
        input2 = InputFactory(name="input_two", options=["x", "y", "z"])
        project = ProjectFactory(inputs=[input1, input2])
        dag = project.dag()
        output_dir = temp_folder()

        # ACT
        result1 = action(input1, dag, output_dir)
        result2 = action(input2, dag, output_dir)

        # ASSERT
        assert result1.success
        assert result2.success

        path1 = Path(output_dir) / "inputs" / f"{input1.name_hash()}.parquet"
        path2 = Path(output_dir) / "inputs" / f"{input2.name_hash()}.parquet"

        assert path1.exists()
        assert path2.exists()

        df1 = pl.read_parquet(path1)
        df2 = pl.read_parquet(path2)

        assert df1.shape[0] == 2
        assert df2.shape[0] == 3

    def test_job_assigns_correct_source(self):
        """Verify job() assigns source for query-based inputs."""
        # ARRANGE
        source = SourceFactory(name="source")
        model = SqlModelFactory(name="data", sql="SELECT 1 as x", source="ref(source)")
        input_obj = InputFactory(
            name="query_input",
            options="?{ SELECT x FROM ${ref(data)} }",
        )
        project = ProjectFactory(sources=[source], models=[model], inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        # ACT
        job_obj = job(dag, output_dir, input_obj)

        # ASSERT
        assert job_obj is not None
        assert job_obj.source is not None
        assert job_obj.source.name == "source"

    def test_job_no_source_for_static_inputs(self):
        """Verify job() has no source for static inputs."""
        # ARRANGE
        input_obj = InputFactory(name="static_input", options=["a", "b", "c"])
        project = ProjectFactory(inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        # ACT
        job_obj = job(dag, output_dir, input_obj)

        # ASSERT
        assert job_obj is not None
        assert job_obj.source is None

    def test_parquet_has_option_column(self):
        """Verify parquet schema has 'option' column."""
        # ARRANGE
        input_obj = InputFactory(name="test", options=["value1", "value2"])
        project = ProjectFactory(inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        # ACT
        result = action(input_obj, dag, output_dir)

        # ASSERT
        assert result.success
        parquet_path = Path(output_dir) / "inputs" / f"{input_obj.name_hash()}.parquet"
        df = pl.read_parquet(parquet_path)

        assert "option" in df.columns
        assert df["option"].dtype == pl.Utf8

    def test_query_input_references_model(self):
        """Verify query inputs correctly reference SqlModel."""
        # ARRANGE
        source = SourceFactory(name="source")
        model = SqlModelFactory(name="my_model", sql="SELECT 'test' as val", source="ref(source)")
        input_obj = InputFactory(
            name="input",
            options="?{ SELECT val FROM ${ref(my_model)} }",
        )
        project = ProjectFactory(sources=[source], models=[model], inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        # ACT
        result = action(input_obj, dag, output_dir)

        # ASSERT
        assert result.success

    def test_action_returns_success_result(self):
        """Verify JobResult with success=True."""
        # ARRANGE
        input_obj = InputFactory(name="test", options=["a"])
        project = ProjectFactory(inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        # ACT
        result = action(input_obj, dag, output_dir)

        # ASSERT
        assert result is not None
        assert hasattr(result, "success")
        assert hasattr(result, "message")
        assert hasattr(result, "item")
        assert result.success is True
        assert result.item == input_obj

    def test_action_returns_failure_on_error(self):
        """Verify JobResult with success=False on exceptions."""
        # ARRANGE
        # Create a project with valid structure first
        source = SourceFactory(name="source")
        model = SqlModelFactory(name="valid_model", sql="SELECT 1 as x", source="ref(source)")
        project = ProjectFactory(sources=[source], models=[model], inputs=[])
        dag = project.dag()
        output_dir = temp_folder()

        # Create an input manually (after DAG is built) that will fail when action() is called
        # This simulates a runtime error during execution
        from visivo.models.inputs.types.dropdown import DropdownInput

        input_obj = DropdownInput(
            name="bad_input",
            options="?{ SELECT x FROM ${ref(nonexistent)} }",
        )

        # ACT
        result = action(input_obj, dag, output_dir)

        # ASSERT
        assert result is not None
        assert result.success is False
        assert "FAILURE" in result.message or "error" in result.message.lower()

    def test_query_with_new_refs_syntax(self):
        """Verify ${refs.model} syntax works in input queries."""
        # ARRANGE
        source = SourceFactory(name="source")
        model = SqlModelFactory(
            name="products",
            sql="SELECT 'electronics' as category UNION SELECT 'books'",
            source="ref(source)",
        )
        # Using new ${refs.name} syntax instead of legacy ${ref(name)}
        input_obj = InputFactory(
            name="category_filter",
            options="?{ SELECT category FROM ${refs.products} }",
        )
        project = ProjectFactory(sources=[source], models=[model], inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        # ACT
        result = action(input_obj, dag, output_dir)

        # ASSERT
        assert result.success, f"Expected success but got: {result.message}"
        parquet_path = Path(output_dir) / "inputs" / f"{input_obj.name_hash()}.parquet"
        assert parquet_path.exists()

        df = pl.read_parquet(parquet_path)
        assert df.shape[0] == 2
        assert set(df["option"].to_list()) == {"electronics", "books"}


class TestSQLGlotQualifySubqueryAlias:
    """Test that SQLGlot qualify.qualify() adds aliases to subqueries.

    MySQL requires derived tables (subqueries in FROM clause) to have aliases.
    SQLGlot's qualify.qualify() automatically adds these aliases.

    Error without alias:
        (pymysql.err.OperationalError) (1248, 'Every derived table must have its own alias')
        [SQL: select distinct x FROM (SELECT * FROM test_table)]

    After qualify:
        SELECT DISTINCT `_q_0`.`x` FROM (SELECT * FROM `test_table`) AS `_q_0`
    """

    def test_mysql_subquery_gets_alias(self):
        """Verify qualify.qualify() adds alias to MySQL subquery."""
        # This is the exact query pattern that fails without alias
        sql = "select distinct x FROM (SELECT * FROM test_table)"

        # Parse and qualify with MySQL dialect
        parsed = parse_one(sql, read="mysql")
        qualified = qualify.qualify(parsed, dialect="mysql")
        result = qualified.sql(dialect="mysql")

        # Should have alias like `_q_0`
        assert "AS `_q_" in result or "AS _q_" in result

    def test_postgres_subquery_gets_alias(self):
        """Verify qualify.qualify() adds alias to PostgreSQL subquery."""
        sql = "select distinct x FROM (SELECT * FROM test_table)"

        parsed = parse_one(sql, read="postgres")
        qualified = qualify.qualify(parsed, dialect="postgres")
        result = qualified.sql(dialect="postgres")

        # Should have alias
        assert 'AS "_q_' in result or "AS _q_" in result

    def test_bigquery_subquery_gets_alias(self):
        """Verify qualify.qualify() adds alias to BigQuery subquery."""
        sql = "select distinct x FROM (SELECT * FROM test_table)"

        parsed = parse_one(sql, read="bigquery")
        qualified = qualify.qualify(parsed, dialect="bigquery")
        result = qualified.sql(dialect="bigquery")

        # Should have alias
        assert "AS `_q_" in result or "AS _q_" in result

    def test_snowflake_subquery_gets_alias(self):
        """Verify qualify.qualify() adds alias to Snowflake subquery."""
        sql = "select distinct x FROM (SELECT * FROM test_table)"

        parsed = parse_one(sql, read="snowflake")
        qualified = qualify.qualify(parsed, dialect="snowflake")
        result = qualified.sql(dialect="snowflake")

        # Should have alias - Snowflake uppercases to "_Q_0"
        assert 'AS "_Q_' in result or 'AS "_q_' in result or "AS _q_" in result

    def test_duckdb_subquery_gets_alias(self):
        """Verify qualify.qualify() adds alias to DuckDB subquery."""
        sql = "select distinct x FROM (SELECT * FROM test_table)"

        parsed = parse_one(sql, read="duckdb")
        qualified = qualify.qualify(parsed, dialect="duckdb")
        result = qualified.sql(dialect="duckdb")

        # Should have alias
        assert 'AS "_q_' in result or "AS _q_" in result

    def test_already_aliased_subquery_preserved(self):
        """Verify already-aliased subqueries are preserved."""
        sql = "select distinct x FROM (SELECT * FROM test_table) AS my_alias"

        parsed = parse_one(sql, read="mysql")
        qualified = qualify.qualify(parsed, dialect="mysql")
        result = qualified.sql(dialect="mysql")

        # Original alias should be preserved
        assert "my_alias" in result.lower()
