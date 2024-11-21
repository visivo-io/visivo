from visivo.logging.logger import Logger
from visivo.models.base.parent_model import ParentModel
from visivo.models.dag import all_descendants_of_type
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.project import Project
from visivo.query.jobs.job import (
    Job,
    JobResult,
    format_message_failure,
    format_message_success,
    start_message,
)
from time import time


def action(csv_script_model: CsvScriptModel, output_dir):
    Logger.instance().info(start_message("CsvScriptModel", csv_script_model))
    try:
        start_time = time()
        csv_script_model.insert_csv_to_sqlite(output_dir=output_dir)
        success_message = format_message_success(
            details=f"Updated data for model \033[4m{csv_script_model.name}\033[0m",
            start_time=start_time,
            full_path=csv_script_model.get_sqlite_source(
                output_dir=output_dir
            ).database,
        )
        return JobResult(item=csv_script_model, success=True, message=success_message)
    except Exception as e:
        failure_message = format_message_failure(
            details=f"Failed query for model \033[4m{csv_script_model.name}\033[0m",
            start_time=start_time,
            full_path=csv_script_model.get_sqlite_source(
                output_dir=output_dir
            ).database,
            error_msg=str(repr(e)),
        )
        return JobResult(item=csv_script_model, success=False, message=failure_message)


def job(csv_script_model, output_dir: str):
    return Job(
        item=csv_script_model,
        source=csv_script_model.get_sqlite_source(output_dir),
        action=action,
        csv_script_model=csv_script_model,
        output_dir=output_dir,
    )
