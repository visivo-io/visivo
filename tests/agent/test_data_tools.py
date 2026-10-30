"""The agent's read-only data tools (VIS-1414..). Each one calls the service
the UI's route calls, is bounded, and labels what it returns as data."""

import json
import os

import pytest

from visivo.agent import data_tools
from visivo.agent.data_tools import model_cards
from visivo.agent.tools import TOOLS, ToolError, call
from visivo.query.schema_aggregator import SchemaAggregator
from visivo.server.services import draft_insight


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

        call(
            integration_app,
            "preview_table",
            {"source": _source(integration_app).name, "table": "db.public.test_table"},
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
        with pytest.raises(ToolError, match="profile_columns failed on .*no_such_table"):
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


class TestModelCards:
    def _write(self, app, name, sql):
        config = {"name": name, "sql": sql, "source": f"ref({_source(app).name})"}
        call(app, "write_model", {"config": config})

    def test_a_built_model_is_carded_from_its_parquet(self, integration_app):
        name = TestProfileModel()._write_model(integration_app)

        cards = model_cards(integration_app, name)

        assert {c["column"] for c in cards} == {"x", "kind"}
        assert {c["model"] for c in cards} == {name}

    def test_an_unbuilt_model_is_carded_from_its_sql(self, integration_app):
        self._write(integration_app, "unbuilt", "SELECT 1 AS one, 'a' AS kind")

        cards = model_cards(integration_app, "unbuilt")

        assert [(c["column"], c["model"]) for c in cards] == [
            ("one", "unbuilt"),
            ("kind", "unbuilt"),
        ]

    def test_an_unknown_model_is_a_refusal(self, integration_app):
        with pytest.raises(ToolError, match="No model named 'ghost'"):
            model_cards(integration_app, "ghost")

    def test_an_unbuilt_model_with_no_source_is_a_refusal(self, integration_app, monkeypatch):
        self._write(integration_app, "orphan", "SELECT 1 AS one")
        monkeypatch.setattr(data_tools, "source_for_model", lambda *a: None)

        with pytest.raises(ToolError, match="no built data and no SQL"):
            model_cards(integration_app, "orphan")


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


class TestPreviewInsight:
    """VIS-1417: the Explorer's draft preview, callable by the agent, with
    inputs filled in instead of refused."""

    @pytest.fixture
    def model(self, integration_app):
        call(integration_app, "describe_source", {"name": _source(integration_app).name})
        call(
            integration_app,
            "write_model",
            {
                "config": {
                    "name": "orders_q",
                    "sql": "SELECT x, y FROM test_table",
                    "source": f"ref({_source(integration_app).name})",
                }
            },
        )
        return "orders_q"

    def _config(self, name="by_x", interactions=None, **props):
        base = {"type": "bar", "x": "?{${ref(orders_q).x}}", "y": "?{sum(${ref(orders_q).y})}"}
        base.update(props)
        config = {"name": name, "props": base}
        if interactions:
            config["interactions"] = interactions
        return config

    def test_a_config_previews_against_the_full_source(self, integration_app, model):
        result = call(integration_app, "preview_insight", {"config": self._config()})

        assert result["note"] == data_tools.DATA_NOTICE
        assert (
            result["row_count"] == 6
            and result["type"] == "bar"
            and result["models"] == ["orders_q"]
        )
        assert set(result["props_mapping"]) == {"props.x", "props.y"}
        assert result["inputs_substituted"] == {} and result["truncated"] is False

    def test_a_metric_written_with_its_model_previews(self, integration_app, model):
        metric = {"name": "total_y", "expression": "sum(y)", "model": "orders_q"}
        call(integration_app, "write_metric", {"config": metric})
        config = self._config(y="?{${ref(orders_q).total_y}}")

        result = call(integration_app, "preview_insight", {"config": config})

        assert result["row_count"] == 6 and result["models"] == ["orders_q"]

    def test_a_saved_insight_previews_by_name(self, integration_app, model):
        call(integration_app, "write_insight", {"config": self._config(name="saved")})

        result = call(integration_app, "preview_insight", {"name": "saved", "limit": 2})

        assert (
            result["insight"] == "saved"
            and result["row_count"] == 2
            and result["truncated"] is True
        )

    def test_an_input_is_filled_with_its_default(self, integration_app, model):
        call(
            integration_app,
            "write_input",
            {
                "config": {
                    "name": "min_x",
                    "type": "single-select",
                    "options": ["2", "4"],
                    "display": {"type": "dropdown", "default": {"value": "4"}},
                }
            },
        )
        config = self._config(
            interactions=[{"filter": "?{${ref(orders_q).x} > ${ref(min_x).value}}"}]
        )

        result = call(integration_app, "preview_insight", {"config": config})

        assert result["inputs_substituted"] == {"min_x": {"value": "4"}}
        assert result["row_count"] == 2

    def test_input_values_override_the_default(self, integration_app, model):
        call(
            integration_app,
            "write_input",
            {"config": {"name": "min_x", "type": "single-select", "options": ["2", "4"]}},
        )
        config = self._config(
            interactions=[{"filter": "?{${ref(orders_q).x} > ${ref(min_x).value}}"}]
        )

        result = call(
            integration_app, "preview_insight", {"config": config, "input_values": {"min_x": 2}}
        )

        assert (
            result["inputs_substituted"] == {"min_x": {"value": "2"}} and result["row_count"] == 4
        )

    def test_a_multi_select_renders_as_a_list(self, integration_app, model):
        call(
            integration_app,
            "write_input",
            {"config": {"name": "xs", "type": "multi-select", "options": ["1", "2", "3"]}},
        )
        config = self._config(
            interactions=[{"filter": "?{${ref(orders_q).x} IN (${ref(xs).values})}"}]
        )

        result = call(
            integration_app, "preview_insight", {"config": config, "input_values": {"xs": [1, 2]}}
        )

        assert result["inputs_substituted"]["xs"]["values"] == "1, 2" and result["row_count"] == 2

    def test_a_prop_that_is_the_placeholder_gets_the_bare_value(self, integration_app, model):
        call(
            integration_app,
            "write_input",
            {
                "config": {
                    "name": "mode_toggle",
                    "type": "single-select",
                    "options": ["lines", "markers"],
                }
            },
        )
        config = self._config(type="scatter", mode="${ref(mode_toggle).value}")

        result = call(
            integration_app,
            "preview_insight",
            {"config": config, "input_values": {"mode_toggle": "markers"}},
        )

        assert result["inputs_substituted"] == {"mode_toggle": {"value": "'markers'"}}
        assert result["type"] == "scatter"

    def test_a_ref_to_nothing_is_left_for_the_compiler_to_refuse(self, integration_app, model):
        config = self._config(
            interactions=[{"filter": "?{${ref(orders_q).x} > ${ref(ghost).value}}"}]
        )

        with pytest.raises(ToolError):
            call(integration_app, "preview_insight", {"config": config})

    def test_a_repeated_input_reference_is_resolved_once(self, integration_app, model):
        call(
            integration_app,
            "write_input",
            {"config": {"name": "min_x", "type": "single-select", "options": ["2", "4"]}},
        )
        loads = []
        original = draft_insight.get_sample_value_for_input

        def counting(*args, **kwargs):
            loads.append(args)
            return original(*args, **kwargs)

        monkeypatch = pytest.MonkeyPatch()
        monkeypatch.setattr(draft_insight, "get_sample_value_for_input", counting)
        try:
            config = self._config(
                interactions=[
                    {"filter": "?{${ref(orders_q).x} > ${ref(min_x).value}}"},
                    {"filter": "?{${ref(orders_q).y} > ${ref(min_x).value}}"},
                ]
            )
            result = call(integration_app, "preview_insight", {"config": config})
        finally:
            monkeypatch.undo()

        assert len(loads) == 1 and result["inputs_substituted"] == {"min_x": {"value": "2"}}

    def test_every_unbuilt_model_is_inferred_before_the_one_attempt(
        self, integration_app, model, monkeypatch
    ):
        attempts = []
        original = data_tools.execute_draft_insight

        def spy(app, output_dir, config, **kwargs):
            attempts.append(kwargs["model_schemas"])
            return original(app, output_dir, config, **kwargs)

        monkeypatch.setattr(data_tools, "execute_draft_insight", spy)
        call(integration_app, "preview_insight", {"config": self._config()})

        assert len(attempts) == 1
        assert set(attempts[0]) == {"orders_q"} and set(attempts[0]["orders_q"]) == {"x", "y"}

    def test_a_built_model_is_not_inferred(self, integration_app, model):
        import os

        import pyarrow as pa
        import pyarrow.parquet as pq

        from visivo.output_paths import model_data_file, run_dir
        from visivo.server.services.profiling_service import profiling_service_for

        path = model_data_file(run_dir(integration_app.output_dir), "orders_q")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        pq.write_table(pa.table({"x": pa.array([1])}), path)
        assert profiling_service_for(integration_app.output_dir).parquet_exists("orders_q")

        assert data_tools._unbuilt_model_schemas(integration_app, self._config()) == {}
        assert data_tools._unbuilt_model_schemas(integration_app, {"props": {"x": "nothing"}}) == {}

    def test_a_model_with_nothing_to_infer_from_is_skipped(self, integration_app, monkeypatch):
        monkeypatch.setattr(
            data_tools, "find_model", lambda app, name: type("M", (), {"sql": None})()
        )

        assert data_tools._unbuilt_model_schemas(integration_app, self._config()) == {}

    def test_a_broken_query_is_a_refusal_with_the_reason(self, integration_app, model):
        config = self._config(y="?{sum(${ref(orders_q).nope})}")

        with pytest.raises(ToolError):
            call(integration_app, "preview_insight", {"config": config})

    def test_arguments_are_checked(self, integration_app):
        with pytest.raises(ToolError, match="Pass 'name'"):
            call(integration_app, "preview_insight", {})
        with pytest.raises(ToolError, match="No insight named"):
            call(integration_app, "preview_insight", {"name": "ghost"})
        with pytest.raises(ToolError, match="input_values"):
            call(
                integration_app,
                "preview_insight",
                {"config": {"name": "x"}, "input_values": "West"},
            )


class TestBounds:
    def test_clamp_defaults_to_the_maximum(self):
        assert data_tools._clamp({}, "limit", 50) == 50
        assert data_tools._clamp({"limit": 500}, "limit", 50) == 50
        assert data_tools._clamp({"limit": 0}, "limit", 50) == 1
        assert data_tools._clamp({"limit": "7"}, "limit", 50) == 7
        with pytest.raises(ToolError, match="integer"):
            data_tools._clamp({"limit": "lots"}, "limit", 50)

    def test_within_bytes_keeps_the_rows_that_fit(self, monkeypatch):
        monkeypatch.setattr(data_tools, "MAX_RESULT_BYTES", 600)
        rows = [{"i": i, "pad": "x" * 20} for i in range(20)]
        payload = data_tools._rows_payload(["i", "pad"], rows)

        cut = data_tools._within_bytes(payload)

        assert cut["truncated"] is True and 0 < cut["row_count"] < 20
        assert cut["rows"] == rows[: cut["row_count"]]
        assert len(json.dumps(cut)) <= 600

    def test_within_bytes_leaves_a_fitting_payload_alone(self):
        payload = data_tools._rows_payload(["i"], [{"i": 1}])

        assert data_tools._within_bytes(payload)["truncated"] is False

    def test_a_single_row_too_large_leaves_no_rows(self, monkeypatch):
        monkeypatch.setattr(data_tools, "MAX_RESULT_BYTES", 400)
        payload = data_tools._rows_payload(["blob"], [{"blob": "x" * 500}])

        cut = data_tools._within_bytes(payload)

        assert cut["rows"] == [] and cut["row_count"] == 0 and cut["truncated"] is True

    def test_descriptions_carry_the_real_caps(self):
        assert str(data_tools.MAX_QUERY_ROWS) in TOOLS["query_source"].description
        assert str(data_tools.MAX_PREVIEW_ROWS) in TOOLS["preview_table"].description
        assert str(data_tools.MAX_PREVIEW_INSIGHT_ROWS) in TOOLS["preview_insight"].description
        columns = TOOLS["profile_columns"].input_schema["properties"]["columns"]["description"]
        assert str(data_tools.MAX_PROFILE_COLUMNS) in columns


class TestInsightProbe:
    """An insight write previews one row, so a prop that names no column,
    comes back as a struct, or fails says so at the write."""

    @pytest.fixture(autouse=True)
    def model(self, integration_app):
        call(integration_app, "describe_source", {"name": _source(integration_app).name})
        source = _source(integration_app).name
        config = {
            "name": "orders_q",
            "sql": "SELECT x, y FROM test_table",
            "source": f"ref({source})",
        }
        call(integration_app, "write_model", {"config": config})

    def _write(self, app, interactions=None, **props):
        base = {"type": "bar", "x": "?{${ref(orders_q).x}}", "y": "?{sum(${ref(orders_q).y})}"}
        config = {"name": "probed", "props": {**base, **props}}
        if interactions:
            config["interactions"] = interactions
        return call(app, "write_insight", {"config": config})

    def test_props_that_resolve_to_values_carry_no_warning(self, integration_app):
        result = self._write(integration_app, marker={"color": "?{sum(${ref(orders_q).y})}"})
        assert "warnings" not in result

    def test_a_struct_value_is_flagged(self, integration_app, monkeypatch):
        preview = {
            "props_mapping": {"props.x": "c", "props.y": "d"},
            "rows": [{"c": {"_0": 1}, "d": 2}],
        }
        monkeypatch.setattr(data_tools, "execute_draft_insight", lambda *a, **k: preview)
        [struct, fix] = self._write(integration_app, x="?{ ${x} }")["warnings"]
        assert struct.startswith("`props.x` comes back as a struct ({'_0': 1})")
        assert "Call preview_insight" in fix

    def test_an_empty_preview_judges_only_the_mapping(self, integration_app, monkeypatch):
        preview = {"props_mapping": {"props.x": "c"}, "rows": []}
        monkeypatch.setattr(data_tools, "execute_draft_insight", lambda *a, **k: preview)
        [missing, _] = self._write(integration_app)["warnings"]
        assert missing.startswith("`props.y` resolved to no column")

    def test_a_dropped_prop_resolves_to_no_column(self, integration_app):
        warnings = self._write(integration_app, x="?{ ${ref(orders_q, 'x')} }")["warnings"]
        assert warnings[0] == "`props.x` resolved to no column, so the chart gets nothing for it."

    def test_a_query_that_fails_comes_back_with_its_error(self, integration_app):
        warnings = self._write(integration_app, y="?{ count(${ref(orders_q)}) }")["warnings"]
        assert (
            warnings[0].startswith("The insight's query fails (") and "needs a field" in warnings[0]
        )

    def test_an_insight_on_an_input_is_not_judged(self, integration_app):
        call(
            integration_app,
            "write_input",
            {"config": {"name": "min_x", "type": "single-select", "options": ["2", "4"]}},
        )
        interactions = [{"filter": "?{${ref(orders_q).x} > ${ref(min_x).value}}"}]
        assert "warnings" not in self._write(integration_app, interactions=interactions)

    def test_a_timeout_is_not_judged(self, integration_app, monkeypatch):
        import visivo.server.services.draft_insight as draft_insight
        from visivo.jobs.run_model_data_job import QueryTimeout

        def slow(*args, **kwargs):
            raise QueryTimeout("slow")

        monkeypatch.setattr(draft_insight, "execute_and_get_result", slow)
        assert "warnings" not in self._write(integration_app)


class TestSetupMistakesAreWarnedAtWriteTime:
    """A model with nothing to run on, or a DuckDB path with no file behind it,
    used to pass the write and fail later, far from the cause."""

    MODEL = {"name": "orphan", "sql": "select 1 as x"}
    NO_SOURCE = "Model 'orphan' has no source and the project has no defaults.source_name"

    def test_a_model_with_no_source_and_no_default(self, integration_app):
        result = call(integration_app, "write_model", {"config": self.MODEL})

        assert any(self.NO_SOURCE in w for w in result["warnings"])

    def test_a_default_source_silences_it(self, integration_app):
        from visivo.models.defaults import Defaults

        integration_app.project.defaults = Defaults(source_name=_source(integration_app).name)

        result = call(integration_app, "write_model", {"config": self.MODEL})

        assert not any(self.NO_SOURCE in w for w in result.get("warnings", []))

    def test_a_model_source_silences_it(self, integration_app):
        config = {**self.MODEL, "source": f"ref({_source(integration_app).name})"}

        result = call(integration_app, "write_model", {"config": config})

        assert not any(self.NO_SOURCE in w for w in result.get("warnings", []))

    def _duckdb(self, database):
        return {"name": "ducks", "type": "duckdb", "database": database}

    def _file_warnings(self, result):
        return [w for w in result.get("warnings", []) if "File not found" in w]

    def test_a_duckdb_file_that_does_not_exist(self, integration_app, tmp_path):
        missing = tmp_path / "nope.duckdb"

        result = call(integration_app, "write_source", {"config": self._duckdb(str(missing))})

        (warning,) = self._file_warnings(result)
        assert warning.startswith(f"File not found: {missing}. Connecting would create")
        assert not missing.exists()

    def test_a_sqlite_file_that_does_not_exist(self, integration_app, tmp_path):
        missing = tmp_path / "nope.sqlite"
        config = {"name": "lite", "type": "sqlite", "database": str(missing)}

        result = call(integration_app, "write_source", {"config": config})

        (warning,) = self._file_warnings(result)
        assert warning.startswith(f"File not found: {missing}.")
        assert not missing.exists()

    def test_a_relative_path_is_looked_for_in_the_project(self, integration_app):
        result = call(integration_app, "write_source", {"config": self._duckdb("data/nope.db")})

        (warning,) = self._file_warnings(result)
        assert os.path.join(integration_app._working_dir, "data/nope.db") in warning

    def test_an_existing_duckdb_file_or_memory_is_fine(self, integration_app, tmp_path):
        existing = tmp_path / "real.duckdb"
        existing.write_bytes(b"")
        for database in (str(existing), ":memory:"):
            result = call(integration_app, "write_source", {"config": self._duckdb(database)})
            assert not self._file_warnings(result)

    def test_describe_source_warns_instead_of_creating_the_file(self, integration_app, tmp_path):
        missing = tmp_path / "nope.duckdb"
        call(integration_app, "write_source", {"config": self._duckdb(str(missing))})

        result = call(integration_app, "describe_source", {"name": "ducks"})

        assert result["tables"] == []
        assert result["warnings"][0].startswith(f"File not found: {missing}.")
        assert not missing.exists()
