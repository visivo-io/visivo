import click
import os
import yaml
from visivo.discovery.discover import Discover
from visivo.models.trace import Trace
from visivo.models.model import Model
from visivo.models.base.parent_model import ParentModel
from visivo.parsers.parser_factory import ParserFactory
from visivo.parsers.serializer import Serializer
from visivo.query.query_string_factory import QueryStringFactory
from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.query.query_writer import QueryWriter
from visivo.commands.utils import find_default_target
from visivo.logging.logger import Logger


def compile_phase(default_target: str, working_dir: str, output_dir: str, name_filter: str = None):
    Logger.instance().debug("Compiling project")
    discover = Discover(working_directory=working_dir)
    parser = ParserFactory().build(
        project_file=discover.project_file, files=discover.files
    )
    project = None
    try:
        project = parser.parse()
    except yaml.YAMLError as e:
        message = "\n"
        if hasattr(e, "problem_mark"):
            mark = e.problem_mark
            message = f"\n Error position: line:{mark.line+1} column:{mark.column+1}\n"
        raise click.ClickException(
            f"There was an error parsing the yml file(s):{message} {e}"
        )

    os.makedirs(output_dir, exist_ok=True)
    with open(f"{output_dir}/project.json", "w") as fp:
        serializer = Serializer(project=project)
        fp.write(serializer.dereference().model_dump_json(exclude_none=True))

    dag = project.dag()
    for trace in project.filter_traces(name_filter=name_filter):
        model = ParentModel.all_descendants_of_type(
            type=Model, dag=dag, from_node=trace
        )[0]
        target = find_default_target(project=project, target_name=trace.get_target_name(default_name=default_target))
        tokenized_trace = TraceTokenizer(
            trace=trace, model=model, target=target
        ).tokenize()
        query_string = QueryStringFactory(tokenized_trace=tokenized_trace).build()
        QueryWriter(
            trace=trace, query_string=query_string, output_dir=output_dir
        ).write()

    Logger.instance().debug("Project compiled")
    return project
