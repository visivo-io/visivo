import click
import os
import yaml
from halo import Halo
from visivo.discovery.discover import Discover
from visivo.models.trace import Trace
from visivo.models.model import Model
from visivo.models.base.parent_model import ParentModel
from visivo.parsers.parser_factory import ParserFactory
from visivo.parsers.serializer import Serializer
from visivo.query.query_string_factory import QueryStringFactory
from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.query.query_writer import QueryWriter
from visivo.commands.utils import find_or_create_target


def compile_phase(default_target: str, working_dir: str, output_dir: str):
    click.echo("Compiling project")
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
    target = find_or_create_target(project=project, target_or_name=default_target)

    os.makedirs(output_dir, exist_ok=True)
    with open(f"{output_dir}/project.json", "w") as fp:
        serializer = Serializer(project=project)
        fp.write(serializer.dereference().model_dump_json(exclude_none=True))

    dag = project.dag()
    for trace in ParentModel.all_descendants_of_type(type=Trace, dag=dag):
        model = ParentModel.all_descendants_of_type(
            type=Model, dag=dag, from_node=trace
        )[0]
        tokenized_trace = TraceTokenizer(
            trace=trace, model=model, target=target
        ).tokenize()
        query_string = QueryStringFactory(tokenized_trace=tokenized_trace).build()
        QueryWriter(
            trace=trace, query_string=query_string, output_dir=output_dir
        ).write()

    click.echo("Project compiled")
    return project
