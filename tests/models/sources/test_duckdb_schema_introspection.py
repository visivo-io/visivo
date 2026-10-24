import duckdb
import pytest

from visivo.models.sources.duckdb_source import DuckdbSource
from visivo.query.model_schema_inference import infer_model_columns
from visivo.query.schema_aggregator import SchemaAggregator


def _source(path):
    return DuckdbSource(name="source", database=str(path), type="duckdb")


@pytest.fixture
def main_only_db(tmp_path):
    path = tmp_path / "main_only.duckdb"
    con = duckdb.connect(str(path))
    con.execute("CREATE TABLE orders (id INTEGER, total DOUBLE)")
    con.close()
    return path


@pytest.fixture
def multi_schema_db(tmp_path):
    path = tmp_path / "multi.duckdb"
    con = duckdb.connect(str(path))
    con.execute("CREATE TABLE orders (id INTEGER, total DOUBLE)")
    con.execute('CREATE TABLE "data.v2" (k INTEGER)')
    con.execute("CREATE SCHEMA analytics")
    con.execute("CREATE TABLE analytics.fct_mrr (month DATE, mrr DOUBLE)")
    con.execute("CREATE VIEW analytics.v_users AS SELECT 1 AS user_id")
    con.close()
    return path


def test_main_only_schema_is_unchanged(main_only_db):
    schema = _source(main_only_db).get_schema()

    assert list(schema["tables"]) == ["orders"]
    assert "default_schema" not in schema["metadata"]
    assert set(schema["tables"]["orders"]["columns"]) == {"id", "total"}


def test_non_main_tables_and_views_are_introspected(multi_schema_db):
    schema = _source(multi_schema_db).get_schema()

    assert set(schema["tables"]) == {"orders", "data.v2", "analytics.fct_mrr", "analytics.v_users"}
    assert set(schema["tables"]["analytics.fct_mrr"]["columns"]) == {"month", "mrr"}
    assert schema["metadata"]["default_schema"] == "main"


def test_table_names_filter_matches_bare_and_qualified(multi_schema_db):
    source = _source(multi_schema_db)

    assert set(source.get_schema(table_names=["fct_mrr"])["tables"]) == {"analytics.fct_mrr"}
    assert set(source.get_schema(table_names=["analytics.v_users"])["tables"]) == {
        "analytics.v_users"
    }


def test_model_over_qualified_table_resolves_columns(multi_schema_db):
    schema = _source(multi_schema_db).get_schema()
    stored = {}
    stored["sqlglot_schema"] = SchemaAggregator._serialize_mapping_schema(schema["sqlglot_schema"])
    stored["metadata"] = schema["metadata"]

    qualified = infer_model_columns(
        "select * from analytics.fct_mrr", "duckdb", "m", stored_source_schema=stored
    )
    default = infer_model_columns(
        "select * from orders", "duckdb", "m", stored_source_schema=stored
    )

    assert set(qualified) == {"month", "mrr"}
    assert set(default) == {"id", "total"}


def test_get_columns_honors_schema_name(multi_schema_db):
    source = _source(multi_schema_db)

    columns = source.get_columns("multi", "fct_mrr", schema_name="analytics")

    assert [c["name"] for c in columns] == ["month", "mrr"]
    assert [c["name"] for c in source.get_columns("multi", "orders")] == ["id", "total"]


def test_tables_fallback_when_views_query_fails(multi_schema_db):
    source = _source(multi_schema_db)

    class Flaky:
        def __init__(self, real):
            self.real = real
            self.calls = 0

        def execute(self, sql, *a):
            self.calls += 1
            if self.calls == 1:
                raise RuntimeError("boom")
            return self.real.execute(sql, *a)

    with source.connect(read_only=True) as real:
        found = source._get_available_tables_from_duckdb(Flaky(real), ["fct_mrr"])
        all_found = source._get_available_tables_from_duckdb(Flaky(real))

    assert found == [("analytics", "fct_mrr")]
    assert ("main", "orders") in all_found


def test_tables_fallback_double_failure_returns_empty(multi_schema_db):
    class Broken:
        def execute(self, *a):
            raise RuntimeError("boom")

    assert _source(multi_schema_db)._get_available_tables_from_duckdb(Broken()) == []


def test_granular_listing_sees_non_main_schema(multi_schema_db):
    source = _source(multi_schema_db)

    assert "analytics" in source.get_schemas("multi")
    names = {t["name"] for t in source.get_tables("multi", schema_name="analytics")}
    assert names == {"fct_mrr", "v_users"}
    assert {t["name"] for t in source.get_tables("multi")} == {"orders", "data.v2"}


def test_get_schema_reports_error_when_connection_fails(tmp_path):
    source = _source(tmp_path / "missing_dir" / "nope.duckdb")

    schema = source.get_schema()

    assert "error" in schema["metadata"]
    assert schema["tables"] == {}


def test_extract_schema_returns_none_for_unknown_table(multi_schema_db):
    source = _source(multi_schema_db)

    with source.connect(read_only=True) as connection:
        assert source._extract_table_schema_from_duckdb(connection, ("main", "nope")) is None


def test_table_preview_reads_main_table(multi_schema_db):
    source = _source(multi_schema_db)

    preview = source.get_table_preview("multi", "orders", limit=5)

    assert preview["columns"] == [] and preview["row_count"] == 0
