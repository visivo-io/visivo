from typing import Any
import warnings

from visivo.models.base.parent_model import ParentModel
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.dashboard import Dashboard
from visivo.models.project import Project
from visivo.logging.logger import Logger
from time import time
from concurrent.futures import Future, ThreadPoolExecutor
import queue
from visivo.models.sources.source import Source
from visivo.models.trace import Trace
from visivo.jobs.job import JobResult

from visivo.jobs.run_csv_script_job import job as csv_script_job
from visivo.jobs.run_trace_job import job as trace_job
from visivo.jobs.run_local_merge_job import job as local_merge_job
from visivo.jobs.run_source_connection_job import job as source_connection_job
from visivo.jobs.run_thumbnail_job import job as thumbnail_job
from visivo.jobs.job_tracker import JobTracker
from threading import Lock

warnings.filterwarnings("ignore")


class DagRunner:
    def __init__(
        self,
        project: Project,
        output_dir: str,
        threads: int,
        soft_failure: bool,
        thumbnail_mode: str,
        server_url: str,
        job_dag: Any,
    ):
        self.project = project
        self.output_dir = output_dir
        self.threads = threads
        self.soft_failure = soft_failure
        self.thumbnail_mode = thumbnail_mode
        self.server_url = server_url
        self.job_dag = job_dag
        self.job_tracking_dag = job_dag.copy()
        self.project_dag = project.dag()
        self.failed_job_results = []
        self.successful_job_results = []
        self.lock = Lock()

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

        if len(self.failed_job_results) > 0:
            Logger.instance().info("")
            Logger.instance().info("")
            Logger.instance().error(
                f"\n\nRun failed in {round(time()-start_time, 2)}s with {len(self.failed_job_results)} query error(s)."
            )
            for result in self.failed_job_results:
                Logger.instance().error(str(result.message))
            if not self.soft_failure:
                exit(1)
        elif len(self.successful_job_results) == 0 and len(self.failed_job_results) == 0:
            Logger.instance().error(
                f"\nNo jobs run. Ensure your filter contains nodes that are runnable."
            )
        else:
            Logger.instance().info(f"\nRun finished in {round(time()-start_time, 2)}s")

    def job_callback(self, future: Future):
        job_result: JobResult = future.result(timeout=30)
        if job_result.success:
            Logger.instance().success(str(job_result.message))
            self.successful_job_results.append(job_result)
        else:
            Logger.instance().error(str(job_result.message))
            self.failed_job_results.append(job_result)

    def update_job_queue(self, job_tracker: JobTracker):
        from networkx import descendants as node_descendants

        with self.lock:
            terminal_nodes = [
                n
                for n in self.job_tracking_dag.nodes()
                if self.job_tracking_dag.out_degree(n) == 0 and n != self.project
            ]

            for terminal_node in terminal_nodes:
                descendants = node_descendants(self.job_dag, terminal_node)
                if job_tracker.is_job_name_done(terminal_node.name):
                    self.job_tracking_dag.remove_node(terminal_node)
                    continue
                elif any(
                    job_tracker.is_job_name_failed(descendant.name) for descendant in descendants
                ):
                    Logger.instance().info(
                        f"Skipping job for '{terminal_node.name}' because it has a failed dependency"
                    )
                    self.job_tracking_dag.remove_node(terminal_node)
                    continue

                job = self.create_jobs_from_item(terminal_node)
                if not job:
                    self.job_tracking_dag.remove_node(terminal_node)
                    continue
                if not job_tracker.is_job_name_enqueued(job.name):
                    job_tracker.track_job(job)

            return len(self.job_tracking_dag.nodes()) == 1

    def create_jobs_from_item(self, item: ParentModel):
        if isinstance(item, Trace):
            return trace_job(trace=item, output_dir=self.output_dir, dag=self.project_dag)
        elif isinstance(item, CsvScriptModel):
            return csv_script_job(csv_script_model=item, output_dir=self.output_dir)
        elif isinstance(item, LocalMergeModel):
            return local_merge_job(
                local_merge_model=item, output_dir=self.output_dir, dag=self.project_dag
            )
        elif isinstance(item, Source):
            return source_connection_job(source=item)
        elif isinstance(item, Dashboard):
            if self.thumbnail_mode != "none":
                if self.server_url is None:
                    raise Exception(
                        "Cannot generate thumbnails, no server URL is provided. A running server is required to generate thumbnails."
                    )
                return thumbnail_job(
                    dashboard=item,
                    project=self.project,
                    output_dir=self.output_dir,
                    thumbnail_mode=self.thumbnail_mode,
                    server_url=self.server_url,
                )
        return None
