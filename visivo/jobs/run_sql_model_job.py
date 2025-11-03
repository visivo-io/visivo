import os
import json
from time import time
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
from visivo.models.models.sql_model import SqlModel
from visivo.query.schema_aggregator import SchemaAggregator
from visivo.query.sqlglot_utils import schema_from_sql


def model_query_and_schema_action(sql_model: SqlModel, dag: ProjectDag, output_dir):
    """Execute the SQL model query and save result to parquet file.

    Args:
        sql_model: The SqlModel to execute
        dag: The project DAG
        output_dir: Directory to save output files

    Returns:
        JobResult indicating success or failure
    """
    source = get_source_for_model(sql_model, dag, output_dir)
    files_directory = f"{output_dir}/files"

    try:
        start_time = time()

        # New schema portion of the job
        sqlglot_dialect = source.get_sqlglot_dialect()
        model_hash = sql_model.name_hash()
        sql = sql_model.sql
        # TODO: Reading schema from files for every model job is going to be slower than holding it in memory
        stored_schema = SchemaAggregator.load_source_schema(
            source_name=source.name, output_dir=output_dir
        )

        # Convert stored format to DataType objects for schema_from_sql
        from sqlglot import exp

        schema = {}
        for table_name, columns in stored_schema.get("sqlglot_schema", {}).items():
            schema[table_name] = {}
            for col_name, col_type_str in columns.items():
                schema[table_name][col_name] = exp.DataType.build(col_type_str)

        query_result_schema = schema_from_sql(
            sqlglot_dialect=sqlglot_dialect, sql=sql, schema=schema, model_hash=model_hash
        )
        schema_directory = f"{output_dir}/schema/{sql_model.name}/"
        os.makedirs(schema_directory, exist_ok=True)
        schema_file = f"{schema_directory}schema.json"
        with open(schema_file, "w") as fp:
            json.dump(query_result_schema, fp, indent=2, default=str)

        data = source.read_sql(sql_model.sql)
        import polars as pl

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
        if hasattr(e, "message"):
            message = e.message
        else:
            message = repr(e)
        failure_message = format_message_failure(
            details=f"Failed query or schema build for model \033[4m{sql_model.name}\033[0m",
            start_time=start_time,
            full_path=sql_model.file_path,
            error_msg=message,
        )
        return JobResult(item=sql_model, success=False, message=failure_message)


def schema_only_action(sql_model: SqlModel, dag: ProjectDag, output_dir):
    try:
        start_time = time()
        source = get_source_for_model(sql_model, dag, output_dir)
        sqlglot_dialect = source.get_sqlglot_dialect()
        model_hash = sql_model.name_hash()
        sql = sql_model.sql
        # TODO: Reading schema from files for every model job is going to be slower than holding it in memory
        stored_schema = SchemaAggregator.load_source_schema(
            source_name=source.name, output_dir=output_dir
        )

        # Convert stored format to DataType objects for schema_from_sql
        from sqlglot import exp

        schema = {}
        for table_name, columns in stored_schema.get("sqlglot_schema", {}).items():
            schema[table_name] = {}
            for col_name, col_type_str in columns.items():
                schema[table_name][col_name] = exp.DataType.build(col_type_str)

        query_result_schema = schema_from_sql(
            sqlglot_dialect=sqlglot_dialect, sql=sql, schema=schema, model_hash=model_hash
        )
        schema_directory = f"{output_dir}/schema/{sql_model.name}/"
        os.makedirs(schema_directory, exist_ok=True)
        schema_file = f"{schema_directory}schema.json"
        with open(schema_file, "w") as fp:
            json.dump(query_result_schema, fp, indent=2, default=str)
        success_message = format_message_success(
            details=f"Updated wrote schema for model \033[4m{sql_model.name}\033[0m",
            start_time=start_time,
            full_path=schema_file,
        )
        return JobResult(item=sql_model, success=True, message=success_message)
    except Exception as e:
        if hasattr(e, "message"):
            message = e.message
        else:
            message = repr(e)
        failure_message = format_message_failure(
            details=f"Failed schema build for model \033[4m{sql_model.name}\033[0m",
            start_time=start_time,
            full_path=sql_model.file_path,
            error_msg=message,
        )
        return JobResult(item=sql_model, success=False, message=failure_message)


def job(dag, output_dir: str, sql_model: SqlModel):
    """Create a Job for the SQL model if it's referenced by a dynamic insight.

    A job with parquet generation is created if this SQL model is:
    - Referenced by a dynamic insight (has Input descendants)

    NOTE: Input-related logic REMOVED - inputs now have their own job system via run_input_job.py

    Args:
        dag: The project DAG
        output_dir: Directory to save output files
        sql_model: The SqlModel to potentially create a job for

    Returns:
        Job object with appropriate action (parquet + schema or schema-only)
    """
    from visivo.models.inputs.input import Input

    # Find all insights in the project
    insights = all_descendants_of_type(type=Insight, dag=dag)

    # Get source for the model
    source = get_source_for_model(sql_model, dag, output_dir)

    # Check if any insight is dynamic and references this sql_model
    for insight in insights:
        if insight.is_dynamic(dag):
            # Check if this sql_model is in the insight's dependent models
            if sql_model in insight.get_all_dependent_models(dag):
                return Job(
                    item=sql_model,
                    source=source,
                    action=model_query_and_schema_action,
                    sql_model=sql_model,
                    dag=dag,
                    output_dir=output_dir,
                )

    # Not referenced by any dynamic insight, run the schema-only action
    return Job(
        item=sql_model,
        source=source,
        action=schema_only_action,
        sql_model=sql_model,
        dag=dag,
        output_dir=output_dir,
    )
