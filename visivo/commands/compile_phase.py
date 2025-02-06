from time import time
import_start = time()
from visivo.logging.logger import Logger
Logger.instance().debug("Compiling project...")
import os
import json

from visivo.models.dag import all_descendants_of_type, filter_dag
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.sources.source import Source
from visivo.models.models.model import Model
from visivo.models.trace import Trace
from visivo.parsers.serializer import Serializer
from visivo.query.query_string_factory import QueryStringFactory
from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.query.query_writer import QueryWriter

from .parse_project_phase import parse_project_phase
from .dbt_phase import dbt_phase
import_duration = time() - import_start
if os.environ.get("STACKTRACE"):
    Logger.instance().info(f"Compile Import completed in {round(import_duration, 2)}s")


def write_dag(project, output_dir):
    with open(f"{output_dir}/dag.json", "w") as fp:
        fp.write(json.dumps(project.dag_dict()))

def compile_phase(
    default_source: str,
    working_dir: str,
    output_dir: str,
    dag_filter: str = None,
    dbt_profile: str = None,
    dbt_target: str = None,
):
    # Track dbt phase
    dbt_start = time()
    dbt_phase(working_dir, output_dir, dbt_profile, dbt_target)
    dbt_duration = time() - dbt_start
    if os.environ.get("STACKTRACE"):
        Logger.instance().info(f"dbt phase completed in {round(dbt_duration, 2)}s")


    # Track parse project
    parse_start = time()
    project = parse_project_phase(working_dir, output_dir, default_source)
    parse_duration = time() - parse_start
    if os.environ.get("STACKTRACE"):
        Logger.instance().info(f"Project parsing completed in {round(parse_duration, 2)}s")
    
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    # Ensure thumbnail directory exists
    thumbnail_dir = os.path.join(output_dir, "dashboard-thumbnails")
    os.makedirs(thumbnail_dir, exist_ok=True)

    # Track artifacts writing
    artifacts_start = time()
    write_dag(project=project, output_dir=output_dir)
    
    # Write the original project.json
    with open(f"{output_dir}/project.json", "w") as fp:
        serializer = Serializer(project=project)
        fp.write(
            serializer.dereference().model_dump_json(exclude_none=True)
        )
    
    # Write the flattened explorer.json for the QueryExplorer
    with open(f"{output_dir}/explorer.json", "w") as fp:
        serializer = Serializer(project=project)
        explorer_data = serializer.create_flattened_project()
        json.dump(explorer_data, fp)
    artifacts_duration = time() - artifacts_start
    if os.environ.get("STACKTRACE"):
        Logger.instance().info(f"Project artifacts written in {round(artifacts_duration, 2)}s")

    # Track trace query writing
    traces_start = time()
    dag = project.dag()
    filtered_dag = filter_dag(dag, dag_filter)
    traces = all_descendants_of_type(type=Trace, dag=filtered_dag)
    for trace in traces:
        model = all_descendants_of_type(type=Model, dag=dag, from_node=trace)[0]
        if isinstance(model, CsvScriptModel):
            source = model.get_duckdb_source(output_dir=output_dir)
        elif isinstance(model, LocalMergeModel):
            source = model.get_duckdb_source(output_dir=output_dir, dag=dag)
        else:
            source = all_descendants_of_type(type=Source, dag=dag, from_node=model)[0]
        tokenized_trace = TraceTokenizer(
            trace=trace, model=model, source=source
        ).tokenize()
        query_string = QueryStringFactory(tokenized_trace=tokenized_trace).build()
        QueryWriter(
            trace=trace, query_string=query_string, output_dir=output_dir
        ).write()
    traces_duration = time() - traces_start
    if os.environ.get("STACKTRACE"):
        Logger.instance().info(f"Trace queries written in {round(traces_duration, 2)}s")

    total_duration = time() - import_start
    Logger.instance().success(
        f"Compile completed in {round(total_duration, 2)}s "
        f"(imports: {round(import_duration, 2)}s, "
        f"dbt: {round(dbt_duration, 2)}s, "
        f"parse: {round(parse_duration, 2)}s, "
        f"artifacts: {round(artifacts_duration, 2)}s, "
        f"traces: {round(traces_duration, 2)}s)"
    )
    
    return project
