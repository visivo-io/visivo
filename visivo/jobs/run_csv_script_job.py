from visivo.logger.logger import Logger
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.jobs.job import (
    Job,
    JobResult,
    format_message_failure,
    format_message_success,
    start_message,
)
from time import time
from visivo.constants import DEFAULT_RUN_ID


def action(csv_script_model: CsvScriptModel, output_dir, working_dir=None, run_id=DEFAULT_RUN_ID):
    Logger.instance().info(start_message("CsvScriptModel", csv_script_model))
    try:
        start_time = time()
        # CSV script models use DuckDB, which will be organized by run_id
        run_output_dir = f"{output_dir}/{run_id}"
        csv_script_model.insert_csv_to_duckdb(output_dir=run_output_dir, working_dir=working_dir)
        success_message = format_message_success(
            details=f"Updated data for model \033[4m{csv_script_model.name}\033[0m",
            start_time=start_time,
            full_path=csv_script_model.get_duckdb_source(output_dir=run_output_dir).database,
        )
        return JobResult(item=csv_script_model, success=True, message=success_message)
    except Exception as e:
        failure_message = format_message_failure(
            details=f"Failed query for model \033[4m{csv_script_model.name}\033[0m",
            start_time=start_time,
            full_path=csv_script_model.get_duckdb_source(output_dir=run_output_dir).database,
            error_msg=str(repr(e)),
        )
        return JobResult(item=csv_script_model, success=False, message=failure_message)


def job(csv_script_model, output_dir: str, working_dir: str = None, run_id: str = None):
    # Use run_id to determine the correct output directory for the source
    run_output_dir = f"{output_dir}/{run_id}" if run_id is not None else f"{output_dir}/main"

    kwargs = {
        "csv_script_model": csv_script_model,
        "output_dir": output_dir,
        "working_dir": working_dir,
    }
    if run_id is not None:
        kwargs["run_id"] = run_id

    return Job(
        item=csv_script_model,
        source=csv_script_model.get_duckdb_source(run_output_dir),
        action=action,
        **kwargs,
    )
