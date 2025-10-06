from visivo.logger.logger import Logger
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
from visivo.jobs.utils import get_source_for_model


def action(trace, dag, output_dir):
    model = all_descendants_of_type(type=Model, dag=dag, from_node=trace)[0]
    source = get_source_for_model(model, dag, output_dir)

    trace_directory = f"{output_dir}/traces/{trace.name}"
    query_string = _get_query_string(trace, dag, output_dir)
    try:
        start_time = time()
        data = source.read_sql(query_string)
        success_message = format_message_success(
            details=f"Updated data for trace \033[4m{trace.name}\033[0m",
            start_time=start_time,
            full_path=None,
        )
        Aggregator.aggregate_data_frame(data=data, trace_dir=trace_directory)
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
    source = get_source_for_model(model, dag, output_dir)
    tokenized_trace = TraceTokenizer(trace=trace, model=model, source=source).tokenize()
    return QueryStringFactory(tokenized_trace=tokenized_trace).build()


def _get_source(trace, dag, output_dir):
    model = all_descendants_of_type(type=Model, dag=dag, from_node=trace)[0]
    return get_source_for_model(model, dag, output_dir)


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
