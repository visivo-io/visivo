from typing import List
import warnings
from visivo.models.base.parent_model import ParentModel

from visivo.models.dag import all_descendants
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
        self.errors = []

    def run(self):
        complete = False
        job_tracker = JobTracker()
        start_time = time()
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

    def job_callback(self, future: Future):
        job_result: JobResult = future.result(timeout=1)
        if job_result.success:
            Logger.instance().success(str(job_result.message))
        else:
            Logger.instance().error(str(job_result.message))
            self.errors.append(str(job_result.message))

    def prune_job_dag(self):
        terminal_nodes = [
            n for n in self.job_dag.nodes() if self.job_dag.out_degree(n) == 0
        ]
        removed_nodes = []
        for terminal_node in terminal_nodes:
            if terminal_node not in [job.item for job in self.jobs]:
                terminal_nodes.remove(terminal_node)
                removed_nodes.append(terminal_node)
            if any(job.item == terminal_node and job.done() for job in self.jobs):
                terminal_nodes.remove(terminal_node)
                removed_nodes.append(terminal_node)

        #    if not job.output_changed and self.run_only_changed:
        #            job.future = CachedFuture()
        #        job_tracker.track_job(job)
        return filtered_dag

    def create_jobs_from_dag(self, dag: nx.DiGraph):
        jobs = []
        for node in dag.nodes():
            if isinstance(node, Trace):
                jobs.append(
                    trace_job(
                        trace=node, output_dir=self.output_dir, dag=self.project_dag
                    )
                )
            if isinstance(node, CsvScriptModel):
                jobs.append(
                    csv_script_job(csv_script_model=node, output_dir=self.output_dir)
                )
            if isinstance(node, LocalMergeModel):
                jobs.append(
                    local_merge_job(
                        trace=node, output_dir=self.output_dir, dag=self.project_dag
                    )
                )
        return jobs
