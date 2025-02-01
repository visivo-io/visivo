import os
import json

from visivo.discovery.discover import Discover
from visivo.models.dag import all_descendants_of_type, filter_dag
from visivo.models.defaults import Defaults
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.sources.source import Source
from visivo.models.models.model import Model
from visivo.models.base.parent_model import ParentModel
from visivo.models.trace import Trace
from visivo.parsers.serializer import Serializer
from visivo.query.query_string_factory import QueryStringFactory
from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.query.query_writer import QueryWriter
from visivo.logging.logger import Logger
from .utils import parse_project_file
from .dbt_phase import dbt_phase


def flatten_project_objects(project):
    """
    Traverse the project structure and collect all sources, models, and traces
    into flat lists at the top level.
    """
    flattened = {
        'sources': [],
        'models': [],
        'traces': []
    }
    
    def collect_objects(obj):
        if hasattr(obj, 'sources'):
            flattened['sources'].extend(obj.sources)
        if hasattr(obj, 'models'):
            flattened['models'].extend(obj.models)
        if hasattr(obj, 'traces'):
            flattened['traces'].extend(obj.traces)
            
        # Recursively traverse nested objects
        for attr_name, attr_value in obj.__dict__.items():
            if isinstance(attr_value, (list, tuple)):
                for item in attr_value:
                    if isinstance(item, ParentModel):
                        collect_objects(item)
            elif isinstance(attr_value, ParentModel):
                collect_objects(attr_value)
    
    collect_objects(project)
    return flattened

def compile_phase(
    default_source: str,
    working_dir: str,
    output_dir: str,
    dag_filter: str = None,
    dbt_profile: str = None,
    dbt_target: str = None,
):
    dbt_phase(working_dir, output_dir, dbt_profile, dbt_target)

    Logger.instance().debug("Compiling project")
    project = parse_project_file(working_dir, output_dir, default_source)
    
    os.makedirs(output_dir, exist_ok=True)
    
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

    Logger.instance().debug("Project compiled")
    return project
