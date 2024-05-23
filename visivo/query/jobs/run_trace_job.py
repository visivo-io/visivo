from visivo.logging.logger import Logger
from visivo.models.base.parent_model import ParentModel
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.models.model import Model
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.project import Project
from visivo.models.targets.target import Target
from visivo.query.aggregator import Aggregator
from visivo.query.jobs.job import (
    Job,
    JobResult,
    format_message_failure,
    format_message_success,
)
from time import time


def action(trace, dag, output_dir):
    model = ParentModel.all_descendants_of_type(type=Model, dag=dag, from_node=trace)[0]
    if isinstance(model, CsvScriptModel):
        target = model.get_sqlite_target(output_dir=output_dir)
    elif isinstance(model, LocalMergeModel):
        target = model.get_sqlite_target(output_dir=output_dir, dag=dag)
    else:
        target = ParentModel.all_descendants_of_type(
            type=Target, dag=dag, from_node=model
        )[0]

    trace_directory = f"{output_dir}/{trace.name}"
    trace_query_file = f"{trace_directory}/query.sql"
    with open(trace_query_file, "r") as file:
        query_string = file.read()
        try:
            start_time = time()
            data_frame = target.read_sql(query_string)
            success_message = format_message_success(
                details=f"Updated data for trace \033[4m{trace.name}\033[0m",
                start_time=start_time,
                full_path=trace_query_file,
            )
            Aggregator.aggregate_data_frame(
                data_frame=data_frame, trace_dir=trace_directory
            )
            return JobResult(success=True, message=success_message)
        except Exception as e:
            failure_message = format_message_failure(
                details=f"Failed query for trace \033[4m{trace.name}\033[0m",
                start_time=start_time,
                full_path=trace_query_file,
                error_msg=str(repr(e)),
            )
            return JobResult(success=False, message=failure_message)


def _get_target(trace, dag, output_dir):
    targets = ParentModel.all_descendants_of_type(type=Target, dag=dag, from_node=trace)
    if len(targets) == 1:
        return targets[0]

    model = ParentModel.all_descendants_of_type(type=Model, dag=dag, from_node=trace)[0]
    if isinstance(model, CsvScriptModel):
        return model.get_sqlite_target(output_dir)
    elif isinstance(model, LocalMergeModel):
        return model.get_sqlite_target(output_dir, dag)
    else:
        return model.target


def jobs(dag, output_dir: str, project: Project, name_filter: str):
    jobs = []

    traces = project.filter_traces(name_filter=name_filter)
    for trace in traces:
        target = _get_target(trace, dag, output_dir)
        jobs.append(
            Job(
                item=trace,
                output_changed=trace.changed,
                target=target,
                action=action,
                trace=trace,
                dag=dag,
                output_dir=output_dir,
            )
        )
    return jobs
