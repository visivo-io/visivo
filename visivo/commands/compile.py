import click
import os
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
    project = parser.parse()
    target = find_or_create_target(project=project, target_or_name=default_target)
    dialect = Dialect(type=target.type)
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
    compile_phase(default_target=target, working_dir=working_dir, output_dir=output_dir)
