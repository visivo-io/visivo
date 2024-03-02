from typing import List
import warnings

from visivo.models.project import Project
from visivo.models.trace import Trace
from visivo.logging.logger import Logger
from time import time
from concurrent.futures import Future, ThreadPoolExecutor
import queue
from visivo.query.jobs.job import Job, JobResult

from visivo.query.jobs.run_csv_script_job import jobs as csv_script_jobs
from visivo.query.jobs.run_trace_job import jobs as run_trace_jobs
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
        self.jobs: List[Job] = []

    def run(self):
        complete = False
        target_job_tracker = TargetJobTracker()
        start_time = time()
        self.jobs = self._all_jobs()
        with ThreadPoolExecutor(max_workers=self.threads) as executor:
            while True:
                complete = self.update_job_queue(target_job_tracker)
                if complete:
                    break

                try:
                    job = target_job_tracker.get_next_job()
                except queue.Empty:
                    continue

                if target_job_tracker.is_accepting_job(job):
                    Logger.instance().info(job.start_message())
                    job.set_future(executor.submit(job.action, **job.kwargs))
                    job.future.add_done_callback(self.job_callback)
                else:
                    target_job_tracker.return_to_queue(job)

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

    def update_job_queue(self, target_job_tracker: TargetJobTracker) -> bool:
        all_dependencies_completed = True
        for job in self.jobs:
            incomplete_dependencies = list(
                filter(
                    lambda d: not target_job_tracker.is_job_name_done(d),
                    job.dependencies,
                )
            )
            dependencies_completed = len(incomplete_dependencies) == 0
            if not dependencies_completed:
                all_dependencies_completed = False

            if dependencies_completed and not target_job_tracker.is_job_name_enqueued(
                job.name
            ):
                target_job_tracker.track_job(job)

        return all_dependencies_completed and target_job_tracker.empty()

    def job_callback(self, future: Future):
        job_result: JobResult = future.result(timeout=1)
        if job_result.success:
            Logger.instance().success(str(job_result.message))
        else:
            Logger.instance().error(str(job_result.message))
            self.errors.append(str(job_result.message))

    def _all_jobs(self) -> List[Job]:
        jobs = []
        jobs = jobs + run_trace_jobs(
            dag=self.dag, output_dir=self.output_dir, project=self.project
        )
        jobs = jobs + csv_script_jobs(
            dag=self.dag, output_dir=self.output_dir, project=self.project
        )
        return jobs
