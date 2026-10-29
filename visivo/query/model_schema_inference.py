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

from typing import Any, Dict, Optional, Tuple

from sqlglot import exp

from visivo.logger.logger import Logger
from visivo.query.sqlglot_utils import schema_from_sql


def sqlglot_schema_to_datatypes(sqlglot_schema_data: Dict[str, Any]) -> Dict[str, Any]:
    """Convert a stored ``sqlglot_schema`` block into SQLGlot ``DataType`` objects.

    The block nests to any depth: ``{table: {column: type}}``,
    ``{schema: {table: ...}}`` or ``{database: {schema: {table: ...}}}``. A level
    whose first value is a dict holds more levels; otherwise it holds columns,
    since a type is always a string. A malformed entry is skipped rather than
    raising: it costs that table's columns, not the whole inference.
    """
    schema: Dict[str, Any] = {}

    for key, value in sqlglot_schema_data.items():
        if not isinstance(value, dict):
            continue

        first_val = next(iter(value.values()), None) if value else None

        if isinstance(first_val, dict):
            schema[key] = sqlglot_schema_to_datatypes(value)
        else:
            schema[key] = {
                col_name: exp.DataType.build(col_type_str)
                for col_name, col_type_str in value.items()
            }

    return schema


def source_default_context(source) -> Dict[str, str]:
    """``source.get_default_context()``, or ``{}`` for an object without one."""
    context = getattr(source, "get_default_context", lambda: {})()
    return context if isinstance(context, dict) else {}


def resolve_default_context(
    metadata: Optional[Dict[str, Any]], source_context: Optional[Dict[str, str]] = None
) -> Tuple[Optional[str], Optional[str]]:
    """``(catalog, schema)`` that unqualified table names resolve against.

    The source's context wins over the stored metadata, so a source whose default
    schema changes keeps reading the schema file it already has.
    """
    metadata = metadata or {}
    source_context = source_context or {}
    catalog = source_context.get("catalog") or metadata.get("database")
    schema = source_context.get("schema") or metadata.get("default_schema")
    return catalog, schema


def infer_model_columns(
    sql: str,
    sqlglot_dialect: str,
    model_hash: str,
    stored_source_schema: Optional[Dict[str, Any]] = None,
    strict: bool = True,
    source_context: Optional[Dict[str, str]] = None,
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
        source_context: ``source.get_default_context()``. Its ``catalog`` and
            ``schema`` override the stored metadata's for unqualified names.

    Returns:
        ``{column_name: type_name}``, where the type is SQLGlot's type *name*
        as a string (``"INT"``, ``"VARCHAR"``) and is ``None`` for a column
        whose type annotation failed. Empty when the SQL cannot be qualified.
    """
    stored = stored_source_schema or {}

    default_catalog, default_schema = resolve_default_context(
        stored.get("metadata"), source_context
    )
    schema = sqlglot_schema_to_datatypes(stored.get("sqlglot_schema") or {})

    Logger.instance().debug(
        f"Inferring columns against {len(schema)} schema entries, "
        f"default: {default_catalog}.{default_schema}"
    )

    try:
        query_result_schema = schema_from_sql(
            sqlglot_dialect=sqlglot_dialect,
            sql=sql,
            schema=schema,
            model_hash=model_hash,
            default_schema=default_schema,
            default_catalog=default_catalog,
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
