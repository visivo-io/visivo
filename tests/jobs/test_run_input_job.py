"""
Test suite for run_input_job module.

This tests the Input Job System Core - processing both static and query-based input options.
"""

import pytest
import json
from pathlib import Path
from visivo.jobs.run_input_job import action, job
from tests.factories.model_factories import (
    SingleSelectInputFactory,
    MultiSelectInputFactory,
    ProjectFactory,
    SqlModelFactory,
    SourceFactory,
)
from tests.support.utils import temp_folder
from sqlglot import parse_one
from sqlglot.optimizer import qualify


class TestRunInputJobSingleSelect:
    """Test suite for SingleSelectInput Job execution."""

    def test_static_options_stores_json(self):
        """Verify static options stored as JSON with correct data."""
        input_obj = SingleSelectInputFactory(
            name="category_filter", options=["electronics", "books", "toys"]
        )
        project = ProjectFactory(inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        result = action(input_obj, dag, output_dir)

        assert result.success
        json_path = Path(output_dir) / "inputs" / f"{input_obj.name_hash()}.json"
        assert json_path.exists()

        with open(json_path) as f:
            data = json.load(f)

        assert data["type"] == "single-select"
        assert data["structure"] == "options"
        assert set(data["results"]["options"]) == {"electronics", "books", "toys"}

    def test_query_based_options_executes_on_source(self):
        """Verify query runs on source backend, not DuckDB."""
        source = SourceFactory(name="source")
        model = SqlModelFactory(
            name="products",
            sql="SELECT 'cat_a' as category UNION SELECT 'cat_b'",
            source="ref(source)",
        )
        input_obj = SingleSelectInputFactory(
            name="category_input",
            options="?{ SELECT category FROM ${ref(products)} }",
        )
        project = ProjectFactory(sources=[source], models=[model], inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        result = action(input_obj, dag, output_dir)

        assert result.success
        json_path = Path(output_dir) / "inputs" / f"{input_obj.name_hash()}.json"
        assert json_path.exists()

        with open(json_path) as f:
            data = json.load(f)

        assert len(data["results"]["options"]) == 2

    def test_query_with_subquery_replacement(self):
        """Verify ${ref(model)} replaced with (model.sql) subquery."""
        source = SourceFactory(name="source")
        model = SqlModelFactory(
            name="orders", sql="SELECT 'shipped' as status", source="ref(source)"
        )
        input_obj = SingleSelectInputFactory(
            name="status_filter",
            options="?{ SELECT DISTINCT status FROM ${ref(orders)} }",
        )
        project = ProjectFactory(sources=[source], models=[model], inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        result = action(input_obj, dag, output_dir)

        assert result.success
        json_path = Path(output_dir) / "inputs" / f"{input_obj.name_hash()}.json"
        assert json_path.exists()

        with open(json_path) as f:
            data = json.load(f)

        assert len(data["results"]["options"]) == 1
        assert data["results"]["options"][0] == "shipped"

    def test_empty_result_raises_error(self):
        """Verify helpful error when query returns 0 results."""
        source = SourceFactory(name="source")
        model = SqlModelFactory(
            name="empty_model", sql="SELECT 'test' as col WHERE 1=0", source="ref(source)"
        )
        input_obj = SingleSelectInputFactory(
            name="empty_input",
            options="?{ SELECT col FROM ${ref(empty_model)} }",
        )
        project = ProjectFactory(sources=[source], models=[model], inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        result = action(input_obj, dag, output_dir)

        assert not result.success
        assert "0 rows" in result.message or "empty" in result.message.lower()

    def test_empty_static_options_raises_validation_error(self):
        """Verify validation error when static options list is empty.

        Empty options are now validated at model creation time by Pydantic validators.
        """
        from pydantic import ValidationError
        from visivo.models.inputs.types.single_select import SingleSelectInput

        with pytest.raises(ValidationError) as exc_info:
            SingleSelectInput(name="empty_static", options=[])

        assert "empty options list" in str(exc_info.value).lower()

    def test_multiple_inputs_each_get_own_file(self):
        """Verify each input creates separate JSON."""
        input1 = SingleSelectInputFactory(name="input_one", options=["a", "b"])
        input2 = SingleSelectInputFactory(name="input_two", options=["x", "y", "z"])
        project = ProjectFactory(inputs=[input1, input2])
        dag = project.dag()
        output_dir = temp_folder()

        result1 = action(input1, dag, output_dir)
        result2 = action(input2, dag, output_dir)

        assert result1.success
        assert result2.success

        path1 = Path(output_dir) / "inputs" / f"{input1.name_hash()}.json"
        path2 = Path(output_dir) / "inputs" / f"{input2.name_hash()}.json"

        assert path1.exists()
        assert path2.exists()

        with open(path1) as f:
            data1 = json.load(f)
        with open(path2) as f:
            data2 = json.load(f)

        assert len(data1["results"]["options"]) == 2
        assert len(data2["results"]["options"]) == 3

    def test_job_assigns_correct_source(self):
        """Verify job() assigns source for query-based inputs."""
        source = SourceFactory(name="source")
        model = SqlModelFactory(name="data", sql="SELECT 1 as x", source="ref(source)")
        input_obj = SingleSelectInputFactory(
            name="query_input",
            options="?{ SELECT x FROM ${ref(data)} }",
        )
        project = ProjectFactory(sources=[source], models=[model], inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        job_obj = job(dag, output_dir, input_obj)

        assert job_obj is not None
        assert job_obj.source is not None
        assert job_obj.source.name == "source"

    def test_job_no_source_for_static_inputs(self):
        """Verify job() has no source for static inputs."""
        input_obj = SingleSelectInputFactory(name="static_input", options=["a", "b", "c"])
        project = ProjectFactory(inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        job_obj = job(dag, output_dir, input_obj)

        assert job_obj is not None
        assert job_obj.source is None

    def test_action_returns_success_result(self):
        """Verify JobResult with success=True."""
        input_obj = SingleSelectInputFactory(name="test", options=["a"])
        project = ProjectFactory(inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        result = action(input_obj, dag, output_dir)

        assert result is not None
        assert hasattr(result, "success")
        assert hasattr(result, "message")
        assert hasattr(result, "item")
        assert result.success is True
        assert result.item == input_obj

    def test_action_returns_warnings_attribute(self):
        """Verify JobResult includes warnings attribute."""
        input_obj = SingleSelectInputFactory(name="test", options=["a", "b", "c"])
        project = ProjectFactory(inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        result = action(input_obj, dag, output_dir)

        assert result.success is True
        assert hasattr(result, "warnings")
        assert isinstance(result.warnings, list)
        assert len(result.warnings) == 0  # No warnings for small option count

    def test_large_option_count_generates_warning(self, mocker):
        """Verify warning generated when option count exceeds threshold."""
        # Patch the threshold to a small value for testing
        mocker.patch("visivo.jobs.run_input_job.OPTION_COUNT_WARNING_THRESHOLD", 5)
        mocker.patch("visivo.jobs.run_input_job.OPTION_COUNT_ERROR_THRESHOLD", 100)

        input_obj = SingleSelectInputFactory(
            name="large_options", options=["opt1", "opt2", "opt3", "opt4", "opt5", "opt6", "opt7"]
        )
        project = ProjectFactory(inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        result = action(input_obj, dag, output_dir)

        assert result.success is True
        assert len(result.warnings) == 1
        assert "large_options" in result.warnings[0]
        assert "7" in result.warnings[0]  # Option count in warning message

    def test_exceeds_error_threshold_fails(self, mocker):
        """Verify error raised when option count exceeds error threshold."""
        # Patch the threshold to a small value for testing
        mocker.patch("visivo.jobs.run_input_job.OPTION_COUNT_WARNING_THRESHOLD", 3)
        mocker.patch("visivo.jobs.run_input_job.OPTION_COUNT_ERROR_THRESHOLD", 5)

        input_obj = SingleSelectInputFactory(
            name="too_many", options=["a", "b", "c", "d", "e", "f", "g"]
        )
        project = ProjectFactory(inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        result = action(input_obj, dag, output_dir)

        assert result.success is False
        assert "too_many" in result.message
        assert "exceeding" in result.message.lower()


class TestRunInputJobMultiSelect:
    """Test suite for MultiSelectInput Job execution."""

    def test_list_based_stores_json(self):
        """Verify list-based multi-select stores JSON correctly."""
        input_obj = MultiSelectInputFactory(
            name="categories", options=["electronics", "books", "toys"]
        )
        project = ProjectFactory(inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        result = action(input_obj, dag, output_dir)

        assert result.success
        json_path = Path(output_dir) / "inputs" / f"{input_obj.name_hash()}.json"
        assert json_path.exists()

        with open(json_path) as f:
            data = json.load(f)

        assert data["type"] == "multi-select"
        assert data["structure"] == "options"
        assert set(data["results"]["options"]) == {"electronics", "books", "toys"}

    def test_range_based_stores_json(self):
        """Verify range-based multi-select stores JSON correctly."""
        input_obj = MultiSelectInputFactory(
            name="price_range",
            options=None,
            range={"start": 0, "end": 100, "step": 10},
        )
        project = ProjectFactory(inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        result = action(input_obj, dag, output_dir)

        assert result.success
        json_path = Path(output_dir) / "inputs" / f"{input_obj.name_hash()}.json"
        assert json_path.exists()

        with open(json_path) as f:
            data = json.load(f)

        assert data["type"] == "multi-select"
        assert data["structure"] == "range"
        assert data["results"]["range"]["start"] == 0
        assert data["results"]["range"]["end"] == 100
        assert data["results"]["range"]["step"] == 10


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
        sql = "select distinct x FROM (SELECT * FROM test_table)"

        parsed = parse_one(sql, read="mysql")
        qualified = qualify.qualify(parsed, dialect="mysql")
        result = qualified.sql(dialect="mysql")

        assert "AS `_q_" in result or "AS _q_" in result

    def test_postgres_subquery_gets_alias(self):
        """Verify qualify.qualify() adds alias to PostgreSQL subquery."""
        sql = "select distinct x FROM (SELECT * FROM test_table)"

        parsed = parse_one(sql, read="postgres")
        qualified = qualify.qualify(parsed, dialect="postgres")
        result = qualified.sql(dialect="postgres")

        assert 'AS "_q_' in result or "AS _q_" in result

    def test_bigquery_subquery_gets_alias(self):
        """Verify qualify.qualify() adds alias to BigQuery subquery."""
        sql = "select distinct x FROM (SELECT * FROM test_table)"

        parsed = parse_one(sql, read="bigquery")
        qualified = qualify.qualify(parsed, dialect="bigquery")
        result = qualified.sql(dialect="bigquery")

        assert "AS `_q_" in result or "AS _q_" in result

    def test_snowflake_subquery_gets_alias(self):
        """Verify qualify.qualify() adds alias to Snowflake subquery."""
        sql = "select distinct x FROM (SELECT * FROM test_table)"

        parsed = parse_one(sql, read="snowflake")
        qualified = qualify.qualify(parsed, dialect="snowflake")
        result = qualified.sql(dialect="snowflake")

        assert 'AS "_Q_' in result or 'AS "_q_' in result or "AS _q_" in result

    def test_duckdb_subquery_gets_alias(self):
        """Verify qualify.qualify() adds alias to DuckDB subquery."""
        sql = "select distinct x FROM (SELECT * FROM test_table)"

        parsed = parse_one(sql, read="duckdb")
        qualified = qualify.qualify(parsed, dialect="duckdb")
        result = qualified.sql(dialect="duckdb")

        assert 'AS "_q_' in result or "AS _q_" in result

    def test_already_aliased_subquery_preserved(self):
        """Verify already-aliased subqueries are preserved."""
        sql = "select distinct x FROM (SELECT * FROM test_table) AS my_alias"

        parsed = parse_one(sql, read="mysql")
        qualified = qualify.qualify(parsed, dialect="mysql")
        result = qualified.sql(dialect="mysql")

        assert "my_alias" in result.lower()
