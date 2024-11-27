import warnings

from visivo.models.base.parent_model import ParentModel

from visivo.models.dag import all_descendants, family_tree_contains_named_node
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
        self.job_dag = self.create_job_dag()
        self.failed_job_results = []
        self.successful_job_results = []

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

        if len(self.failed_job_results) > 0 and self.soft_failure:
            Logger.instance().error(
                f"\nRefresh failed in {round(time()-start_time, 2)}s with {len(self.failed_job_results)} query error(s)."
            )
        elif len(self.failed_job_results) > 0 and not self.soft_failure:
            Logger.instance().error(
                f"\nRun failed in {round(time()-start_time, 2)}s with {len(self.failed_job_results)} query error(s)"
            )
            exit(1)
        else:
            Logger.instance().info(f"\nRun finished in {round(time()-start_time, 2)}s")

    def job_callback(self, future: Future):
        job_result: JobResult = future.result(timeout=0.01)
        if job_result.success:
            Logger.instance().success(str(job_result.message))
            self.successful_job_results.append(job_result)
        else:
            Logger.instance().error(str(job_result.message))
            self.failed_job_results.append(job_result)

    def create_job_dag(self):
        from networkx import DiGraph

        def is_job_node(node):
            if self.name_filter and not family_tree_contains_named_node(
                item=node, name=self.name_filter, dag=self.project_dag
            ):
                return False
            job = self.create_jobs_from_item(node)
            if not job:
                return False
            return True

        job_dag = DiGraph()
        job_dag.add_node(self.project)
        for node in self.project_dag.nodes():
            if is_job_node(node):
                job_dag.add_node(node)

        def find_predecessor_in_graph(dag, root, current_node):
            predecessors = self.project_dag.predecessors(current_node)
            for predecessor in predecessors:
                if predecessor in job_dag.nodes():
                    job_dag.add_edge(predecessor, root)
                else:
                    find_predecessor_in_graph(dag, root, predecessor)

        for node in job_dag.nodes():
            find_predecessor_in_graph(job_dag, node, node)
        return job_dag

    def update_job_queue(self, job_tracker: JobTracker):
        terminal_nodes = [
            n for n in self.job_dag.nodes() if self.job_dag.out_degree(n) == 0
        ]

        failed_items = [result.item for result in self.failed_job_results]
        successful_items = [result.item for result in self.successful_job_results]

        for terminal_node in terminal_nodes:
            descendants = all_descendants(dag=self.project_dag, from_node=terminal_node)
            if terminal_node in successful_items or terminal_node in failed_items:
                self.job_dag.remove_node(terminal_node)
                continue
            elif any(descendant in failed_items for descendant in descendants):
                Logger.instance().info(
                    f"Skipping job for {terminal_node} because it has a failed dependency"
                )
                self.job_dag.remove_node(terminal_node)
                continue

            job = self.create_jobs_from_item(terminal_node)
            if not job_tracker.is_job_name_enqueued(job.name):
                if not job.output_changed and self.run_only_changed:
                    job.future = CachedFuture()
                job_tracker.track_job(job)

        return len(self.job_dag.nodes()) == 1

    def create_jobs_from_item(self, item: ParentModel):
        if isinstance(item, Trace):
            return trace_job(
                trace=item, output_dir=self.output_dir, dag=self.project_dag
            )
        if isinstance(item, CsvScriptModel):
            return csv_script_job(csv_script_model=item, output_dir=self.output_dir)
        if isinstance(item, LocalMergeModel):
            return local_merge_job(
                local_merge_model=item, output_dir=self.output_dir, dag=self.project_dag
            )
