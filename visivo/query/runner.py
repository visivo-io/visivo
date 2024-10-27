from typing import List
import warnings
from visivo.models.base.parent_model import ParentModel

from visivo.models.dag import all_descendants
from visivo.models.project import Project
from visivo.logging.logger import Logger
from time import time
from concurrent.futures import Future, ThreadPoolExecutor
import queue
from visivo.query.jobs.job import CachedFuture, Job, JobResult

from visivo.query.jobs.run_csv_script_job import jobs as csv_script_jobs
from visivo.query.jobs.run_trace_job import jobs as run_trace_jobs
from visivo.query.jobs.run_local_merge_job import jobs as run_local_merge_jobs
from visivo.query.job_tracker import JobTracker

warnings.filterwarnings("ignore")


class Runner:
    def __init__(
        self,
        project: Project,
        output_dir: str,
        threads: int = 8,
        soft_failure=False,
        run_only_changed=False,
        name_filter: str = None,
    ):
        self.project = project
        self.output_dir = output_dir
        self.run_only_changed = run_only_changed
        self.threads = threads
        self.soft_failure = soft_failure
        self.name_filter = name_filter
        self.dag = project.dag()
        self.errors = []
        self.jobs: List[Job] = []

    def run(self):
        complete = False
        job_tracker = JobTracker()
        start_time = time()
        self.jobs = self._all_jobs()
        with ThreadPoolExecutor(max_workers=self.threads) as executor:
            while True:
                complete = self.update_job_queue(job_tracker)
                if complete:
                    break

                try:
                    job = job_tracker.get_next_job()
                except queue.Empty:
                    continue

                if job.done() or job.running():
                    pass
                else:
                    job.set_future(executor.submit(job.action, **job.kwargs))
                    job.future.add_done_callback(self.job_callback)

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

    def update_job_queue(self, job_tracker: JobTracker) -> bool:
        all_dependencies_completed = True
        for job in self.jobs:
            job_item_children = all_descendants(dag=self.dag, from_node=job.item)
            dependencies = list(
                filter(
                    lambda j: job != j and job_item_children.has_node(j.item),
                    self.jobs,
                )
            )
            incomplete_dependencies = list(
                filter(
                    lambda d: not job_tracker.is_job_name_done(d.name),
                    dependencies,
                )
            )
            dependencies_completed = len(incomplete_dependencies) == 0
            if not dependencies_completed:
                all_dependencies_completed = False

            if dependencies_completed and not job_tracker.is_job_name_enqueued(
                job.name
            ):
                if not job.output_changed and self.run_only_changed:
                    job.future = CachedFuture()
                job_tracker.track_job(job)

        return all_dependencies_completed and job_tracker.empty()

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
            dag=self.dag,
            output_dir=self.output_dir,
            project=self.project,
            name_filter=self.name_filter,
        )
        jobs = jobs + csv_script_jobs(
            dag=self.dag,
            output_dir=self.output_dir,
            project=self.project,
            name_filter=self.name_filter,
        )
        jobs = jobs + run_local_merge_jobs(
            dag=self.dag,
            output_dir=self.output_dir,
            project=self.project,
            name_filter=self.name_filter,
        )
        return jobs
