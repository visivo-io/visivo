from visivo.logging.logger import Logger
from visivo.models.base.parent_model import ParentModel
from visivo.models.dag import all_descendants_of_type
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.models.model import Model
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.project import Project
from visivo.models.sources.source import Source
from visivo.query.aggregator import Aggregator
from visivo.query.jobs.job import (
    Job,
    JobResult,
    format_message_failure,
    format_message_success,
    start_message,
)
from time import time


def action(trace, dag, output_dir):
    Logger.instance().info(start_message("Trace", trace))
    model = all_descendants_of_type(type=Model, dag=dag, from_node=trace)[0]

    if isinstance(model, CsvScriptModel):
        source = model.get_sqlite_source(output_dir=output_dir)
    elif isinstance(model, LocalMergeModel):
        source = model.get_sqlite_source(output_dir=output_dir, dag=dag)
    else:
        source = all_descendants_of_type(type=Source, dag=dag, from_node=model)[0]

    trace_directory = f"{output_dir}/{trace.name}"
    trace_query_file = f"{trace_directory}/query.sql"
    with open(trace_query_file, "r") as file:
        query_string = file.read()
        try:
            start_time = time()
            data_frame = source.read_sql(query_string)
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
            if hasattr(e, "message"):
                message = e.message 
            else:
                message = repr(e)
            failure_message = format_message_failure(
                details=f"Failed query for trace \033[4m{trace.name}\033[0m",
                start_time=start_time,
                full_path=trace_query_file,
                error_msg=message,
            )
            return JobResult(success=False, message=failure_message)


def _get_source(trace, dag, output_dir):
    sources = all_descendants_of_type(type=Source, dag=dag, from_node=trace)
    if len(sources) == 1:
        return sources[0]

    model = all_descendants_of_type(type=Model, dag=dag, from_node=trace)[0]
    if isinstance(model, CsvScriptModel):
        return model.get_sqlite_source(output_dir)
    elif isinstance(model, LocalMergeModel):
        return model.get_sqlite_source(output_dir, dag)
    else:
        return model.source


def jobs(dag, output_dir: str, project: Project, name_filter: str):
    jobs = []

    traces = project.filter_traces(name_filter=name_filter)
    for trace in traces:
        source = _get_source(trace, dag, output_dir)
        jobs.append(
            Job(
                item=trace,
                output_changed=trace.changed,
                source=source,
                action=action,
                trace=trace,
                dag=dag,
                output_dir=output_dir,
            )
        )
    return jobs
