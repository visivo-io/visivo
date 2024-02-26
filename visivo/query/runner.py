from typing import List
import warnings
from queue import Queue

from visivo.models.base.parent_model import ParentModel
from visivo.models.model import CsvScriptModel
from visivo.models.project import Project
from visivo.models.target import Target
from visivo.models.trace import Trace
from visivo.logging.logger import Logger
from time import time
import concurrent.futures
import queue
from visivo.query.jobs.job import Job

from visivo.query.jobs.run_csv_script_job import action as run_csv_script_job_action
from visivo.query.jobs.run_trace_job import action as run_trace_job_action
from visivo.query.target_job_tracker import TargetJobTracker

warnings.filterwarnings("ignore")


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
        target_job_tracker = TargetJobTracker()
        job_queue = Queue()
        start_time = time()
        with concurrent.futures.ThreadPoolExecutor(
            max_workers=self.threads
        ) as executor:
            while True:
                complete = self.update_job_queue(job_queue, target_job_tracker)
                if complete:
                    break

                try:
                    job = job_queue.get(timeout=1)
                except queue.Empty:
                    continue

                if target_job_tracker.is_accepting_job(job):
                    job.set_future(executor.submit(job.action, **job.kwargs))
                    target_job_tracker.track_job(job)
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

    def update_job_queue(self, job_queue: Queue, target_job_tracker: TargetJobTracker) -> bool:
        all_dependencies_completed = True
        csv_script_models = ParentModel.all_descendants_of_type(
            type=CsvScriptModel, dag=self.dag, from_node=self.project
        )
        for csv_script_model in csv_script_models:
            if not target_job_tracker.is_job_name_enqueued(csv_script_model.name):
                job_queue.put(
                    Job(
                        name=csv_script_model.name,
                        target=csv_script_model.target,
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
                type=CsvScriptModel, dag=self.dag, from_node=trace
            )
            dependencies_completed = all(
                target_job_tracker.is_job_name_done(csv_script_model.name)
                for csv_script_model in children_csv_script_models
            )
            if not dependencies_completed:
                all_dependencies_completed = False

            trace_not_enqueued = not target_job_tracker.is_job_name_enqueued(trace.name)
            if dependencies_completed and trace_not_enqueued:
                target = ParentModel.all_descendants_of_type(
                    type=Target, dag=self.dag, from_node=trace
                )[0]
                job_queue.put(
                    Job(
                        name=trace.name,
                        target=target,
                        action=run_trace_job_action,
                        trace=trace,
                        dag=self.dag,
                        errors=self.errors,
                        output_dir=self.output_dir,
                    )
                )

        return all_dependencies_completed and job_queue.empty()
