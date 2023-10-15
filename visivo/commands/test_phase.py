import sys
import click
from visivo.commands.logger import Logger
from visivo.commands.utils import find_or_create_target
from visivo.testing.runner import Runner
from visivo.commands.compile_phase import compile_phase


def test_phase(
    output_dir: str, default_target: str, working_dir: str, alert_names: str
):
    project = compile_phase(
        default_target=default_target, working_dir=working_dir, output_dir=output_dir
    )
    Logger().info("Testing project")
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
    if not test_runner.run().success:
        sys.exit(1)


test_phase.__test__ = False
