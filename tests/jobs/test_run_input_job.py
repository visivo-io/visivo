"""
Test suite for run_input_job module.

This tests the Input Job System Core - processing both static and query-based input options.
Output follows the insights pattern:
- Parquet files in {output_dir}/files/{hash}_{key}.parquet for query-based list data
- Metadata JSON in {output_dir}/inputs/{hash}.json with file references
- Static options stored in static_props field
"""

import pytest
import json
from pathlib import Path
import polars as pl
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

    def test_static_options_stores_in_static_props(self):
        """Verify static options stored in static_props field (no parquet file)."""
        input_obj = SingleSelectInputFactory(
            name="category_filter", options=["electronics", "books", "toys"]
        )
        project = ProjectFactory(inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        result = action(input_obj, dag, output_dir)

        assert result.success
        json_path = Path(output_dir) / "main" / "inputs" / f"{input_obj.name}.json"
        assert json_path.exists()

        with open(json_path) as f:
            data = json.load(f)

        assert data["type"] == "single-select"
        assert data["structure"] == "options"
        assert data["files"] == []  # No parquet for static options
        assert set(data["static_props"]["options"]) == {"electronics", "books", "toys"}

    def test_query_based_options_creates_parquet(self):
        """Verify query-based options create parquet file with file reference."""
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
        json_path = Path(output_dir) / "main" / "inputs" / f"{input_obj.name}.json"
        assert json_path.exists()

        with open(json_path) as f:
            data = json.load(f)

        # Query-based options should have files array with parquet reference
        assert len(data["files"]) == 1
        assert data["files"][0]["key"] == "options"
        assert "_options" in data["files"][0]["name_hash"]
        assert data["static_props"] is None  # No static props for query-based

        # Verify parquet file exists
        parquet_path = Path(data["files"][0]["signed_data_file_url"])
        assert parquet_path.exists()

        # Verify parquet content
        df = pl.read_parquet(parquet_path)
        assert df.shape[0] == 2
        assert "option" in df.columns

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
        json_path = Path(output_dir) / "main" / "inputs" / f"{input_obj.name}.json"
        assert json_path.exists()

        with open(json_path) as f:
            data = json.load(f)

        # Query-based should have parquet file
        assert len(data["files"]) == 1
        parquet_path = Path(data["files"][0]["signed_data_file_url"])
        df = pl.read_parquet(parquet_path)
        assert df.shape[0] == 1
        assert df["option"][0] == "shipped"

    def test_query_is_a_bare_column_ref(self):
        """A dropped column (`?{${ref(model).col}}`, no hand-typed SQL around
        it — the shape the viewer's Options field drop produces) selects just
        that column, deduplicated, not every column on the model (VIS-1327)."""
        source = SourceFactory(name="source")
        model = SqlModelFactory(
            name="ev_sales",
            sql=(
                "SELECT 'west' as region, 'BEV' as powertrain "
                "UNION ALL SELECT 'west', 'PHEV' "
                "UNION ALL SELECT 'east', 'BEV'"
            ),
            source="ref(source)",
        )
        input_obj = SingleSelectInputFactory(
            name="region_filter",
            options="?{${ref(ev_sales).region}}",
        )
        project = ProjectFactory(sources=[source], models=[model], inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        result = action(input_obj, dag, output_dir)

        assert result.success
        json_path = Path(output_dir) / "main" / "inputs" / f"{input_obj.name}.json"
        with open(json_path) as f:
            data = json.load(f)

        parquet_path = Path(data["files"][0]["signed_data_file_url"])
        df = pl.read_parquet(parquet_path)
        assert df.shape == (2, 1)
        assert set(df["option"]) == {"west", "east"}

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

        path1 = Path(output_dir) / "main" / "inputs" / f"{input1.name}.json"
        path2 = Path(output_dir) / "main" / "inputs" / f"{input2.name}.json"

        assert path1.exists()
        assert path2.exists()

        with open(path1) as f:
            data1 = json.load(f)
        with open(path2) as f:
            data2 = json.load(f)

        # Static options in static_props
        assert len(data1["static_props"]["options"]) == 2
        assert len(data2["static_props"]["options"]) == 3

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

    def test_list_based_static_stores_in_static_props(self):
        """Verify list-based multi-select stores static options in static_props."""
        input_obj = MultiSelectInputFactory(
            name="categories", options=["electronics", "books", "toys"]
        )
        project = ProjectFactory(inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        result = action(input_obj, dag, output_dir)

        assert result.success
        json_path = Path(output_dir) / "main" / "inputs" / f"{input_obj.name}.json"
        assert json_path.exists()

        with open(json_path) as f:
            data = json.load(f)

        assert data["type"] == "multi-select"
        assert data["structure"] == "options"
        assert data["files"] == []  # No parquet for static options
        assert set(data["static_props"]["options"]) == {"electronics", "books", "toys"}

    def test_range_based_stores_in_static_props(self):
        """Verify range-based multi-select stores range values in static_props."""
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
        json_path = Path(output_dir) / "main" / "inputs" / f"{input_obj.name}.json"
        assert json_path.exists()

        with open(json_path) as f:
            data = json.load(f)

        assert data["type"] == "multi-select"
        assert data["structure"] == "range"
        assert data["files"] == []  # Range values are scalars, not in parquet
        assert data["static_props"]["range"]["start"] == 0
        assert data["static_props"]["range"]["end"] == 100
        assert data["static_props"]["range"]["step"] == 10

    def test_query_based_options_creates_parquet(self):
        """Verify query-based multi-select options create parquet file."""
        source = SourceFactory(name="source")
        model = SqlModelFactory(
            name="categories",
            sql="SELECT 'A' as cat UNION SELECT 'B' UNION SELECT 'C'",
            source="ref(source)",
        )
        input_obj = MultiSelectInputFactory(
            name="category_input",
            options="?{ SELECT cat FROM ${ref(categories)} }",
        )
        project = ProjectFactory(sources=[source], models=[model], inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        result = action(input_obj, dag, output_dir)

        assert result.success
        json_path = Path(output_dir) / "main" / "inputs" / f"{input_obj.name}.json"

        with open(json_path) as f:
            data = json.load(f)

        # Query-based should have parquet file reference
        assert len(data["files"]) == 1
        assert data["files"][0]["key"] == "options"
        assert data["static_props"] is None

        # Verify parquet file exists and has correct content
        parquet_path = Path(data["files"][0]["signed_data_file_url"])
        assert parquet_path.exists()
        df = pl.read_parquet(parquet_path)
        assert df.shape[0] == 3


class TestMetadataJSONStructure:
    """Test the metadata JSON structure matches insights pattern."""

    def test_static_input_json_structure(self):
        """Verify static input JSON has correct structure aligned with insights."""
        input_obj = SingleSelectInputFactory(name="test_input", options=["a", "b"])
        project = ProjectFactory(inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        action(input_obj, dag, output_dir)

        json_path = Path(output_dir) / "main" / "inputs" / f"{input_obj.name}.json"
        with open(json_path) as f:
            data = json.load(f)

        # Required fields (aligned with insights pattern)
        assert "name" in data
        assert "files" in data
        assert "type" in data
        assert "structure" in data
        assert "static_props" in data
        assert "display" in data
        assert "warnings" in data

        # Values for static input
        assert data["name"] == "test_input"
        assert data["files"] == []
        assert data["type"] == "single-select"
        assert data["structure"] == "options"
        assert data["static_props"]["options"] == ["a", "b"]

    def test_query_input_json_structure(self):
        """Verify query-based input JSON has correct file reference structure."""
        source = SourceFactory(name="source")
        model = SqlModelFactory(name="data", sql="SELECT 'x' as col", source="ref(source)")
        input_obj = SingleSelectInputFactory(
            name="query_test", options="?{ SELECT col FROM ${ref(data)} }"
        )
        project = ProjectFactory(sources=[source], models=[model], inputs=[input_obj])
        dag = project.dag()
        output_dir = temp_folder()

        action(input_obj, dag, output_dir)

        json_path = Path(output_dir) / "main" / "inputs" / f"{input_obj.name}.json"
        with open(json_path) as f:
            data = json.load(f)

        # Files array structure (like insights)
        assert len(data["files"]) == 1
        file_ref = data["files"][0]
        assert "name_hash" in file_ref
        assert "signed_data_file_url" in file_ref
        assert "key" in file_ref

        # Static props should be None for query-based
        assert data["static_props"] is None


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


class TestMultiSelectDefaults:
    """VIS-1460: what the run ships for `display.default.values`.

    The viewer expands the documented literals (`all` = every option, `none` =
    nothing) and reads query-based defaults from a `defaults` parquet, so the
    run must (a) pass the literals through untouched and (b) actually write the
    defaults file with a `value` column.
    """

    def _run(self, input_obj, **project_kwargs):
        project = ProjectFactory(inputs=[input_obj], **project_kwargs)
        output_dir = temp_folder()
        result = action(input_obj, project.dag(), output_dir)
        assert result.success, result.message
        with open(Path(output_dir) / "main" / "inputs" / f"{input_obj.name}.json") as f:
            return json.load(f)

    def test_literal_all_is_shipped_unchanged(self):
        input_obj = MultiSelectInputFactory(
            name="groups",
            options=["Group 1", "Group 2"],
            display={"type": "checkboxes", "default": {"values": "all"}},
        )
        data = self._run(input_obj)
        assert data["display"]["default"]["values"] == "all"
        assert data["files"] == []

    def test_literal_none_is_shipped_unchanged(self):
        input_obj = MultiSelectInputFactory(
            name="groups",
            options=["Group 1", "Group 2"],
            display={"type": "chips", "default": {"values": "none"}},
        )
        data = self._run(input_obj)
        assert data["display"]["default"]["values"] == "none"

    def test_no_display_defaults_to_all(self):
        input_obj = MultiSelectInputFactory(name="groups", options=["a", "b"], display=None)
        data = self._run(input_obj)
        assert data["display"] == {"type": "dropdown", "default": {"values": "all"}}

    def test_explicit_list_is_stringified(self):
        input_obj = MultiSelectInputFactory(
            name="nums",
            options=["1", "2", "3"],
            display={"type": "range-slider", "default": {"values": [1, 2]}},
        )
        data = self._run(input_obj)
        assert data["display"]["default"]["values"] == ["1", "2"]

    def test_query_default_writes_defaults_parquet(self):
        source = SourceFactory(name="source")
        model = SqlModelFactory(
            name="xs",
            sql="SELECT 1 as x UNION SELECT 2 UNION SELECT 3 UNION SELECT 4",
            source="ref(source)",
        )
        input_obj = MultiSelectInputFactory(
            name="query_default",
            options="?{ SELECT x FROM ${ref(xs)} }",
            display={
                "type": "checkboxes",
                "default": {"values": "?{ SELECT x FROM ${ref(xs)} WHERE x <= 2 }"},
            },
        )
        data = self._run(input_obj, sources=[source], models=[model])

        # The literal slot is null: the viewer must read the parquet instead.
        assert data["display"]["default"]["values"] is None

        files_by_key = {f["key"]: f for f in data["files"]}
        assert set(files_by_key) == {"options", "defaults"}
        defaults_file = files_by_key["defaults"]
        assert defaults_file["name_hash"] == f"{input_obj.name_hash()}_defaults"
        assert defaults_file["signed_data_file_url"].endswith("query_default_defaults.parquet")

        df = pl.read_parquet(defaults_file["signed_data_file_url"])
        assert df.columns == ["value"]
        assert sorted(df["value"].to_list()) == [1, 2]

        options_df = pl.read_parquet(files_by_key["options"]["signed_data_file_url"])
        assert options_df.columns == ["option"]
        assert options_df.shape[0] == 4


class TestOptionsQueryErrors:
    """The options query names one SQL model on a source and returns one
    non-empty column; each way it misses says which."""

    def _dag(self, *models):
        source = SourceFactory(name="source")
        project = ProjectFactory(sources=[source], models=list(models))
        return project.dag()

    def _run(self, query, *models, **kwargs):
        from visivo.jobs.run_input_job import _execute_query_for_options

        return _execute_query_for_options(
            query, self._dag(*models), "pick", temp_folder(), **kwargs
        )

    def test_a_query_with_no_ref_is_refused(self):
        with pytest.raises(ValueError, match="must reference exactly one model"):
            self._run("SELECT 1")

    def test_a_query_with_two_refs_is_refused(self):
        a = SqlModelFactory(name="a", sql="SELECT 1 AS x", source="ref(source)")
        b = SqlModelFactory(name="b", sql="SELECT 2 AS x", source="ref(source)")
        with pytest.raises(ValueError, match="references 2 items"):
            self._run("SELECT x FROM ${ref(a)} UNION SELECT x FROM ${ref(b)}", a, b)

    def test_a_ref_to_a_source_is_refused(self):
        with pytest.raises(ValueError, match="can only reference SqlModel"):
            self._run("SELECT 1 FROM ${ref(source)}")

    def test_a_model_with_no_source_is_refused(self, mocker):
        model = SqlModelFactory(name="m", sql="SELECT 1 AS x", source="ref(source)")
        mocker.patch("visivo.jobs.run_input_job.get_source_for_model", return_value=None)
        with pytest.raises(ValueError, match="Could not find source for model 'm'"):
            self._run("SELECT x FROM ${ref(m)}", model)

    def test_more_than_one_column_is_refused(self):
        model = SqlModelFactory(name="m", sql="SELECT 1 AS x, 2 AS y", source="ref(source)")
        with pytest.raises(ValueError, match="exactly one column, found 2"):
            self._run("SELECT x, y FROM ${ref(m)}", model)

    def test_a_slow_source_raises_query_timeout(self, mocker):
        from visivo.jobs.run_model_data_job import QueryTimeout

        model = SqlModelFactory(name="m", sql="SELECT 1 AS x", source="ref(source)")
        mocker.patch(
            "visivo.jobs.run_input_job.execute_and_get_result", side_effect=QueryTimeout("slow")
        )
        with pytest.raises(QueryTimeout):
            self._run("SELECT x FROM ${ref(m)}", model, timeout_s=1)


class TestSingleSelectDefaults:
    def _metadata(self, input_obj, models=()):
        source = SourceFactory(name="source")
        project = ProjectFactory(sources=[source], models=list(models), inputs=[input_obj])
        output_dir = temp_folder()
        result = action(input_obj, project.dag(), output_dir)
        assert result.success, result.message
        with open(Path(output_dir) / "main" / "inputs" / f"{input_obj.name}.json") as f:
            return json.load(f)

    def test_a_static_default_is_kept(self):
        input_obj = SingleSelectInputFactory(
            name="mode",
            options=["lines", "markers"],
            display={"type": "radio", "default": {"value": "markers"}},
        )

        display = self._metadata(input_obj)["display"]

        assert display == {"type": "radio", "default": {"value": "markers"}}


class TestMultiSelectQueries:
    def _project(self, input_obj):
        source = SourceFactory(name="source")
        model = SqlModelFactory(name="m", sql="SELECT 1 AS x UNION SELECT 5", source="ref(source)")
        return ProjectFactory(sources=[source], models=[model], inputs=[input_obj])

    def test_query_options_give_the_job_its_source(self):
        input_obj = MultiSelectInputFactory(name="xs", options="?{ SELECT x FROM ${ref(m)} }")

        assert job(self._project(input_obj).dag(), temp_folder(), input_obj).source.name == "source"

    def test_a_query_default_gives_the_job_its_source(self):
        input_obj = MultiSelectInputFactory(
            name="xs",
            options=["1", "5"],
            display={"type": "checkboxes", "default": {"values": "?{ SELECT x FROM ${ref(m)} }"}},
        )

        assert job(self._project(input_obj).dag(), temp_folder(), input_obj).source.name == "source"

    def test_option_counts_warn_then_fail(self, mocker):
        mocker.patch("visivo.jobs.run_input_job.OPTION_COUNT_WARNING_THRESHOLD", 1)
        mocker.patch("visivo.jobs.run_input_job.OPTION_COUNT_ERROR_THRESHOLD", 2)
        two = MultiSelectInputFactory(name="two", options=["a", "b"])
        three = MultiSelectInputFactory(name="three", options=["a", "b", "c"])

        warned = action(two, ProjectFactory(inputs=[two]).dag(), temp_folder())
        failed = action(three, ProjectFactory(inputs=[three]).dag(), temp_folder())

        assert warned.success and "has 2 options" in warned.warnings[0]
        assert not failed.success and "exceeding the 2 limit" in failed.message


class TestScalarQueries:
    def _dag(self):
        source = SourceFactory(name="source")
        model = SqlModelFactory(name="m", sql="SELECT 1 AS x UNION SELECT 5", source="ref(source)")
        return ProjectFactory(sources=[source], models=[model]).dag()

    def test_a_query_value_resolves_to_its_one_value(self):
        from visivo.jobs.run_input_job import _resolve_value
        from visivo.models.base.query_string import QueryString

        value = QueryString("?{ SELECT MAX(x) FROM ${ref(m)} }")

        assert _resolve_value(value, self._dag(), "span", "range.end", temp_folder()) == "5"
        assert _resolve_value(7, self._dag(), "span", "range.end", temp_folder()) == 7

    def test_a_scalar_query_with_many_values_is_refused(self):
        from visivo.jobs.run_input_job import _execute_scalar_query

        with pytest.raises(ValueError, match="range.start query returned 2 values"):
            _execute_scalar_query(
                "SELECT x FROM ${ref(m)}", self._dag(), "span", "range.start", temp_folder()
            )

    def test_an_object_that_is_no_input_fails_the_job(self):
        not_an_input = SqlModelFactory(name="m", sql="SELECT 1 AS x", source="ref(source)")

        result = action(not_an_input, self._dag(), temp_folder())

        assert not result.success and "Unknown input type: SqlModel" in result.message

    def test_a_model_the_dag_cannot_find_leaves_the_job_without_a_source(self, mocker):
        input_obj = SingleSelectInputFactory(name="xs", options="?{ SELECT x FROM ${ref(m)} }")
        dag = self._dag()
        mocker.patch.object(dag, "get_descendant_by_name", side_effect=ValueError("gone"))

        assert job(dag, temp_folder(), input_obj).source is None
