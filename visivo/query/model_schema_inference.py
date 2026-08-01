"""Infer a SQL model's output columns from its SQL and its source's cached schema.

This is pure computation: SQLGlot's ``qualify`` + ``annotate_types`` against a
schema that was introspected earlier and stored. **No database is touched, no
credentials are read, and nothing is written.** That is what lets the same
inference answer an HTTP request as cheaply as it answers a run.

The seam is deliberately the *stored envelope*, not a file path, because the two
callers hold it in different places:

* ``visivo run`` loads it off disk (``SchemaAggregator.load_source_schema``).
* core reads it off a ``SourceSchemaJob`` row's ``content``.

Keeping the filesystem out of this module is what makes it usable from both.

Note that inference is also what the run has always done — persisting the result
is the only thing a run adds. So a model's columns do not depend on it ever
having been run, and asking for them before the first run is a normal question
rather than an error. Compiling a draft insight against a never-built model used
to fail for exactly this reason.
"""

from typing import Any, Dict, Optional

from sqlglot import exp

from visivo.logger.logger import Logger
from visivo.query.sqlglot_utils import schema_from_sql


def sqlglot_schema_to_datatypes(sqlglot_schema_data: Dict[str, Any]) -> Dict[str, Any]:
    """Convert a stored ``sqlglot_schema`` block into SQLGlot ``DataType`` objects.

    The stored block comes in two shapes and both are load-bearing — a source
    with named schemas nests one level deeper than one without:

    * nested: ``{schema: {table: {column: type_string}}}``
    * flat:   ``{table: {column: type_string}}``

    They are told apart by looking at whether the first leaf is itself a dict,
    since a type is always a string. Anything that does not fit either shape is
    skipped rather than raising: a malformed entry for one table should cost
    that table's columns, not the whole inference.
    """
    schema: Dict[str, Any] = {}

    for key, value in sqlglot_schema_data.items():
        if not isinstance(value, dict):
            continue

        first_val = next(iter(value.values()), None) if value else None

        if isinstance(first_val, dict):
            schema_name = key
            if schema_name not in schema:
                schema[schema_name] = {}
            for table_name, columns in value.items():
                if not isinstance(columns, dict):
                    continue
                schema[schema_name][table_name] = {}
                for col_name, col_type_str in columns.items():
                    schema[schema_name][table_name][col_name] = exp.DataType.build(col_type_str)
        else:
            table_name = key
            schema[table_name] = {}
            for col_name, col_type_str in value.items():
                schema[table_name][col_name] = exp.DataType.build(col_type_str)

    return schema


def infer_model_columns(
    sql: str,
    sqlglot_dialect: str,
    model_hash: str,
    stored_source_schema: Optional[Dict[str, Any]] = None,
    strict: bool = True,
) -> Dict[str, Any]:
    """Infer the output columns of ``sql`` as ``{column_name: type_name}``.

    Args:
        sql: The model's SQL.
        sqlglot_dialect: SQLGlot dialect name, e.g. ``"snowflake"``.
        model_hash: The model's ``name_hash()`` — ``schema_from_sql`` keys its
            result by this.
        stored_source_schema: The source's stored schema envelope (the dict with
            ``sqlglot_schema`` and ``metadata``). ``None`` or a missing block is
            valid and simply means fewer columns can be resolved, not a failure
            — a query that names its columns literally still annotates fine.
        strict: Whether SQL that will not parse is an error.

            ``True`` (the run): raise. A model whose SQL does not parse is a
            broken model, and the run has to say so rather than persist an
            empty schema that later reads as "this model has no columns".

            ``False`` (the endpoints): return ``{}``. The editor asks on every
            keystroke, so half-written SQL is the normal state — "nothing
            resolved yet", not a server error. This is also what core's
            reimplementation does unconditionally, since it has no run path.

    Returns:
        ``{column_name: type_name}``, where the type is SQLGlot's type *name*
        as a string (``"INT"``, ``"VARCHAR"``) and is ``None`` for a column
        whose type annotation failed. Empty when the SQL cannot be qualified.
    """
    stored = stored_source_schema or {}

    default_schema = (stored.get("metadata") or {}).get("default_schema")
    schema = sqlglot_schema_to_datatypes(stored.get("sqlglot_schema") or {})

    Logger.instance().debug(
        f"Inferring columns against {len(schema)} schema entries, default: {default_schema}"
    )

    try:
        query_result_schema = schema_from_sql(
            sqlglot_dialect=sqlglot_dialect,
            sql=sql,
            schema=schema,
            model_hash=model_hash,
            default_schema=default_schema,
        )
    except Exception:
        if strict:
            raise
        Logger.instance().debug("Inference could not resolve the SQL; returning no columns")
        return {}
    columns = query_result_schema.get(model_hash, {})

    # A surviving `*` means qualify could not expand it — the cached schema has
    # never seen that table. Drop it: no caller can use a column named "*", and
    # returning one reads as a real result rather than "nothing resolved".
    return {name: dtype for name, dtype in columns.items() if name != "*"}
