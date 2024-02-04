import sys
import click
from visivo.logging.logger import Logger
from visivo.testing.runner import Runner
from visivo.commands.compile_phase import compile_phase


def test_phase(
    output_dir: str, default_target: str, working_dir: str, alert_names: str
):
    project = compile_phase(
        default_target=default_target, working_dir=working_dir, output_dir=output_dir
    )
    Logger.instance().debug("Testing project")
    alerts = list(map(lambda an: project.find_alert(name=an), alert_names))
    alerts = list(filter(None, alerts))
    test_runner = Runner(
        traces=project.trace_objs,
        project=project,
        output_dir=output_dir,
        alerts=alerts,
        default_target=default_target,
    )
    if not test_runner.run().success:
        sys.exit(1)


test_phase.__test__ = False
