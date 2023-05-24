# supports more generic connections than the snowflake specific connector
from sqlalchemy import text
from visivo.query.query_string_factory import QueryStringFactory
from visivo.query.dialect import Dialect
from visivo.testing.test_query_string_factory import TestQueryStringFactory
from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.models.target import Target
from visivo.models.trace import Trace
from visivo.models.test_run import TestRun, TestFailure, TestSuccess
from visivo.models.alert import Alert
from typing import List, Optional
from pandas import read_sql
import os
import click
from datetime import datetime
import warnings


warnings.filterwarnings("ignore")


class Runner:
    def __init__(
        self,
        traces: List[Trace],
        target: Target,
        output_dir: str,
        alerts: List[Alert] = [],
    ):
        self.traces = traces
        self.target = target
        self.output_dir = output_dir
        self.alerts = alerts

    def run(self):
        test_run = TestRun(target_name=self.target.name)
        for trace in self.traces:
            tokenized_trace = TraceTokenizer(trace=trace, target=self.target).tokenize()
            query_string_factory = QueryStringFactory(tokenized_trace=tokenized_trace)
            if not trace.tests:
                continue
            for test in trace.all_tests():
                test_query_string = TestQueryStringFactory(
                    test=test, query_string_factory=query_string_factory
                ).build()
                trace_directory = f"{self.output_dir}/{trace.name}/tests"
                os.makedirs(trace_directory, exist_ok=True)
                with open(f"{trace_directory}/{test.name}.sql", "w") as fp:
                    fp.write(test_query_string)

                data_frame = data_frame = self.target.read_sql(test_query_string)

                if len(data_frame) > 0:
                    failure = TestFailure(
                        test_id=test.name, message=data_frame.loc[0][0]
                    )
                    click.echo(click.style("F", fg="red"), nl=False)
                    test_run.add_failure(failure=failure)
                else:
                    click.echo(click.style(".", fg="green"), nl=False)
                    success = TestSuccess(test_id=test.name)
                    test_run.add_success(success=success)
        test_run.finished_at = datetime.now()
        click.echo("")
        click.echo(test_run.summary())

        for alert in self.alerts:
            alert.alert(test_run=test_run)
