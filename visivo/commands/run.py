import click
import os
import json
from visivo.query.runner import Runner
from visivo.models.target import Target
from .compile import compile_phase, find_or_create_target
from .options import output_dir, working_dir, target, filter


def run_phase(
    target_or_name: str, output_dir: str, working_dir: str, filter: str = ".*"
):
    project = compile_phase(
        target_or_name, working_dir=working_dir, output_dir=output_dir
    )
    click.echo("Running project")

    target = find_or_create_target(project=project, target_or_name=target_or_name)
    runner = Runner(
        traces=project.filter_traces(filter), target=target, output_dir=output_dir
    )
    runner.run()


@click.command()
@filter
@target
@working_dir
@output_dir
def run(output_dir, working_dir, target, filter):
    run_phase(
        target_or_name=target,
        output_dir=output_dir,
        working_dir=working_dir,
        filter=filter,
    )
