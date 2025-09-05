from visivo.logger.logger import Logger
from visivo.models.dag import all_descendants_of_type
from visivo.models.models.model import Model
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
from visivo.jobs.utils import get_source_for_model
from time import time
from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.query.sqlglot_query_builder import SqlglotQueryBuilder


def action(trace, dag, output_dir):
    Logger.instance().info(start_message("Trace", trace))
    model = all_descendants_of_type(type=Model, dag=dag, from_node=trace)[0]
    source = get_source_for_model(model=model, dag=dag, output_dir=output_dir)

    trace_directory = f"{output_dir}/traces/{trace.name}"
    query_string = _get_query_string(trace, dag, output_dir)
    Logger.instance().debug(f"Query string: {query_string}")
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

        # Include the failing query in the error message for easier debugging
        # Format the query with line numbers for easier debugging
        query_lines = query_string.split("\n")
        numbered_query = "\n".join(f"{i+1:3d}: {line}" for i, line in enumerate(query_lines))
        error_details = f"{message}\n\n--- FAILING QUERY FOR TRACE '{trace.name}' ---\n{numbered_query}\n--- END QUERY ---"

        failure_message = format_message_failure(
            details=f"Failed query for trace \033[4m{trace.name}\033[0m",
            start_time=start_time,
            full_path=None,
            error_msg=error_details,
        )
        return JobResult(item=trace, success=False, message=failure_message)


def _get_query_string(trace, dag, output_dir):
    model = all_descendants_of_type(type=Model, dag=dag, from_node=trace)[0]
    source = get_source_for_model(model=model, dag=dag, output_dir=output_dir)

    # Get the project from the DAG (it's the root node)
    project = None
    if hasattr(dag, "get_root_nodes"):
        root_nodes = dag.get_root_nodes()
        if root_nodes and len(root_nodes) > 0:
            # The project is typically the root node
            from visivo.models.project import Project

            for node in root_nodes:
                if isinstance(node, Project):
                    project = node
                    break

    tokenized_trace = TraceTokenizer(
        trace=trace, model=model, source=source, project=project
    ).tokenize()

    # Only show debug info if DEBUG=true
    import os

    if os.environ.get("DEBUG") == "true":
        # Compact debug output - single line per trace
        Logger.instance().debug(
            f"Trace {trace.name}: model_sql={tokenized_trace.sql[:100] if tokenized_trace.sql else 'None'}..."
        )

    sql = SqlglotQueryBuilder(tokenized_trace=tokenized_trace, project=project).build()

    # Store the debug info for potential error reporting
    trace._debug_info = {
        "model_sql": model.sql if hasattr(model, "sql") else None,
        "tokenized_sql": tokenized_trace.sql,
        "columns": tokenized_trace.columns if hasattr(tokenized_trace, "columns") else None,
        "select_items": tokenized_trace.select_items,
        "filter_by": tokenized_trace.filter_by,
        "generated_sql": sql,
    }
    # breakpoint()

    return sql


def _get_source(trace, dag, output_dir):
    sources = all_descendants_of_type(type=Source, dag=dag, from_node=trace)
    if len(sources) == 1:
        return sources[0]

    model = all_descendants_of_type(type=Model, dag=dag, from_node=trace)[0]
    return get_source_for_model(model=model, dag=dag, output_dir=output_dir)


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
