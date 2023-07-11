import os
import click

from visivo.commands.utils import find_or_create_target
from ..testing.runner import Runner
from .compile import compile_phase
from .options import output_dir, working_dir, target, alert


def test_phase(
    output_dir: str, default_target: str, working_dir: str, alert_names: str
):
    project = compile_phase(
        default_target=default_target, working_dir=working_dir, output_dir=output_dir
    )
    click.echo("Testing project")
    target = find_or_create_target(project=project, target_or_name=default_target)
    alerts = list(map(lambda an: project.find_alert(name=an), alert_names))
    alerts = list(filter(None, alerts))
    test_runner = Runner(
        traces=project.trace_objs,
        target=target,
        project=project,
        output_dir=output_dir,
        alerts=alerts,
    )
    test_runner.run()


@click.command()
@target
@working_dir
@output_dir
@alert
def test(output_dir, working_dir, target, alert):
    """
    Enables testing trace values to ensure that the charts that are being produced have the characteristics that you would expect.
    """
    test_phase(
        default_target=target,
        output_dir=output_dir,
        working_dir=working_dir,
        alert_names=alert,
    )
