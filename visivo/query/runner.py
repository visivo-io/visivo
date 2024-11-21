from typing import List
import warnings
from visivo.models.base.parent_model import ParentModel

from visivo.models.dag import all_descendants, all_descendants_of_type
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.project import Project
from visivo.logging.logger import Logger
from time import time
from concurrent.futures import Future, ThreadPoolExecutor
import queue
from visivo.models.trace import Trace
from visivo.query.jobs.job import CachedFuture, Job, JobResult

from visivo.query.jobs.run_csv_script_job import job as csv_script_job
from visivo.query.jobs.run_trace_job import job as trace_job
from visivo.query.jobs.run_local_merge_job import job as local_merge_job
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
        self.project_dag = project.dag()
        self.job_dag = self.project_dag.copy()
        self.failed_job_results = []
        self.successful_job_results = []

    def run(self):
        complete = False
        job_tracker = JobTracker()
        start_time = time()
        with ThreadPoolExecutor(max_workers=self.threads) as executor:
            while True:
                added_job = self.update_job_queue(job_tracker)

                try:
                    job = job_tracker.get_next_job()
                except queue.Empty:
                    # Do I need this?  It might be okay to exit the loop if no jobs were added
                    if not added_job:
                        break
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

    def job_callback(self, future: Future):
        job_result: JobResult = future.result(timeout=1)
        if job_result.success:
            Logger.instance().success(str(job_result.message))
            self.successful_job_results.append(job_result)
        else:
            Logger.instance().error(str(job_result.message))
            self.failed_job_results.append(job_result)

    def update_job_queue(self, job_tracker: JobTracker):
        filtered_dag = self.job_dag.copy()
        for node in filtered_dag.nodes():
            if node in [result.item for result in self.successful_job_results]:
                filtered_dag.remove_node(node)

        failed_items = [result.item for result in self.failed_job_results]
        for node in filtered_dag.nodes():
            if node in failed_items:
                filtered_dag.remove_node(node)
            else:
                descendants = all_descendants_of_type(
                    type=ParentModel, dag=filtered_dag, from_node=node
                )
                if any(descendant in failed_items for descendant in descendants):
                    Logger.instance().warning(
                        f"Skipping job for {node} because it has a failed dependency"
                    )
                    filtered_dag.remove_node(node)

        terminal_nodes = [
            n for n in filtered_dag.nodes() if filtered_dag.out_degree(n) == 0
        ]

        for terminal_node in terminal_nodes:
            job = self.create_jobs_from_item(terminal_node)
            if job:
                if not job.output_changed and self.run_only_changed:
                    job.future = CachedFuture()
                job_tracker.track_job(job)
            else:
                filtered_dag.remove_node(terminal_node)

    def create_jobs_from_item(self, item: ParentModel):
        if isinstance(item, Trace):
            return trace_job(
                trace=item, output_dir=self.output_dir, dag=self.project_dag
            )
        if isinstance(item, CsvScriptModel):
            return csv_script_job(csv_script_model=item, output_dir=self.output_dir)
        if isinstance(item, LocalMergeModel):
            return local_merge_job(
                trace=item, output_dir=self.output_dir, dag=self.project_dag
            )
