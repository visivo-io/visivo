# supports more generic connections than the snowflake specific connector
from visivo.models.alert import Alert
from visivo.models.project import Project
from visivo.models.test import Test
from visivo.models.trace import Trace
from visivo.models.test_run import TestRun, TestFailure, TestSuccess
from visivo.models.destinations.destination import Destination
from typing import Any, List
import json
import click
from datetime import datetime
import warnings


warnings.filterwarnings("ignore")


class Runner:
    def __init__(
        self,
        tests: List[Test],
        project: Project,
        output_dir: str,
        dag: Any,
        default_target: str = None,
    ):
        self.project = project
        self.tests = tests
        self.default_target = default_target
        self.output_dir = output_dir
        self.dag = dag

    def run(self):
        test_run = TestRun()
        # TODO This is going to need to go off the tests, determine which traces they reference, and run those traces.
        for test in enumerate(self.tests):
            for assertion in test.assertions:
                try:
                    assertion.evaluate(self.project, self.output_dir)
                    click.echo(click.style(".", fg="green"), nl=False)
                    success = TestSuccess(test_id=test.name)
                    test_run.add_success(success=success)
                except Exception as e:
                    failure = TestFailure(test_id=test.name, message=str(e))
                    click.echo(click.style("F", fg="red"), nl=False)
                    test_run.add_failure(failure=failure)
        test_run.finished_at = datetime.now()
        click.echo("")
        click.echo(test_run.summary())

        for alert in self.alerts:
            alert.alert(test_run=test_run)

        return test_run
