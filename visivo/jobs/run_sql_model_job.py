import os
import json
from time import time
from typing import Optional
from sqlglot import exp
import polars as pl

from visivo.jobs.job import (
    Job,
    JobResult,
    format_message_failure,
    format_message_success,
)
from visivo.jobs.utils import get_source_for_model
from visivo.models.base.project_dag import ProjectDag
from visivo.models.dag import all_descendants_of_type
from visivo.models.insight import Insight
from visivo.models.models.model import Model
from visivo.models.models.sql_model import SqlModel
from visivo.query.schema_aggregator import SchemaAggregator
from visivo.query.source_schema_cache import SourceSchemaCache
from visivo.query.sql_table_extractor import (
    extract_table_references,
    extract_schema_references,
)
from visivo.query.sqlglot_utils import schema_from_sql
from visivo.constants import DEFAULT_RUN_ID


def _build_and_write_schema(
    sql_model: SqlModel,
    source,
    output_dir: str,
    run_id: str = DEFAULT_RUN_ID,
    schema_cache: Optional[SourceSchemaCache] = None,
) -> dict:
    """Build schema for a SQL model using SQLGlot and write it to disk.

    Args:
        sql_model: The SqlModel to build schema for
        source: The source to get SQLGlot dialect from
        output_dir: Directory to save schema files
        run_id: Run ID for organizing output files
        schema_cache: Optional cache for schema providers (performance optimization)

    Returns:
        The computed query result schema dict
    """
    from visivo.logger.logger import Logger

    sqlglot_dialect = source.get_sqlglot_dialect()
    model_hash = sql_model.name_hash()
    sql = sql_model.sql

    Logger.instance().debug(f"Building schema for model {sql_model.name}")

    # Use cached provider if available (performance optimization)
    if schema_cache is not None:
        provider = schema_cache.get_provider(
            source_name=source.name,
            source_type=source.type,
            output_dir=output_dir,
            run_id=run_id,
        )

        if provider is not None:
            # Extract only tables referenced in the query (typically 1-5 tables)
            # This reduces schema size from potentially 919 tables to ~5 tables
            tables = extract_table_references(sql, source.type)
            schema_refs = extract_schema_references(sql, source.type)

            Logger.instance().debug(f"Extracted {len(tables)} table(s) from query: {tables}")

            # If table extraction failed (e.g., due to Jinja templates), fall back to full schema
            # This is slower but ensures column resolution works
            if tables:
                schema = provider.get_filtered_schema(tables, schema_refs)
                Logger.instance().debug(
                    f"Using filtered schema with {len(schema)} entries, "
                    f"default: {provider.default_schema}"
                )
            else:
                schema = provider.get_full_schema()
                Logger.instance().debug(
                    f"Table extraction failed, using full schema with "
                    f"{provider.table_count} tables, default: {provider.default_schema}"
                )

            default_schema = provider.default_schema

            query_result_schema = schema_from_sql(
                sqlglot_dialect=sqlglot_dialect,
                sql=sql,
                schema=schema,
                model_hash=model_hash,
                default_schema=default_schema,
            )
        else:
            # No cached provider, fall back to empty schema
            Logger.instance().debug(f"No cached schema for source {source.name}")
            query_result_schema = schema_from_sql(
                sqlglot_dialect=sqlglot_dialect,
                sql=sql,
                schema={},
                model_hash=model_hash,
                default_schema=None,
            )
    else:
        # Fall back to original behavior (no cache)
        stored_schema = SchemaAggregator.load_source_schema(
            source_name=source.name, output_dir=output_dir
        )

        if stored_schema is None:
            Logger.instance().debug(f"No stored schema found for source {source.name}")
            stored_schema = {"sqlglot_schema": {}, "metadata": {}}

        # Get the default schema for unqualified table references
        default_schema = stored_schema.get("metadata", {}).get("default_schema")
        Logger.instance().debug(f"Default schema: {default_schema}")

        # Convert stored format to DataType objects for schema_from_sql
        # Handle both nested and flat formats
        schema = {}
        sqlglot_schema_data = stored_schema.get("sqlglot_schema", {})

        Logger.instance().debug(
            f"Processing schema with {len(sqlglot_schema_data)} top-level entries"
        )

        for key, value in sqlglot_schema_data.items():
            if not isinstance(value, dict):
                continue

            first_val = next(iter(value.values()), None) if value else None

            if isinstance(first_val, dict):
                # Nested structure: {schema: {table: {col: type}}}
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
                # Flat structure: {table: {col: type}}
                table_name = key
                schema[table_name] = {}
                for col_name, col_type_str in value.items():
                    schema[table_name][col_name] = exp.DataType.build(col_type_str)

        Logger.instance().debug(f"Schema conversion complete, calling schema_from_sql")

        query_result_schema = schema_from_sql(
            sqlglot_dialect=sqlglot_dialect,
            sql=sql,
            schema=schema,
            model_hash=model_hash,
            default_schema=default_schema,
        )

    Logger.instance().debug(f"schema_from_sql complete for {sql_model.name}")

    # Organize by run_id
    run_output_dir = f"{output_dir}/{run_id}"
    schema_directory = f"{run_output_dir}/schema/{sql_model.name}/"
    os.makedirs(schema_directory, exist_ok=True)
    schema_file = f"{schema_directory}schema.json"
    with open(schema_file, "w") as fp:
        json.dump(query_result_schema, fp, indent=2, default=str)

    return query_result_schema


def _get_error_message(e: Exception) -> str:
    """Extract error message from exception."""
    if hasattr(e, "message"):
        return e.message
    return repr(e)


def model_query_and_schema_action(
    sql_model: SqlModel,
    dag: ProjectDag,
    output_dir,
    run_id=DEFAULT_RUN_ID,
    schema_cache: Optional[SourceSchemaCache] = None,
):
    """Execute the SQL model query and save result to parquet file.

    Args:
        sql_model: The SqlModel to execute
        dag: The project DAG
        output_dir: Directory to save output files
        run_id: Run ID for organizing output files
        schema_cache: Optional cache for schema providers (performance optimization)

    Returns:
        JobResult indicating success or failure
    """
    source = get_source_for_model(sql_model, dag, output_dir)

    # Organize files by run_id
    run_output_dir = f"{output_dir}/{run_id}"
    files_directory = f"{run_output_dir}/files"
    start_time = time()

    try:
        # Build and write schema
        _build_and_write_schema(sql_model, source, output_dir, run_id, schema_cache)

        # Execute query and write parquet
        data = source.read_sql(sql_model.sql)
        df = pl.DataFrame(data)
        os.makedirs(files_directory, exist_ok=True)
        parquet_path = f"{files_directory}/{sql_model.name_hash()}.parquet"
        df.write_parquet(parquet_path)

        success_message = format_message_success(
            details=f"Updated data & wrote schema for model \033[4m{sql_model.name}\033[0m",
            start_time=start_time,
            full_path=parquet_path,
        )
        return JobResult(item=sql_model, success=True, message=success_message)

    except Exception as e:
        failure_message = format_message_failure(
            details=f"Failed query or schema build for model \033[4m{sql_model.name}\033[0m",
            start_time=start_time,
            full_path=sql_model.file_path,
            error_msg=_get_error_message(e),
        )
        return JobResult(item=sql_model, success=False, message=failure_message)


def schema_only_action(
    sql_model: SqlModel,
    dag: ProjectDag,
    output_dir,
    run_id=DEFAULT_RUN_ID,
    schema_cache: Optional[SourceSchemaCache] = None,
):
    """Build and write schema only, without executing the query.

    Args:
        sql_model: The SqlModel to build schema for
        dag: The project DAG
        output_dir: Directory to save schema files
        run_id: Run ID for organizing output files
        schema_cache: Optional cache for schema providers (performance optimization)

    Returns:
        JobResult indicating success or failure
    """
    start_time = time()

    try:
        source = get_source_for_model(sql_model, dag, output_dir)

        # Build and write schema
        _build_and_write_schema(sql_model, source, output_dir, run_id, schema_cache)

        # Organize by run_id
        run_output_dir = f"{output_dir}/{run_id}"
        schema_file = f"{run_output_dir}/schema/{sql_model.name}/schema.json"
        success_message = format_message_success(
            details=f"Wrote schema for model \033[4m{sql_model.name}\033[0m",
            start_time=start_time,
            full_path=schema_file,
        )
        return JobResult(item=sql_model, success=True, message=success_message)

    except Exception as e:
        failure_message = format_message_failure(
            details=f"Failed schema build for model \033[4m{sql_model.name}\033[0m",
            start_time=start_time,
            full_path=sql_model.file_path,
            error_msg=_get_error_message(e),
        )
        return JobResult(item=sql_model, success=False, message=failure_message)


def job(
    dag,
    output_dir: str,
    sql_model: SqlModel,
    run_id: str = None,
    schema_cache: Optional[SourceSchemaCache] = None,
):
    """Create a Job for the SQL model if it's referenced by a dynamic insight.

    Args:
        dag: The project DAG
        output_dir: Directory to save output files
        sql_model: The SqlModel to potentially create a job for
        run_id: Optional run ID for organizing output files
        schema_cache: Optional cache for schema providers (performance optimization)

    Returns:
        Job object with appropriate action (parquet + schema or schema-only)
    """
    # Find all insights in the project
    insights = all_descendants_of_type(type=Insight, dag=dag)

    # Get source for the model
    source = get_source_for_model(sql_model, dag, output_dir)

    # Build kwargs
    kwargs = {
        "sql_model": sql_model,
        "dag": dag,
        "output_dir": output_dir,
    }
    if run_id is not None:
        kwargs["run_id"] = run_id
    if schema_cache is not None:
        kwargs["schema_cache"] = schema_cache

    # Check if this model needs data (parquet) output:
    # 1. Referenced by a dynamic insight, or
    # 2. Referenced directly by a table (via 'data' or columns/rows/values)
    needs_data = False

    for insight in insights:
        if insight.is_dynamic(dag) and sql_model in insight.get_all_dependent_models(dag):
            needs_data = True
            break

    if not needs_data:
        from visivo.models.table import Table

        tables = all_descendants_of_type(type=Table, dag=dag)
        for table in tables:
            table_models = all_descendants_of_type(type=Model, dag=dag, from_node=table)
            if sql_model in table_models:
                needs_data = True
                break

    if needs_data:
        return Job(item=sql_model, source=source, action=model_query_and_schema_action, **kwargs)

    # Not referenced by any dynamic insight or table, run the schema-only action
    return Job(item=sql_model, source=source, action=schema_only_action, **kwargs)
