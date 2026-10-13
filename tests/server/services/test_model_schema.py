"""The one column-inference call the view and both tools share."""

import json
import os

from visivo.constants import DEFAULT_RUN_ID
from visivo.models.models.sql_model import SqlModel
from visivo.query.schema_aggregator import SchemaAggregator
from visivo.server.services import model_schema
from visivo.server.services.model_schema import UNKNOWN_TYPE, infer_columns
from tests.factories.model_factories import DuckdbSourceFactory


def _cache(output_dir, source, run_id=DEFAULT_RUN_ID):
    """The stored envelope inference reads, as the run writes it."""
    schema_dir = os.path.join(output_dir, run_id, "schemas")
    os.makedirs(schema_dir, exist_ok=True)
    with open(os.path.join(schema_dir, f"{source.name}.json"), "w") as fp:
        json.dump(
            {
                "source_name": source.name,
                "sqlglot_schema": {"orders": {"id": "INT", "amount": "DECIMAL"}},
                "metadata": {"default_schema": None},
            },
            fp,
        )


def test_types_come_from_the_cached_schema(tmp_path):
    source = DuckdbSourceFactory(name="wh")
    _cache(str(tmp_path), source)

    columns, cached = infer_columns(
        str(tmp_path), sql="SELECT id, amount AS amt FROM orders", source=source
    )

    assert columns == {"id": "INT", "amt": "DECIMAL"} and cached is True


def test_a_preview_only_schema_is_found(tmp_path):
    source = DuckdbSourceFactory(name="wh")
    _cache(str(tmp_path), source, run_id=SchemaAggregator.preview_run_id("wh"))

    columns, cached = infer_columns(str(tmp_path), sql="SELECT id FROM orders", source=source)

    assert columns == {"id": "INT"} and cached is True


def test_no_schema_is_reported_not_failed(tmp_path):
    columns, cached = infer_columns(
        str(tmp_path), sql="SELECT 1 AS one", source=DuckdbSourceFactory(name="wh")
    )

    assert cached is False and list(columns) == ["one"]


def test_half_written_sql_is_nothing_resolved(tmp_path):
    columns, _ = infer_columns(
        str(tmp_path), sql="SELECT FROM WHERE", source=DuckdbSourceFactory(name="wh")
    )

    assert columns == {}


def test_an_unannotated_type_is_unknown_everywhere(tmp_path, monkeypatch):
    monkeypatch.setattr(model_schema, "infer_model_columns", lambda **k: {"a": None, "b": "INT"})

    columns, _ = infer_columns(str(tmp_path), sql="select 1", source=DuckdbSourceFactory())

    assert columns == {"a": UNKNOWN_TYPE, "b": "INT"}


def test_no_model_hash_means_the_draft_hash(tmp_path, monkeypatch):
    seen = {}
    monkeypatch.setattr(model_schema, "infer_model_columns", lambda **k: seen.update(k) or {})

    infer_columns(str(tmp_path), sql="select 1", source=DuckdbSourceFactory())
    assert seen["model_hash"] == SqlModel(name="__draft__", sql="select 1").name_hash()

    infer_columns(str(tmp_path), sql="select 1", source=DuckdbSourceFactory(), model_hash="h")
    assert seen["model_hash"] == "h"
