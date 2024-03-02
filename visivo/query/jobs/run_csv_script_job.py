from visivo.models.model import CsvScriptModel
from visivo.query.jobs.job import (
    JobResult,
    format_message_failure,
    format_message_success,
)
from time import time


def action(csv_script_model: CsvScriptModel, output_dir):
    try:
        start_time = time()
        csv_script_model.insert_csv_to_sqlite(output_dir=output_dir)
        success_message = format_message_success(
            details=f"Updated data for model \033[4m{csv_script_model.name}\033[0m",
            start_time=start_time,
            full_path=csv_script_model.get_database,
        )
        return JobResult(success=True, message=success_message)
    except Exception as e:
        failure_message = format_message_failure(
            details=f"Failed query for model \033[4m{csv_script_model.name}\033[0m",
            start_time=start_time,
            full_path=csv_script_model.get_database,
            error_msg=str(repr(e)),
        )
        return JobResult(success=False, message=failure_message)
