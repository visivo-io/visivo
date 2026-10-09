"""The agent's read-only data tools (VIS-1414..). Each one calls the service
the UI's route calls, is bounded, and labels what it returns as data."""

import json

import pytest

from visivo.agent import data_tools
from visivo.agent.tools import TOOLS, ToolError, call
from visivo.query.schema_aggregator import SchemaAggregator


def _source(integration_app):
    return integration_app.project.sources[0]


class TestDescribeSource:
    def test_it_introspects_once_and_caches_under_the_preview_run(
        self, integration_app, monkeypatch
    ):
        source = _source(integration_app)
        assert SchemaAggregator.load_source_schema_with_fallback(
            source.name, integration_app.output_dir
        ) == (None, None)

        first = call(integration_app, "describe_source", {"name": source.name})

        assert first["schema_from"] == f"preview-{source.name}"
        assert {t["name"] for t in first["tables"]} >= {"test_table", "second_test_table"}
        columns = next(t for t in first["tables"] if t["name"] == "test_table")["columns"]
        assert [c["name"] for c in columns] == ["x", "y"]

        monkeypatch.setattr(
            type(source),
            "get_schema",
            lambda self, table_names=None: pytest.fail("re-introspected"),
        )
        second = call(integration_app, "describe_source", {"name": source.name})

        assert second["tables"] == first["tables"]

    def test_it_never_runs_seeds(self, integration_app, monkeypatch):
        """run_source_schema_action runs each seed's shell command before it
        introspects; a read-only tool must not go through it."""
        from visivo.jobs import run_source_schema_job

        monkeypatch.setattr(
            run_source_schema_job, "run_seeds", lambda *a, **k: pytest.fail("seeds ran")
        )
        monkeypatch.setattr(
            run_source_schema_job, "action", lambda *a, **k: pytest.fail("schema job ran")
        )

        assert call(integration_app, "describe_source", {"name": _source(integration_app).name})[
            "tables"
        ]

    def test_one_table(self, integration_app):
        result = call(
            integration_app,
            "describe_source",
            {"name": _source(integration_app).name, "table": "test_table"},
        )

        assert [t["name"] for t in result["tables"]] == ["test_table"]
        assert result["total_tables"] >= 2

    def test_an_unknown_table_lists_the_real_ones(self, integration_app):
        with pytest.raises(ToolError, match="test_table"):
            call(
                integration_app,
                "describe_source",
                {"name": _source(integration_app).name, "table": "nope"},
            )

    def test_an_unknown_source_is_a_refusal(self, integration_app):
        with pytest.raises(ToolError, match="No source named 'nope'"):
            call(integration_app, "describe_source", {"name": "nope"})
        with pytest.raises(ToolError, match="required"):
            call(integration_app, "describe_source", {})

    def test_the_table_list_is_capped_and_flagged(self, integration_app, monkeypatch):
        monkeypatch.setattr(data_tools, "MAX_TABLES", 1)

        result = call(integration_app, "describe_source", {"name": _source(integration_app).name})

        assert len(result["tables"]) == 1 and result["tables_truncated"] is True

    def test_nothing_about_the_connection_leaks(self, integration_app):
        source = _source(integration_app)
        text = json.dumps(call(integration_app, "describe_source", {"name": source.name}))

        assert source.database not in text
        assert "password" not in text.lower()
        assert data_tools.DATA_NOTICE in text

    def test_a_schema_the_run_wrote_is_preferred(self, integration_app):
        source = _source(integration_app)
        SchemaAggregator.aggregate_source_schema(
            source.name,
            source.type,
            {"tables": {"from_main": {"columns": {"a": {"type": "INT"}}}}},
            integration_app.output_dir,
        )

        result = call(integration_app, "describe_source", {"name": source.name})

        assert result["schema_from"] == "main" and [t["name"] for t in result["tables"]] == [
            "from_main"
        ]


class TestPreviewTable:
    def test_rows_come_back_labelled_as_data(self, integration_app):
        result = call(
            integration_app,
            "preview_table",
            {"source": _source(integration_app).name, "table": "test_table"},
        )

        assert result["note"] == data_tools.DATA_NOTICE
        assert result["columns"] == ["x", "y"] and result["row_count"] == 6
        assert result["rows"][0] == {"x": 1, "y": 1} and result["truncated"] is False

    def test_the_limit_is_clamped_to_fifty(self, integration_app, monkeypatch):
        seen = {}
        manager = integration_app.source_manager
        original = manager.get_table_preview

        def spy(*args, **kwargs):
            seen.update(kwargs)
            return original(*args, **kwargs)

        monkeypatch.setattr(manager, "get_table_preview", spy)
        call(
            integration_app,
            "preview_table",
            {"source": _source(integration_app).name, "table": "test_table", "limit": 500},
        )

        assert seen["limit"] == 50

    def test_a_limit_that_is_hit_is_flagged(self, integration_app):
        result = call(
            integration_app,
            "preview_table",
            {"source": _source(integration_app).name, "table": "test_table", "limit": 2},
        )

        assert result["row_count"] == 2 and result["truncated"] is True

    def test_a_bad_limit_is_a_refusal(self, integration_app):
        with pytest.raises(ToolError, match="integer"):
            call(
                integration_app,
                "preview_table",
                {"source": _source(integration_app).name, "table": "test_table", "limit": "lots"},
            )

    def test_an_unknown_table_is_a_refusal_not_a_crash(self, integration_app):
        with pytest.raises(ToolError):
            call(
                integration_app,
                "preview_table",
                {"source": _source(integration_app).name, "table": "nope"},
            )

    def test_table_is_required(self, integration_app):
        with pytest.raises(ToolError, match="'table' is required"):
            call(integration_app, "preview_table", {"source": _source(integration_app).name})

    def test_schema_dot_table_is_split(self, integration_app, monkeypatch):
        seen = {}
        manager = integration_app.source_manager

        def fake(source_name, database, table, schema_name=None, limit=100):
            seen.update(table=table, schema_name=schema_name)
            return {"status": "connected", "columns": ["x"], "rows": [{"x": 1}], "row_count": 1}

        monkeypatch.setattr(manager, "get_table_preview", fake)
        call(
            integration_app,
            "preview_table",
            {"source": _source(integration_app).name, "table": "public.test_table"},
        )

        assert seen == {"table": "test_table", "schema_name": "public"}


class TestRegistration:
    def test_the_data_tools_are_in_the_registry_and_over_mcp(self, integration_client):
        for name in data_tools.DATA_TOOLS:
            assert name in TOOLS
        response = integration_client.post(
            "/api/mcp/", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
        )
        listed = {t["name"] for t in json.loads(response.data)["result"]["tools"]}
        assert set(data_tools.DATA_TOOLS) <= listed

    def test_tool_error_is_still_importable_from_tools(self):
        from visivo.agent import tool_types, tools

        assert tools.ToolError is tool_types.ToolError and tools.Tool is tool_types.Tool


class TestQuerySourceGuard:
    """SQLGlot decides what runs (VIS-1415). Each refusal below was proven to
    pass with the guard removed, which is what makes it a guard."""

    def guard(self, sql, limit=200, dialect="sqlite"):
        return data_tools.guard_read_only(sql, dialect, limit)

    @pytest.mark.parametrize(
        "sql",
        [
            "INSERT INTO t VALUES (1)",
            "UPDATE t SET x = 1",
            "DELETE FROM t",
            "DROP TABLE t",
            "CREATE TABLE t (x INT)",
            "ATTACH 'evil.db' AS e",
            "PRAGMA table_info(t)",
            "COPY t TO '/tmp/out.csv'",
        ],
    )
    def test_anything_but_a_query_is_refused(self, sql):
        with pytest.raises(ToolError, match="Only read queries"):
            self.guard(sql, dialect="duckdb")

    def test_two_statements_are_refused(self):
        with pytest.raises(ToolError, match="exactly one statement"):
            self.guard("SELECT 1; SELECT 2")

    @pytest.mark.parametrize(
        "sql",
        [
            "SELECT * FROM read_csv('/etc/passwd')",
            "SELECT * FROM read_parquet('x.parquet')",
            "SELECT * FROM read_json_auto('x.json')",
            "SELECT pg_read_file('/etc/passwd')",
            "SELECT load_extension('x')",
            "SELECT * FROM glob('*')",
        ],
    )
    def test_file_reading_functions_are_refused(self, sql):
        with pytest.raises(ToolError, match="reads the server"):
            self.guard(sql, dialect="duckdb")

    def test_ctes_unions_and_subqueries_pass(self):
        assert "LIMIT 200" in self.guard("WITH c AS (SELECT 1 AS a) SELECT a FROM c")
        assert "LIMIT 200" in self.guard("SELECT 1 UNION ALL SELECT 2")
        assert "LIMIT 200" in self.guard("SELECT * FROM (SELECT x FROM t) AS s WHERE x > 1")

    def test_a_limit_is_injected_and_a_smaller_one_kept(self):
        assert self.guard("SELECT x FROM t", limit=50).endswith("LIMIT 50")
        assert self.guard("SELECT x FROM t LIMIT 5", limit=50).endswith("LIMIT 5")
        assert self.guard("SELECT x FROM t LIMIT 5000", limit=50).endswith("LIMIT 50")

    def test_a_parse_failure_names_the_dialect(self):
        with pytest.raises(ToolError, match="did not parse \\(sqlite\\)"):
            self.guard("SELECT FROM WHERE")

    def test_the_guard_is_dialect_aware(self):
        assert "LIMIT 10" in self.guard("SELECT x FROM t", limit=10, dialect="postgres")


class TestQuerySource:
    def test_rows_come_back_bounded_and_labelled(self, integration_app):
        result = call(
            integration_app,
            "query_source",
            {
                "source": _source(integration_app).name,
                "sql": "SELECT x, SUM(y) AS total FROM test_table GROUP BY x ORDER BY x",
            },
        )

        assert result["note"] == data_tools.DATA_NOTICE
        assert result["columns"] == ["x", "total"] and result["row_count"] == 6
        assert result["sql_executed"].endswith("LIMIT 200") and result["truncated"] is False
        assert isinstance(result["execution_time_ms"], int)

    def test_the_limit_applies(self, integration_app):
        result = call(
            integration_app,
            "query_source",
            {
                "source": _source(integration_app).name,
                "sql": "SELECT x FROM test_table",
                "limit": 2,
            },
        )

        assert result["row_count"] == 2 and result["sql_executed"].endswith("LIMIT 2")

    def test_a_write_never_reaches_the_source(self, integration_app):
        with pytest.raises(ToolError, match="Only read queries"):
            call(
                integration_app,
                "query_source",
                {"source": _source(integration_app).name, "sql": "DELETE FROM test_table"},
            )
        assert (
            call(
                integration_app,
                "preview_table",
                {"source": _source(integration_app).name, "table": "test_table"},
            )["row_count"]
            == 6
        )

    def test_a_driver_error_is_a_refusal_with_the_message(self, integration_app):
        with pytest.raises(ToolError, match="no_such"):
            call(
                integration_app,
                "query_source",
                {"source": _source(integration_app).name, "sql": "SELECT no_such FROM test_table"},
            )

    def test_a_timeout_is_a_refusal(self, integration_app, monkeypatch):
        from visivo.jobs.run_model_data_job import QueryTimeout

        def slow(*args, **kwargs):
            raise QueryTimeout("Query did not return within 20s.")

        monkeypatch.setattr(data_tools, "execute_and_get_result", slow)
        with pytest.raises(ToolError, match="within 20s"):
            call(
                integration_app,
                "query_source",
                {"source": _source(integration_app).name, "sql": "SELECT 1"},
            )

    def test_it_passes_the_agent_budget(self, integration_app, monkeypatch):
        seen = {}

        def fake(source, sql, **kwargs):
            seen.update(kwargs)
            return {
                "columns": ["x"],
                "rows": [{"x": 1}],
                "row_count": 1,
                "truncated": False,
                "execution_time_ms": 1,
            }

        monkeypatch.setattr(data_tools, "execute_and_get_result", fake)
        call(
            integration_app,
            "query_source",
            {"source": _source(integration_app).name, "sql": "SELECT 1", "limit": 7},
        )

        assert seen == {"max_rows": 7, "timeout_s": 20}

    def test_an_oversized_result_is_cut_by_bytes_and_flagged(self, integration_app, monkeypatch):
        wide = [{"blob": "x" * 1000, "i": i} for i in range(200)]

        def fake(source, sql, **kwargs):
            return {
                "columns": ["blob", "i"],
                "rows": wide,
                "row_count": 200,
                "truncated": False,
                "execution_time_ms": 1,
            }

        monkeypatch.setattr(data_tools, "execute_and_get_result", fake)
        result = call(
            integration_app,
            "query_source",
            {"source": _source(integration_app).name, "sql": "SELECT 1"},
        )

        assert result["truncated"] is True and 0 < result["row_count"] < 200
        assert len(json.dumps(result)) <= data_tools.MAX_RESULT_BYTES

    def test_sql_is_required(self, integration_app):
        with pytest.raises(ToolError, match="'sql' is required"):
            call(integration_app, "query_source", {"source": _source(integration_app).name})


class TestProfileColumns:
    def test_a_table_profiles_into_cards(self, integration_app):
        result = call(
            integration_app,
            "profile_columns",
            {"source": _source(integration_app).name, "table": "test_table"},
        )

        assert result["note"] == data_tools.DATA_NOTICE and result["row_count"] == 6
        cards = {c["column"]: c for c in result["cards"]}
        assert cards["x"]["role"] == "numeric_discrete" and cards["x"]["cardinality"] == 6
        assert cards["y"]["top_n"] and "raw profile" not in json.dumps(result)
        assert result["sql"].upper().startswith("SELECT * FROM")

    def test_a_query_profiles_too_and_is_guarded(self, integration_app):
        result = call(
            integration_app,
            "profile_columns",
            {
                "source": _source(integration_app).name,
                "sql": "SELECT x, y * 2 AS y2 FROM test_table",
            },
        )

        assert [c["column"] for c in result["cards"]] == ["x", "y2"]
        with pytest.raises(ToolError, match="Only read queries"):
            call(
                integration_app,
                "profile_columns",
                {"source": _source(integration_app).name, "sql": "DELETE FROM test_table"},
            )

    def test_exactly_one_of_table_or_sql(self, integration_app):
        with pytest.raises(ToolError, match="exactly one"):
            call(integration_app, "profile_columns", {"source": _source(integration_app).name})
        with pytest.raises(ToolError, match="exactly one"):
            call(
                integration_app,
                "profile_columns",
                {"source": _source(integration_app).name, "table": "t", "sql": "select 1"},
            )

    def test_columns_and_sample_rows_are_honoured(self, integration_app, monkeypatch):
        seen = {}
        original = data_tools.ProfilingService.profile_query

        def spy(self, source, sql, **kwargs):
            seen.update(kwargs)
            return original(self, source, sql, **kwargs)

        monkeypatch.setattr(data_tools.ProfilingService, "profile_query", spy)
        result = call(
            integration_app,
            "profile_columns",
            {
                "source": _source(integration_app).name,
                "table": "test_table",
                "columns": ["y"],
                "sample_rows": 3,
            },
        )

        assert seen["columns"] == ["y"] and seen["sample_rows"] == 3 and seen["timeout_s"] == 20
        assert [c["column"] for c in result["cards"]] == ["y"]
        assert result["sampled"] is True and result["row_count"] == 6

    def test_too_many_columns_is_a_refusal(self, integration_app):
        with pytest.raises(ToolError, match="at most 40"):
            call(
                integration_app,
                "profile_columns",
                {
                    "source": _source(integration_app).name,
                    "table": "test_table",
                    "columns": [f"c{i}" for i in range(41)],
                },
            )

    def test_a_bad_table_is_a_refusal_with_the_driver_message(self, integration_app):
        with pytest.raises(ToolError, match="Could not profile"):
            call(
                integration_app,
                "profile_columns",
                {"source": _source(integration_app).name, "table": "no_such_table"},
            )

    def test_a_timeout_is_a_refusal(self, integration_app, monkeypatch):
        from visivo.jobs.run_model_data_job import QueryTimeout

        def slow(self, *args, **kwargs):
            raise QueryTimeout("Query did not return within 20s.")

        monkeypatch.setattr(data_tools.ProfilingService, "profile_query", slow)
        with pytest.raises(ToolError, match="within 20s"):
            call(
                integration_app,
                "profile_columns",
                {"source": _source(integration_app).name, "table": "test_table"},
            )


class TestProfileModel:
    def _write_model(self, integration_app, name="built_model"):
        import pyarrow as pa
        import pyarrow.parquet as pq
        import os

        from visivo.output_paths import model_data_file, run_dir

        call(
            integration_app,
            "write_model",
            {
                "config": {
                    "name": name,
                    "sql": "SELECT x FROM test_table",
                    "source": f"ref({_source(integration_app).name})",
                }
            },
        )
        path = model_data_file(run_dir(integration_app.output_dir), name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        pq.write_table(
            pa.table({"x": pa.array([1, 2, 3, 3]), "kind": pa.array(["a", "b", "a", "a"])}), path
        )
        return name

    def test_a_built_model_profiles_from_its_parquet(self, integration_app):
        name = self._write_model(integration_app)

        result = call(integration_app, "profile_model", {"name": name, "columns": ["kind"]})

        assert result["model"] == name and result["row_count"] == 4
        assert [c["column"] for c in result["cards"]] == ["kind"] and result["cards"][0][
            "role"
        ] == "categorical"

    def test_an_unbuilt_model_says_how_to_profile_it_anyway(self, integration_app):
        call(
            integration_app,
            "write_model",
            {
                "config": {
                    "name": "unbuilt",
                    "sql": "SELECT 1 AS one",
                    "source": f"ref({_source(integration_app).name})",
                }
            },
        )

        with pytest.raises(ToolError, match="no built data yet"):
            call(integration_app, "profile_model", {"name": "unbuilt"})

    def test_an_unknown_model_is_a_refusal(self, integration_app):
        with pytest.raises(ToolError, match="No model named"):
            call(integration_app, "profile_model", {"name": "ghost"})
        with pytest.raises(ToolError, match="required"):
            call(integration_app, "profile_model", {})


class TestInferColumns:
    def _cache_schema(self, integration_app):
        call(integration_app, "describe_source", {"name": _source(integration_app).name})

    def test_sql_plus_source(self, integration_app):
        self._cache_schema(integration_app)

        result = call(
            integration_app,
            "infer_columns",
            {"sql": "SELECT x, y AS why FROM test_table", "source": _source(integration_app).name},
        )

        assert [c["name"] for c in result["columns"]] == ["why", "x"]
        assert result["source_schema_cached"] is True and result["warnings"] == []

    def test_a_draft_model_resolves_its_own_source(self, integration_app):
        self._cache_schema(integration_app)
        call(
            integration_app,
            "write_model",
            {
                "config": {
                    "name": "drafted",
                    "sql": "SELECT x FROM test_table",
                    "source": f"ref({_source(integration_app).name})",
                }
            },
        )

        result = call(integration_app, "infer_columns", {"model": "drafted"})

        assert [c["name"] for c in result["columns"]] == ["x"] and result["source"] == _source(
            integration_app
        ).name

    def test_an_unaliased_expression_is_called_out(self, integration_app):
        self._cache_schema(integration_app)

        result = call(
            integration_app,
            "infer_columns",
            {"sql": "SELECT x, y * 2 FROM test_table", "source": _source(integration_app).name},
        )

        names = [c["name"] for c in result["columns"]]
        assert "x" in names and len(names) == 2
        assert result["warnings"] and "alias" in result["warnings"][0]

    def test_arguments_are_checked(self, integration_app):
        with pytest.raises(ToolError, match="Pass 'model', or 'sql'"):
            call(integration_app, "infer_columns", {"sql": "select 1"})
        with pytest.raises(ToolError, match="No model named"):
            call(integration_app, "infer_columns", {"model": "ghost"})
        with pytest.raises(ToolError, match="No source resolved"):
            call(integration_app, "infer_columns", {"sql": "select 1", "source": "nope"})

    def test_a_model_without_sql_is_a_refusal(self, integration_app, monkeypatch):
        monkeypatch.setattr(
            data_tools, "find_model", lambda app, name: type("M", (), {"sql": None})()
        )

        with pytest.raises(ToolError, match="no SQL"):
            call(integration_app, "infer_columns", {"model": "csvish"})
