import os
import json

from visivo.discovery.discover import Discover
from visivo.models.dag import all_descendants_of_type
from visivo.models.defaults import Defaults
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.sources.source import Source
from visivo.models.models.model import Model
from visivo.models.base.parent_model import ParentModel
from visivo.parsers.serializer import Serializer
from visivo.query.query_string_factory import QueryStringFactory
from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.query.query_writer import QueryWriter
from visivo.logging.logger import Logger
from .utils import parse_project_file
from .dbt_phase import dbt_phase


def compile_phase(
    default_source: str,
    working_dir: str,
    output_dir: str,
    name_filter: str = None,
    dbt_profile: str = None,
    dbt_target: str = None,
):
    dbt_phase(working_dir, output_dir, dbt_profile, dbt_target)

    Logger.instance().debug("Compiling project")
    project = parse_project_file(working_dir, output_dir, default_source)

    os.makedirs(output_dir, exist_ok=True)
    with open(f"{output_dir}/project.json", "w") as fp:
        serializer = Serializer(project=project)
        fp.write(
            serializer.dereference().model_dump_json(exclude_none=True, by_alias=True)
        )

    dag = project.dag()
    for trace in project.filter_traces(name_filter=name_filter):
        model = all_descendants_of_type(
            type=Model, dag=dag, from_node=trace
        )[0]
        if isinstance(model, CsvScriptModel):
            source = model.get_sqlite_source(output_dir=output_dir)
        else:
            source = all_descendants_of_type(
                type=Source, dag=dag, from_node=model
            )[0]
        tokenized_trace = TraceTokenizer(
            trace=trace, model=model, source=source
        ).tokenize()
        query_string = QueryStringFactory(tokenized_trace=tokenized_trace).build()
        QueryWriter(
            trace=trace, query_string=query_string, output_dir=output_dir
        ).write()

    Logger.instance().debug("Project compiled")
    return project
