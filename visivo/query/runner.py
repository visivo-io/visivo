from typing import List, Optional
from sqlalchemy import text
import warnings
from threading import Thread

from pandas import read_json
from visivo.models.project import Project
from visivo.models.trace import Trace
from visivo.commands.utils import find_or_create_target
from visivo.logging.logger import Logger
from time import time
import textwrap

warnings.filterwarnings("ignore")


def format_message(details, status):
    total_width = 90

    details = textwrap.shorten(details, width=80, placeholder="(trucated)") + " "
    num_dots = total_width - len(details) - len(status)
    dots = "." * num_dots
    return f"{details}{dots}[{status}]"


class Runner:
    def __init__(
        self,
        traces: List[Trace],
        project: Project,
        output_dir: str,
        default_target: str = None,
    ):
        self.traces = traces
        self.default_target = default_target
        self.project = project
        self.output_dir = output_dir

    def run(self):
        threads = []
        for trace in self.traces:
            thread = Thread(target=self._run_trace_query, args=(trace,))
            threads.append(thread)

        for thread in threads:
            thread.start()

        for thread in threads:
            thread.join()

    def _run_trace_query(self, trace: Trace):
        target_or_name = trace.target_name
        if not target_or_name:
            target_or_name = self.default_target

        target = find_or_create_target(
            project=self.project, target_or_name=target_or_name
        )
        trace_directory = f"{self.output_dir}/{trace.name}"
        with open(f"{trace_directory}/query.sql", "r") as file:
            query_string = file.read()
            try:
                logger = Logger.instance()
                start_message = format_message(
                    details=f"Started query run for trace {trace.name}",
                    status="RUNNING",
                )
                logger.debug(start_message)
                start_time = time()
                data_frame = target.read_sql(query_string)
                success_message = format_message(
                    details=f"Updated data for trace {trace.name}",
                    status=f"\033[32mSUCCESS\033[0m {round(time()-start_time,2)}s",
                )
                logger.success(success_message)
            except Exception as e:
                logger.error(str(e))
            self.__aggregate(data_frame=data_frame, trace_dir=trace_directory)

    @classmethod
    def aggregate(cls, json_file: str, trace_dir: str):
        data_frame = read_json(json_file)
        cls.__aggregate(data_frame=data_frame, trace_dir=trace_dir)

    @classmethod
    def __aggregate(cls, data_frame, trace_dir):
        aggregated = data_frame.groupby("cohort_on").aggregate(list).transpose()
        with open(f"{trace_dir}/data.json", "w") as fp:
            fp.write(aggregated.to_json(default_handler=str))
