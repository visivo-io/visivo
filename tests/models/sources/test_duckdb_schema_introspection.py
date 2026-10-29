import json

import duckdb
import pytest

from visivo.jobs.run_sql_model_job import _build_and_write_schema
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.duckdb_source import DuckdbAttachment, DuckdbSource
from visivo.output_paths import run_dir, schema_file
from visivo.query.model_schema_inference import infer_model_columns, source_default_context
from visivo.query.schema_aggregator import SchemaAggregator
from visivo.query.source_schema_cache import SourceSchemaCache
from visivo.server.services.model_schema import infer_columns


def _source(path, **kwargs):
    return DuckdbSource(name="source", database=str(path), type="duckdb", **kwargs)


@pytest.fixture
def saas_db(tmp_path):
    path = tmp_path / "saas.duckdb"
    con = duckdb.connect(str(path))
    con.execute("CREATE TABLE orders (id INTEGER, total DOUBLE)")
    con.execute('CREATE TABLE "data.v2" (k INTEGER)')
    con.execute("CREATE SCHEMA analytics")
    con.execute("CREATE TABLE analytics.fct_mrr (month DATE, mrr DOUBLE)")
    con.execute("CREATE VIEW analytics.v_users AS SELECT 1 AS user_id")
    con.close()
    return path


@pytest.fixture
def other_db(tmp_path):
    path = tmp_path / "other.duckdb"
    con = duckdb.connect(str(path))
    con.execute("CREATE TABLE ext (x INTEGER)")
    con.close()
    return path


def _store(source, output_dir):
    SchemaAggregator.aggregate_source_schema(
        source_name=source.name,
        source_type=source.type,
        schema_data=source.get_schema(),
        output_dir=str(output_dir),
    )
    return SchemaAggregator.load_source_schema(source.name, str(output_dir))


def _infer(sql, source, stored):
    return infer_model_columns(
        sql,
        "duckdb",
        "m",
        stored_source_schema=stored,
        strict=False,
        source_context=source_default_context(source),
    )


def test_every_table_is_stored_under_its_full_path(saas_db):
    schema = _source(saas_db).get_schema()

    assert set(schema["tables"]) == {
        "saas.main.orders",
        "saas.main.data.v2",
        "saas.analytics.fct_mrr",
        "saas.analytics.v_users",
    }
    assert schema["metadata"]["database"] == "saas"
    assert "default_schema" not in schema["metadata"]
    assert schema["tables"]["saas.main.data.v2"]["metadata"] == {
        "database": "saas",
        "schema": "main",
        "table_name": "data.v2",
        "column_count": 1,
    }
    mapping = schema["sqlglot_schema"].mapping
    assert set(mapping) == {"saas"}
    assert set(mapping["saas"]) == {"main", "analytics"}
    assert set(mapping["saas"]["main"]) == {"orders", "data.v2"}


def test_stored_schema_file_keeps_the_full_path(saas_db, tmp_path):
    stored = _store(_source(saas_db), tmp_path / "target")

    assert set(stored["sqlglot_schema"]["saas"]["analytics"]["fct_mrr"]) == {"month", "mrr"}
    assert stored["sqlglot_schema"]["saas"]["main"]["orders"] == {"id": "INT", "total": "DOUBLE"}
    assert stored["metadata"]["database"] == "saas"


def test_names_resolve_against_the_default_context(saas_db, tmp_path):
    source = _source(saas_db)
    stored = _store(source, tmp_path / "target")

    assert _infer("select * from orders", source, stored) == {"id": "INT", "total": "DOUBLE"}
    assert set(_infer("select * from main.orders", source, stored)) == {"id", "total"}
    assert set(_infer("select * from saas.main.orders", source, stored)) == {"id", "total"}


def test_a_table_in_another_schema_resolves_when_qualified(saas_db, tmp_path):
    source = _source(saas_db)
    stored = _store(source, tmp_path / "target")

    assert _infer("select * from analytics.fct_mrr", source, stored) == {
        "month": "DATE",
        "mrr": "DOUBLE",
    }
    assert _infer("select * from analytics.v_users", source, stored) == {"user_id": "INT"}


def test_a_bare_name_outside_the_default_schema_does_not_resolve(saas_db, tmp_path):
    source = _source(saas_db)
    stored = _store(source, tmp_path / "target")

    assert _infer("select * from fct_mrr", source, stored) == {}


def test_changing_the_default_schema_reuses_the_stored_file(saas_db, tmp_path):
    output_dir = tmp_path / "target"
    _store(_source(saas_db), output_dir)
    path = schema_file(run_dir(str(output_dir), "main"), "source")
    before = open(path).read()

    moved = _source(saas_db, db_schema="analytics")
    stored = SchemaAggregator.load_source_schema("source", str(output_dir))

    assert _infer("select * from fct_mrr", moved, stored) == {"month": "DATE", "mrr": "DOUBLE"}
    assert _infer("select * from orders", moved, stored) == {}
    assert set(_infer("select * from main.orders", moved, stored)) == {"id", "total"}
    assert open(path).read() == before


def test_db_schema_is_the_search_path_at_query_time(saas_db):
    source = _source(saas_db, db_schema="analytics")

    assert source.read_sql("select count(*) as n from fct_mrr") == [{"n": 0}]


def test_a_missing_db_schema_does_not_break_the_connection(saas_db):
    source = _source(saas_db, db_schema="nope")

    assert source.read_sql("select count(*) as n from orders") == [{"n": 0}]


def test_attached_databases_are_stored_and_resolve(saas_db, other_db, tmp_path):
    other = DuckdbSource(name="other", database=str(other_db), type="duckdb")
    source = _source(saas_db, attach=[DuckdbAttachment(schema_name="other", source=other)])
    stored = _store(source, tmp_path / "target")

    assert "other.main.ext" in stored["tables"]
    assert _infer("select * from other.ext", source, stored) == {"x": "INT"}
    assert _infer("select * from other.main.ext", source, stored) == {"x": "INT"}
    assert set(_infer("select * from orders", source, stored)) == {"id", "total"}


def test_the_run_passes_the_source_context(saas_db, tmp_path):
    output_dir = str(tmp_path / "target")
    source = _source(saas_db, db_schema="analytics")
    _store(source, output_dir)
    model = SqlModel(name="mrr", sql="select * from fct_mrr")

    cached = _build_and_write_schema(model, source, output_dir, schema_cache=SourceSchemaCache())
    uncached = _build_and_write_schema(model, source, output_dir)

    expected = {"month": "DATE", "mrr": "DOUBLE"}
    assert cached[model.name_hash()] == expected
    assert uncached[model.name_hash()] == expected


def test_the_model_schema_endpoint_passes_the_source_context(saas_db, tmp_path):
    output_dir = str(tmp_path / "target")
    source = _source(saas_db, db_schema="analytics")
    _store(source, output_dir)

    columns, cached = infer_columns(output_dir, sql="select * from fct_mrr", source=source)

    assert cached is True
    assert columns == {"month": "DATE", "mrr": "DOUBLE"}


def test_a_schema_file_from_before_full_paths_still_resolves_main(saas_db, tmp_path):
    stored = {
        "sqlglot_schema": {"orders": {"id": "INT", "total": "DOUBLE"}},
        "metadata": {},
    }
    source = _source(saas_db)

    assert set(_infer("select * from orders", source, stored)) == {"id", "total"}
    assert set(_infer("select * from main.orders", source, stored)) == {"id", "total"}


def test_table_names_filter_matches_bare_schema_and_full_path(saas_db):
    source = _source(saas_db)

    assert set(source.get_schema(table_names=["fct_mrr"])["tables"]) == {"saas.analytics.fct_mrr"}
    assert set(source.get_schema(table_names=["analytics.v_users"])["tables"]) == {
        "saas.analytics.v_users"
    }
    assert set(source.get_schema(table_names=["saas.main.orders"])["tables"]) == {
        "saas.main.orders"
    }


def test_add_table_failure_keeps_the_table_listing(saas_db, monkeypatch):
    def boom(self, *args, **kwargs):
        raise ValueError("boom")

    monkeypatch.setattr("sqlglot.schema.MappingSchema.add_table", boom)

    schema = _source(saas_db).get_schema(table_names=["orders"])

    assert list(schema["tables"]) == ["saas.main.orders"]
    assert schema["sqlglot_schema"].mapping == {}


def test_legacy_introspect_nests_databases_and_schemas(saas_db):
    meta = _source(saas_db).introspect()

    (database,) = meta["databases"]
    assert database["name"] == "saas"
    tables = {
        schema["name"]: sorted(t["name"] for t in schema["tables"])
        for schema in database["schemas"]
    }
    assert tables == {"main": ["data.v2", "orders"], "analytics": ["fct_mrr", "v_users"]}


def test_get_columns_honors_schema_name(saas_db):
    source = _source(saas_db)

    columns = source.get_columns("saas", "fct_mrr", schema_name="analytics")

    assert [c["name"] for c in columns] == ["month", "mrr"]
    assert [c["name"] for c in source.get_columns("saas", "orders")] == ["id", "total"]


def test_table_preview_honors_schema_name(saas_db):
    source = _source(saas_db)

    preview = source.get_table_preview("saas", "fct_mrr", schema_name="analytics", limit=5)
    main_preview = source.get_table_preview("saas", "orders", limit=5)

    assert preview["row_count"] == 0
    assert main_preview["row_count"] == 0


def test_tables_fallback_when_views_query_fails(saas_db):
    source = _source(saas_db)

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

    assert found == [("saas", "analytics", "fct_mrr")]
    assert ("saas", "main", "orders") in all_found


def test_tables_fallback_double_failure_returns_empty(saas_db):
    class Broken:
        def execute(self, *a):
            raise RuntimeError("boom")

    assert _source(saas_db)._get_available_tables_from_duckdb(Broken()) == []


def test_granular_listing_sees_non_main_schema(saas_db):
    source = _source(saas_db)

    assert "analytics" in source.get_schemas("saas")
    names = {t["name"] for t in source.get_tables("saas", schema_name="analytics")}
    assert names == {"fct_mrr", "v_users"}
    assert {t["name"] for t in source.get_tables("saas")} == {"orders", "data.v2"}


def test_listing_columns_and_preview_default_to_the_db_schema(saas_db):
    source = _source(saas_db, db_schema="analytics")

    assert {t["name"] for t in source.get_tables("saas")} == {"fct_mrr", "v_users"}
    assert [c["name"] for c in source.get_columns("saas", "fct_mrr")] == ["month", "mrr"]
    assert source.get_table_preview("saas", "fct_mrr", limit=5)["row_count"] == 0


def test_get_schema_reports_error_when_connection_fails(tmp_path):
    source = _source(tmp_path / "missing_dir" / "nope.duckdb")

    schema = source.get_schema()

    assert "error" in schema["metadata"]
    assert schema["tables"] == {}


def test_extract_schema_returns_none_for_unknown_table(saas_db):
    source = _source(saas_db)

    with source.connect(read_only=True) as connection:
        assert (
            source._extract_table_schema_from_duckdb(connection, ("saas", "main", "nope")) is None
        )


def test_csv_source_context_defaults_to_main(tmp_path):
    from visivo.models.sources.csv_source import CSVFileSource

    csv_path = tmp_path / "data.csv"
    csv_path.write_text("a,b\n1,2\n")
    source = CSVFileSource(name="data", file=str(csv_path), type="csv")
    stored = _store(source, tmp_path / "target")

    assert source.get_default_context() == {"schema": "main"}
    assert stored["metadata"]["database"] == "memory"
    assert _infer("select * from data", source, stored) == {"a": "BIGINT", "b": "BIGINT"}


def test_stored_json_is_plain_data(saas_db, tmp_path):
    stored = _store(_source(saas_db), tmp_path / "target")

    assert json.loads(json.dumps(stored)) == stored
