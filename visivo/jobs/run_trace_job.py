from visivo.logging.logger import Logger
from visivo.models.dag import all_descendants_of_type
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.models.model import Model
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.project import Project
from visivo.models.sources.source import Source
from visivo.models.trace import Trace
from visivo.query.aggregator import Aggregator
from visivo.jobs.job import (
    Job,
    JobResult,
    format_message_failure,
    format_message_success,
    start_message,
)
from time import time
from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.query.query_string_factory import QueryStringFactory


def action(trace, dag, output_dir):
    Logger.instance().info(start_message("Trace", trace))
    model = all_descendants_of_type(type=Model, dag=dag, from_node=trace)[0]

    if isinstance(model, CsvScriptModel):
        source = model.get_duckdb_source(output_dir=output_dir)
    elif isinstance(model, LocalMergeModel):
        source = model.get_duckdb_source(output_dir=output_dir, dag=dag)
    else:
        source = all_descendants_of_type(type=Source, dag=dag, from_node=model)[0]

    trace_directory = f"{output_dir}/traces/{trace.name}"
    query_string = _get_query_string(trace, dag, output_dir)
    try:
        start_time = time()
        data_frame = source.read_sql(query_string)
        success_message = format_message_success(
            details=f"Updated data for trace \033[4m{trace.name}\033[0m",
            start_time=start_time,
            full_path=None,
        )
        Aggregator.aggregate_data_frame(data_frame=data_frame, trace_dir=trace_directory)
        return JobResult(item=trace, success=True, message=success_message)
    except Exception as e:
        if hasattr(e, "message"):
            message = e.message
        else:
            message = repr(e)
        failure_message = format_message_failure(
            details=f"Failed query for trace \033[4m{trace.name}\033[0m",
            start_time=start_time,
            full_path=None,
            error_msg=message,
        )
        return JobResult(item=trace, success=False, message=failure_message)


def _get_query_string(trace, dag, output_dir):
    model = all_descendants_of_type(type=Model, dag=dag, from_node=trace)[0]
    if isinstance(model, CsvScriptModel):
        source = model.get_duckdb_source(output_dir=output_dir)
    elif isinstance(model, LocalMergeModel):
        source = model.get_duckdb_source(output_dir=output_dir, dag=dag)
    else:
        source = all_descendants_of_type(type=Source, dag=dag, from_node=model)[0]
    tokenized_trace = TraceTokenizer(trace=trace, model=model, source=source).tokenize()
    return QueryStringFactory(tokenized_trace=tokenized_trace).build()


def _get_source(trace, dag, output_dir):
    sources = all_descendants_of_type(type=Source, dag=dag, from_node=trace)
    if len(sources) == 1:
        return sources[0]

    model = all_descendants_of_type(type=Model, dag=dag, from_node=trace)[0]
    if isinstance(model, CsvScriptModel):
        return model.get_duckdb_source(output_dir)
    elif isinstance(model, LocalMergeModel):
        return model.get_duckdb_source(output_dir, dag)
    else:
        return model.source


def job(dag, output_dir: str, trace: Trace):
    source = _get_source(trace, dag, output_dir)
    return Job(
        item=trace,
        source=source,
        action=action,
        trace=trace,
        dag=dag,
        output_dir=output_dir,
    )
