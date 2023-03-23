import os
import click
from ..testing.runner import Runner
from .compile import compile_phase
from .options import output_dir, working_dir, target


def test_phase(output_dir: str, target_name: str, working_dir: str):
    project = compile_phase(
        target_or_name=target_name, working_dir=working_dir, output_dir=output_dir
    )
    click.echo("Testing project")
    target = project.find_target(name=target_name)
    if not target:
        raise click.ClickException(f"Target with name: '{target_name}' was not found.")
    test_runner = Runner(
        traces=project.trace_objs, target=target, output_dir=output_dir
    )
    test_runner.run()


@click.command()
@target
@working_dir
@output_dir
def test(output_dir, working_dir, target):
    test_phase(target_name=target, output_dir=output_dir, working_dir=working_dir)
