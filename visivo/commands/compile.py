import click
import os
import json
from pathlib import Path
from visivo.discovery.discover import Discover
from visivo.models.project import Project
from visivo.models.target import Target
from visivo.parsers.parser_factory import ParserFactory
from visivo.parsers.serializer import Serializer
from visivo.query.query_string_factory import QueryStringFactory
from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.query.dialect import Dialect
from visivo.query.query_writer import QueryWriter
from .options import output_dir, working_dir, target


def compile_phase(target_or_name: str, working_dir: str, output_dir: str):
    click.echo("Compiling project")
    discover = Discover(working_directory=working_dir)
    parser = ParserFactory().build(files=discover.files())
    project = parser.parse()
    target = find_or_create_target(project=project, target_or_name=target_or_name)
    dialect = Dialect(type=target.type)
    os.makedirs(output_dir, exist_ok=True)
    with open(f"{output_dir}/project.json", "w") as fp:
        serializer = Serializer(project=project)
        fp.write(serializer.dereference().json())

    for trace in project.trace_objs:
        tokenized_trace = TraceTokenizer(trace=trace, dialect=dialect).tokenize()
        query_string = QueryStringFactory(tokenized_trace=tokenized_trace).build()
        QueryWriter(
            trace=trace, query_string=query_string, output_dir=output_dir
        ).write()

    return project


def find_or_create_target(project: Project, target_or_name: str) -> Target:
    target = project.find_target(name=target_or_name)

    if not target:
        try:
            json_data = json.loads(target_or_name)
        except:
            raise click.ClickException(f"Target: '{target_or_name}' is not valid JSON")
        target = Target(**json_data)

    if not target:
        raise click.ClickException(
            f"Target with name: '{target_or_name}' was not found."
        )

    return target


@click.command()
@target
@working_dir
@output_dir
def compile(working_dir, output_dir, target):
    compile_phase(target_or_name=target, working_dir=working_dir, output_dir=output_dir)
