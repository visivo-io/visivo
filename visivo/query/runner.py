from typing import List
import warnings
from queue import Queue
import os

from pandas import read_json
from visivo.models.base.parent_model import ParentModel
from visivo.models.model import CsvScriptModel
from visivo.models.project import Project
from visivo.models.trace import Trace
from visivo.logging.logger import Logger
from time import time
import concurrent.futures
import queue
import time

from visivo.query.jobs.run_csv_script_job import action as run_csv_script_job_action
from visivo.query.jobs.run_trace_job import action as run_trace_job_action

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
        limit = 1
        if target.connection_pool_size:
            limit = target.connection_pool_size
        self.target_limits[target.name] = {"limit": limit, "running": 0}

    def accepting(self, target):
        if target.name not in self.target_limits:
            self.add_target(target)
        return (
            self.target_limits[target.name]["limit"]
            - self.target_limits[target.name]["running"]
        ) > 0


class Job:
    def __init__(self, name, action, **kwargs):
        self.name = name
        self.action = action
        self.kwargs = kwargs


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
        complete = False
        target_limits = AvailableThreads()
        job_queue = Queue()
        run_jobs = []
        start_time = time()
        with concurrent.futures.ThreadPoolExecutor(
            max_workers=self.threads
        ) as executor:
            while True:
                complete = self.update_job_queue(job_queue, run_jobs)
                if complete:
                    break

                try:
                    job = job_queue.get(timeout=1)
                except queue.Empty:
                    continue

                if target_limits.accepting(job.target):
                    future = executor.submit(job.action, job.args)
                    run_jobs.append(job)
                else:
                    job_queue.put(job)

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

    def update_job_queue(self, job_queue: Queue, run_jobs: List) -> bool:
        all_dependencies_completed = True
        csv_script_models = ParentModel.all_descendants_of_type(
            type=CsvScriptModel, dag=self.dag, from_node=self.project
        )
        for csv_script_model in csv_script_models:
            if csv_script_model.name not in run_jobs:
                job_queue.put(
                    Job(
                        name=csv_script_model.name,
                        action=run_csv_script_job_action,
                        csv_script_model=csv_script_model,
                        output_dir=self.output_dir,
                    )
                )

        traces = ParentModel.all_descendants_of_type(
            type=Trace, dag=self.dag, from_node=self.project
        )
        for trace in traces:
            children_csv_script_models = ParentModel.all_descendants_of_type(
                type=CsvScriptModel, dag=self.dag, from_node=self.trace
            )
            dependencies_completed = all(
                csv_script_model.name in run_jobs
                for csv_script_model in children_csv_script_models
            )
            if not dependencies_completed:
                all_dependencies_completed = False
            not_completed = trace.name not in run_jobs
            if dependencies_completed and not_completed:
                job_queue.put(
                    Job(
                        name=trace.name,
                        action=run_trace_job_action,
                        trace=trace,
                        dag=self.dag,
                        errors=self.errors,
                        output_dir=self.output_dir,
                    )
                )

        return all_dependencies_completed and job_queue.empty()

    @classmethod
    def aggregate(cls, json_file: str, trace_dir: str):
        data_frame = read_json(json_file)
        cls.aggregate_data_frame(data_frame=data_frame, trace_dir=trace_dir)

    @classmethod
    def aggregate_data_frame(cls, data_frame, trace_dir):
        aggregated = data_frame.groupby("cohort_on").aggregate(list).transpose()
        with open(f"{trace_dir}/data.json", "w") as fp:
            fp.write(aggregated.to_json(default_handler=str))
