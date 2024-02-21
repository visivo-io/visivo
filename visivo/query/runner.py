from typing import List, Optional
from sqlalchemy import text
import warnings
from threading import Thread
from queue import Queue
import os

from pandas import read_json
from visivo.models.base.parent_model import ParentModel
from visivo.models.model import CsvScriptModel, Model
from visivo.models.project import Project
from visivo.models.target import Target
from visivo.models.trace import Trace
from visivo.logging.logger import Logger
from time import time
import concurrent.futures
import queue
import time

warnings.filterwarnings("ignore")


def format_message(details, status, full_path, error_msg=None):
    total_width = 90

    details = textwrap.shorten(details, width=80, placeholder="(trucated)") + " "
    num_dots = total_width - len(details)
    dots = "." * num_dots
    current_directory = os.getcwd()
    relative_path = os.path.relpath(full_path, current_directory)
    error_str = "" if error_msg == None else f"\n\t\033[2merror: {error_msg}\033[0m"
    return (
        f"{details}{dots}[{status}]\n\t\033[2mquery: {relative_path}\033[0m" + error_str
    )


class AvailableThreads:
    def __init__(self):
        self.target_limits = {}

    def add_target(self, target):
        self.target_limits[target.name] = {"limit": 2, "running": 0}

    def accepting(self, target):
        return (
            self.target_limits[target.name]["limit"]
            - self.target_limits[target.name]["running"]
        ) > 0


class Runner:
    def __init__(
        self,
        traces: List[Trace],
        project: Project,
        output_dir: str,
        threads: int = 8,
        soft_failure=False,
    ):
        self.traces = traces
        self.project = project
        self.output_dir = output_dir
        self.threads = threads
        self.soft_failure = soft_failure
        self.dag = project.dag()
        self.errors = []

    def run(self):
        start_time = time()
        self.errors = []
        queue = Queue()
        for trace in self.traces:
            queue.put(trace)

        csv_script_models = ParentModel.all_descendants_of_type(
            type=CsvScriptModel, dag=self.dag, from_node=self.project
        )
        for csv_script_model in csv_script_models:
            csv_script_model.insert_csv_to_sqlite(output_dir=self.output_dir)

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

        if len(self.errors) > 0 and self.soft_failure:
            Logger.instance().error(
                f"\nRefresh failed in {round(time()-start_time, 2)}s with {len(self.errors)} query error(s)."
            )
        elif len(self.errors) > 0 and not self.soft_failure:
            Logger.instance().error(
                f"\nRun failed in {round(time()-start_time, 2)}s with {len(self.errors)} query error(s)"
            )
            exit(1)
        else:
            Logger.instance().info(f"\nRun finished in {round(time()-start_time, 2)}s")

    def task_scheduler():
        running_tasks = {}
        not_complete = True
        target_limits = AvailableThreads()
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            while not_complete:
                tasks_queue = update_task_queue(tasks_queue)
                try:
                    task = tasks_queue.get(
                        timeout=1
                    )  # Get the next task from the queue
                except queue.Empty:
                    time.sleep(1)
                    continue

                if target_limits.accepting(task.target.name):
                    executor.submit(task_worker, task)
                    running_tasks.setdefault(task.task_type, []).append(task)
                else:
                    tasks_queue.put(task)

    @classmethod
    def aggregate(cls, json_file: str, trace_dir: str):
        data_frame = read_json(json_file)
        cls.__aggregate(data_frame=data_frame, trace_dir=trace_dir)

    @classmethod
    def __aggregate(cls, data_frame, trace_dir):
        aggregated = data_frame.groupby("cohort_on").aggregate(list).transpose()
        with open(f"{trace_dir}/data.json", "w") as fp:
            fp.write(aggregated.to_json(default_handler=str))
