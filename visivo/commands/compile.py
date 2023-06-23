import click
import os
import yaml
from visivo.discovery.discover import Discover
from visivo.parsers.parser_factory import ParserFactory
from visivo.parsers.serializer import Serializer
from visivo.query.query_string_factory import QueryStringFactory
from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.query.dialect import Dialect
from visivo.query.query_writer import QueryWriter
from visivo.commands.utils import find_or_create_target
from .options import output_dir, working_dir, target


def compile_phase(default_target: str, working_dir: str, output_dir: str):
    click.echo("Compiling project")
    discover = Discover(working_directory=working_dir)
    parser = ParserFactory().build(files=discover.files())
    project = None
    try:
        project = parser.parse()
    except yaml.YAMLError as e:
        message = "";
        if hasattr(e, 'problem_mark'):
            mark = e.problem_mark
            message = f"Error position: line:{mark.line+1} column:{mark.column+1}"
        raise click.ClickException(f"There was an error parsing the yml file(s):\n {e}")
    target = find_or_create_target(project=project, target_or_name=default_target)

    os.makedirs(output_dir, exist_ok=True)
    with open(f"{output_dir}/project.json", "w") as fp:
        serializer = Serializer(project=project)
        fp.write(serializer.dereference().json())

    for trace in project.trace_objs:
        tokenized_trace = TraceTokenizer(trace=trace, target=target).tokenize()
        query_string = QueryStringFactory(tokenized_trace=tokenized_trace).build()
        QueryWriter(
            trace=trace, query_string=query_string, output_dir=output_dir
        ).write()

    return project


@click.command()
@target
@working_dir
@output_dir
def compile(working_dir, output_dir, target):
    """
    Parses the files in your working directory, extracting visivo configurations and then using those configurations to build the trace queries and a project.json file in your target directory. Queries are not run on compile, just written.
    """
    compile_phase(default_target=target, working_dir=working_dir, output_dir=output_dir)
