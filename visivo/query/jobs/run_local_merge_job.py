from visivo.models.base.parent_model import ParentModel
from visivo.models.dag import all_descendants_of_type
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.models.model import Model
from visivo.models.project import Project
from visivo.query.jobs.job import (
    Job,
    JobResult,
    format_message_failure,
    format_message_success,
    start_message,
)
from time import time
from visivo.logging.logger import Logger


def action(local_merge_model: LocalMergeModel, output_dir, dag):
    Logger.instance().info(start_message("LocalMergeModel", local_merge_model))
    try:
        start_time = time()
        local_merge_model.insert_dependent_models_to_sqlite(
            output_dir=output_dir, dag=dag
        )
        success_message = format_message_success(
            details=f"Updated data for model \033[4m{local_merge_model.name}\033[0m",
            start_time=start_time,
            full_path=local_merge_model.get_sqlite_source(
                output_dir=output_dir, dag=dag
            ).database,
        )
        return JobResult(item=local_merge_model, success=True, message=success_message)
    except Exception as e:
        failure_message = format_message_failure(
            details=f"Failed query for model \033[4m{local_merge_model.name}\033[0m",
            start_time=start_time,
            full_path=local_merge_model.get_sqlite_source(
                output_dir=output_dir, dag=dag
            ).database,
            error_msg=str(repr(e)),
        )
        return JobResult(item=local_merge_model, success=False, message=failure_message)


def job(dag, output_dir: str, local_merge_model: LocalMergeModel):
    return Job(
        item=local_merge_model,
        source=local_merge_model.get_sqlite_source(output_dir=output_dir, dag=dag),
        action=action,
        local_merge_model=local_merge_model,
        output_dir=output_dir,
        dag=dag,
    )
