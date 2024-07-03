# supports more generic connections than the snowflake specific connector
from visivo.models.project import Project
from visivo.models.trace import Trace
from visivo.models.test_run import TestRun, TestFailure, TestSuccess
from visivo.models.alert import Alert
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
        import numpy
        from assertpy import assert_that
        import os

        test_run = TestRun()
        for trace in self.traces:
            if not trace.tests:
                continue
            for idx, test in enumerate(trace.tests):
                data_file = f"{self.output_dir}/{trace.name}/data.json"
                if not os.path.exists(data_file):
                    raise click.ClickException(
                        f"The trace '{trace.name}' doesn't have a data file present, please run 'visivo run'."
                    )
                with open(data_file) as f:
                    trace_data = json.load(f)
                    logic = test.logic
                    try:
                        if not any(k in logic for k in trace_data.keys()):
                            raise click.ClickException(
                                f"The test does not reference a valid data cohort.  Available cohorts: {', '.join(trace_data.keys())}"
                            )
                        for cohort in trace_data.keys():
                            if cohort in logic:
                                logic = logic.replace(cohort, f"trace_data['{cohort}']")
                                cohort_keys = list(trace_data[cohort].keys())
                                cohort_keys.sort(key=len, reverse=True)
                                for key in cohort_keys:
                                    logic = logic.replace(key, f"['{key}']")
                        logic = logic.replace("].[", "][")
                        eval(f"{logic}")
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
