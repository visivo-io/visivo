import sys
from trace import Trace
import click
from visivo.logging.logger import Logger
from visivo.testing.runner import Runner
from visivo.commands.compile_phase import compile_phase


def test_phase(
    output_dir: str, default_target: str, working_dir: str 
):
    project = compile_phase(
        default_target=default_target, working_dir=working_dir, output_dir=output_dir
    )
    Logger.instance().debug("Testing project")

    dag = project.dag()
    traces = project.descendants_of_type(type=Trace)

    test_runner = Runner(
        traces=traces,
        project=project,
        output_dir=output_dir,
        dag=dag,
        default_target=default_target,
    )
    if not test_runner.run().success:
        sys.exit(1)


test_phase.__test__ = False
