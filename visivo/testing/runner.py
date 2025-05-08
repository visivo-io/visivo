# supports more generic connections than the snowflake specific connector
from visivo.models.alert import Alert
from visivo.models.base.parent_model import ParentModel
from visivo.models.dag import all_descendants_of_type
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
    ):
        self.tests = tests
        self.project = project
        self.output_dir = output_dir
        self.dag = dag

    def run(self):
        test_run = TestRun()
        for test in self.tests:
            for assertion in test.assertions:
                try:
                    passed = assertion.evaluate(
                        dag=self.dag, project=self.project, output_dir=self.output_dir
                    )
                    if passed:
                        click.echo(click.style(".", fg="green"), nl=False)
                        success = TestSuccess(test_id=test.path)
                        test_run.add_success(success=success)
                    else:
                        click.echo(click.style("F", fg="red"), nl=False)
                        failure = TestFailure(test_id=test.path, message=assertion.value)
                        test_run.add_failure(failure=failure)
                except Exception as e:
                    failure = TestFailure(test_id=test.path, message=str(e))
                    click.echo(click.style("F", fg="red"), nl=False)
                    test_run.add_failure(failure=failure)
        test_run.finished_at = datetime.now()
        click.echo("")
        click.echo(test_run.summary())

        alerts = all_descendants_of_type(type=Alert, dag=self.dag)

        for alert in set(alerts):
            if alert.if_ and alert.if_.evaluate(
                dag=self.dag,
                project=self.project,
                output_dir=self.output_dir,
                test_run=test_run,
            ):
                alert.alert(test_run=test_run)

        return test_run
