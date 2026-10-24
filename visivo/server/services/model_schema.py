"""A model's output columns, inferred from its SQL and its source's cached schema."""

from visivo.models.models.sql_model import SqlModel
from visivo.query.model_schema_inference import infer_model_columns, source_default_context
from visivo.query.schema_aggregator import SchemaAggregator

UNKNOWN_TYPE = "UNKNOWN"


def infer_columns(output_dir, *, sql, source, model_hash=None):
    """``({column: type_name}, source_schema_cached)`` for ``sql`` run on ``source``.

    Reads the source's stored schema (``main``, then its preview run) and
    never raises on SQL that does not parse: half-written SQL is "nothing
    resolved yet". ``source_schema_cached`` is False when the source has
    never been introspected, so a caller can tell an empty answer from a
    missing schema.
    """
    stored, _ = SchemaAggregator.load_source_schema_with_fallback(source.name, output_dir)
    if model_hash is None:
        model_hash = SqlModel(name="__draft__", sql=sql).name_hash()
    column_map = infer_model_columns(
        sql=sql,
        sqlglot_dialect=source.get_sqlglot_dialect(),
        model_hash=model_hash,
        stored_source_schema=stored,
        strict=False,
        source_context=source_default_context(source),
    )
    columns = {
        name: str(dtype) if dtype is not None else UNKNOWN_TYPE
        for name, dtype in column_map.items()
    }
    return columns, stored is not None
