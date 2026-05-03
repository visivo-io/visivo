import json
import os
import duckdb
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.jobs.job import (
    Job,
    JobResult,
    format_message_failure,
    format_message_success,
    start_message,
)
from time import time
from visivo.logger.logger import Logger
from visivo.constants import DEFAULT_RUN_ID


def _write_schema(local_merge_model: LocalMergeModel, run_output_dir: str, dag):
    """Persist a schema.json so the field resolver can resolve
    `${ref(model).<col>}` references against an implicit dimension. The merged
    model writes its data into a DuckDB table called `model` (see
    LocalMergeModel.insert_duckdb_data); query its column types after the run."""
    source = local_merge_model.get_duckdb_source(output_dir=run_output_dir, dag=dag)
    db_path = source.database
    if not os.path.exists(db_path):
        return

    conn = duckdb.connect(db_path, read_only=True)
    try:
        rows = conn.execute(
            "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'model'"
        ).fetchall()
    finally:
        conn.close()

    if not rows:
        return

    columns = {col_name: data_type for col_name, data_type in rows}
    schema_directory = f"{run_output_dir}/schemas/{local_merge_model.name}/"
    os.makedirs(schema_directory, exist_ok=True)
    schema_file = f"{schema_directory}schema.json"
    with open(schema_file, "w") as fp:
        json.dump({local_merge_model.name_hash(): columns}, fp, indent=2)


def action(local_merge_model: LocalMergeModel, output_dir, dag, run_id=DEFAULT_RUN_ID):
    Logger.instance().info(start_message("LocalMergeModel", local_merge_model))
    try:
        start_time = time()
        # Organize files by run_id
        run_output_dir = f"{output_dir}/{run_id}"
        local_merge_model.insert_duckdb_data(output_dir=run_output_dir, dag=dag)
        try:
            _write_schema(local_merge_model, run_output_dir, dag)
        except Exception as schema_err:
            Logger.instance().debug(
                f"Could not write schema for LocalMergeModel "
                f"{local_merge_model.name!r}: {schema_err!r}"
            )
        success_message = format_message_success(
            details=f"Updated data for model \033[4m{local_merge_model.name}\033[0m",
            start_time=start_time,
            full_path=local_merge_model.get_duckdb_source(
                output_dir=run_output_dir, dag=dag
            ).database,
        )
        return JobResult(item=local_merge_model, success=True, message=success_message)
    except Exception as e:
        failure_message = format_message_failure(
            details=f"Failed query for model \033[4m{local_merge_model.name}\033[0m",
            start_time=start_time,
            full_path=local_merge_model.get_duckdb_source(
                output_dir=run_output_dir, dag=dag
            ).database,
            error_msg=str(repr(e)),
        )
        return JobResult(item=local_merge_model, success=False, message=failure_message)


def job(dag, output_dir: str, local_merge_model: LocalMergeModel, run_id: str = None):
    # Use run_id to determine the correct output directory for the source
    run_output_dir = f"{output_dir}/{run_id}" if run_id is not None else f"{output_dir}/main"

    kwargs = {
        "local_merge_model": local_merge_model,
        "output_dir": output_dir,
        "dag": dag,
    }
    if run_id is not None:
        kwargs["run_id"] = run_id

    return Job(
        item=local_merge_model,
        source=local_merge_model.get_duckdb_source(output_dir=run_output_dir, dag=dag),
        action=action,
        **kwargs,
    )
