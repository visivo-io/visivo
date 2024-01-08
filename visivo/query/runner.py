from typing import List, Optional
from sqlalchemy import text
import warnings
from threading import Thread
from queue import Queue
import os

from pandas import read_json
from visivo.models.project import Project
from visivo.models.trace import Trace
from visivo.commands.utils import find_or_create_target
from visivo.logging.logger import Logger
from time import time, sleep
import textwrap

warnings.filterwarnings("ignore")

MAX_CONCURRENCY = 2


def format_message(details, status, full_path):
    total_width = 90

    details = textwrap.shorten(details, width=80, placeholder="(trucated)") + " "
    num_dots = total_width - len(details)
    dots = "." * num_dots
    current_directory = os.getcwd()
    relative_path = os.path.relpath(full_path, current_directory)
    return f"{details}{dots}[{status}]\n\t\033[2mquery: {relative_path}\033[0m"


class Runner:
    def __init__(
        self,
        traces: List[Trace],
        project: Project,
        output_dir: str,
        threads: int = 8,
        default_target: str = None,
    ):
        self.traces = traces
        self.default_target = default_target
        self.project = project
        self.output_dir = output_dir
        self.threads = threads
        self.errors = []

    def run(self):
        start_time = time()
        self.errors = []
        queue = Queue()
        for trace in self.traces:
            queue.put(trace)

        threads = []
        concurrency = min(len(self.traces), self.threads)
        for i in range(concurrency):
            thread = Thread(target=self._run_trace_query, args=(queue,))
            thread.daemon = True
            thread.start()
            threads.append(thread)

        queue.join()

        for thread in threads:
            thread.join()

        if len(self.errors) > 0:
            Logger.instance().error(
                f"\nRun failed in {round(time()-start_time, 2)}s with {len(self.errors)} query error(s)"
            )
            exit(1)
        else:
            Logger.instance().info(f"\nRun finished in {round(time()-start_time, 2)}s")

    def _run_trace_query(self, queue: Queue):
        while not queue.empty():
            trace = queue.get()
            target_or_name = trace.target_name
            if not target_or_name:
                target_or_name = self.default_target

            target = find_or_create_target(
                project=self.project, target_or_name=target_or_name
            )
            trace_directory = f"{self.output_dir}/{trace.name}"
            trace_query_file = f"{trace_directory}/query.sql"
            with open(trace_query_file, "r") as file:
                query_string = file.read()
                try:
                    start_message = format_message(
                        details=f"Running trace \033[4m{trace.name}\033[0m",
                        status="RUNNING",
                        full_path=trace_query_file,
                    )
                    Logger.instance().info(start_message)
                    start_time = time()
                    data_frame = target.read_sql(query_string)
                    success_message = format_message(
                        details=f"Updated data for trace \033[4m{trace.name}\033[0m",
                        status=f"\033[32mSUCCESS\033[0m {round(time()-start_time,2)}s",
                        full_path=trace_query_file,
                    )
                    self.__aggregate(data_frame=data_frame, trace_dir=trace_directory)
                    Logger.instance().success(success_message)
                except Exception as e:
                    failure_message = format_message(
                        details=f"Failed query for trace \033[4m{trace.name}\033[0m",
                        status=f"\033[31mFAILURE\033[0m {round(time()-start_time,2)}s",
                        full_path=trace_query_file,
                    )
                    Logger.instance().error(str(failure_message))
                    self.errors.append(failure_message)
                finally:
                    queue.task_done()

    @classmethod
    def aggregate(cls, json_file: str, trace_dir: str):
        data_frame = read_json(json_file)
        cls.__aggregate(data_frame=data_frame, trace_dir=trace_dir)

    @classmethod
    def __aggregate(cls, data_frame, trace_dir):
        aggregated = data_frame.groupby("cohort_on").aggregate(list).transpose()
        with open(f"{trace_dir}/data.json", "w") as fp:
            fp.write(aggregated.to_json(default_handler=str))
