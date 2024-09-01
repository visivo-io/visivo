# supports more generic connections than the snowflake specific connector
from visivo.models.alert import Alert
from visivo.models.project import Project
from visivo.models.trace import Trace
from visivo.models.test_run import TestRun, TestFailure, TestSuccess
from visivo.models.destinations.destination import Destination
from typing import List
import json
import click
from datetime import datetime
import warnings


warnings.filterwarnings("ignore")


class Runner:
    def __init__(
        self,
        traces: List[Trace],
        project: Project,
        output_dir: str,
        default_target: str = None,
        alerts: List[Alert] = [],
    ):
        self.project = project
        self.traces = traces
        self.default_target = default_target
        self.output_dir = output_dir
        self.alerts = alerts

    def run(self):
        test_run = TestRun()
        for trace in self.traces:
            if not trace.tests:
                continue
            for idx, test in enumerate(trace.tests):
                for assertion in  test.assertions:
                    try:
                        assertion.evaluate(self.project, self.output_dir)
                        click.echo(click.style(".", fg="green"), nl=False)
                        success = TestSuccess(test_id=f"{trace.name}.test[{idx}]")
                        test_run.add_success(success=success)
                    except Exception as e:
                        failure = TestFailure(
                            test_id=f"{trace.name}.test[{idx}]", message=str(e)
                        )
                        click.echo(click.style("F", fg="red"), nl=False)
                        test_run.add_failure(failure=failure)
        test_run.finished_at = datetime.now()
        click.echo("")
        click.echo(test_run.summary())

        for alert in self.alerts:
            alert.alert(test_run=test_run)

        return test_run
