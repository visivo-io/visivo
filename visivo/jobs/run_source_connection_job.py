from visivo.logger.logger import Logger
from visivo.models.sources.source import Source
from visivo.jobs.job import (
    Job,
    JobResult,
    format_message_failure,
    format_message_success,
    start_message,
)
from time import time


def action(source_to_test: Source, working_dir=None):
    Logger.instance().info(start_message("Source", source_to_test))
    try:
        start_time = time()
        source_to_test.read_sql("select 1", working_dir=working_dir)

        success_message = format_message_success(
            details=f"Successful connection for source \033[4m{source_to_test.name}\033[0m",
            start_time=start_time,
            full_path=None,
        )
        return JobResult(item=source_to_test, success=True, message=success_message)
    except Exception as e:
        failure_message = format_message_failure(
            details=f"Failed connection for source \033[4m{source_to_test.name}\033[0m",
            start_time=start_time,
            error_msg=f"Failed connection to source: {source_to_test.description()}. {str(repr(e))}",
            full_path=None,
        )
        return JobResult(item=source_to_test, success=False, message=failure_message)


def job(source, working_dir=None):
    return Job(
        item=source, source=source, action=action, source_to_test=source, working_dir=working_dir
    )
