from typing import Any
import warnings

from visivo.models.base.parent_model import ParentModel
from visivo.models.insight import Insight
from visivo.models.models.sql_model import SqlModel
from visivo.models.project import Project
from visivo.logger.logger import Logger
from time import time
from concurrent.futures import Future, ThreadPoolExecutor
import queue
import sys
from visivo.models.sources.source import Source
from visivo.models.inputs.input import Input
from visivo.jobs.job import JobResult, diagnostic_object_ref, format_message_skipped
from visivo.models.diagnostic import Diagnostic, DiagnosticPhase, DiagnosticRelated

from visivo.jobs.run_insight_job import job as insight_job
from visivo.jobs.run_source_schema_job import job as source_schema_job
from visivo.jobs.run_sql_model_job import job as sql_model_job
from visivo.jobs.run_input_job import job as input_job
from visivo.jobs.job_tracker import JobTracker
from visivo.query.source_schema_cache import SourceSchemaCache
from threading import Lock

warnings.filterwarnings("ignore")

# The node types create_jobs_from_item turns into jobs. Only these get a
# synthesized "skipped" JobResult — presentation nodes (charts, dashboards,
# rows...) sit above failed dependencies too, but they are not jobs and
# recording them would bury the real failure in derived noise.
_RUNNABLE_TYPES = (Insight, Input, SqlModel, Source)


class DagRunner:
    def __init__(
        self,
        project: Project,
        output_dir: str,
        threads: int,
        soft_failure: bool,
        server_url: str,
        job_dag: Any,
        working_dir: str,
        run_id: str = None,
    ):
        self.project = project
        self.output_dir = output_dir
        self.threads = threads
        self.soft_failure = soft_failure
        self.server_url = server_url
        self.job_dag = job_dag
        self.working_dir = working_dir
        self.run_id = run_id
        self.job_tracking_dag = job_dag.copy()
        self.project_dag = project.dag()
        self.failed_job_results = []
        self.successful_job_results = []
        self.lock = Lock()
        # Schema cache for SQL model jobs - builds DataTypes once per source
        self.schema_cache = SourceSchemaCache()

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
            skipped_count = sum(
                1
                for result in self.failed_job_results
                if result.diagnostic is not None and result.diagnostic.code == "dependency_failed"
            )
            error_count = len(self.failed_job_results) - skipped_count
            skipped_suffix = f" ({skipped_count} dependent job(s) skipped)" if skipped_count else ""
            Logger.instance().info("")
            Logger.instance().info("")
            Logger.instance().error(
                f"\n\nRun failed in {round(time()-start_time, 2)}s with {error_count} query error(s){skipped_suffix}."
            )
            for result in self.failed_job_results:
                Logger.instance().error(str(result.message))
            if not self.soft_failure:
                sys.exit(1)
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
                    failed_upstreams = [
                        descendant
                        for descendant in descendants
                        if job_tracker.is_job_name_failed(descendant.name)
                    ]
                    self.record_skipped_job(terminal_node, failed_upstreams)
                    self.job_tracking_dag.remove_node(terminal_node)
                    continue

                job = self.create_jobs_from_item(terminal_node)
                if not job:
                    self.job_tracking_dag.remove_node(terminal_node)
                    continue
                if not job_tracker.is_job_name_enqueued(job.name):
                    job_tracker.track_job(job)

            return len(self.job_tracking_dag.nodes()) == 1

    def record_skipped_job(self, item, failed_upstreams):
        """Synthesize a failed JobResult for a runnable node skipped because an
        upstream failed (M16). Before this, the skip was only a log line: no
        JobResult, no failed_job_results entry — so the viewer saw an insight
        silently produce nothing while only the upstream's failure surfaced.
        """
        if not isinstance(item, _RUNNABLE_TYPES):
            return
        object_ref = diagnostic_object_ref(item)
        upstream_refs = [diagnostic_object_ref(upstream) for upstream in failed_upstreams]
        upstream_names = ", ".join(f"'{ref.name}'" for ref in upstream_refs) or "a dependency"
        message = (
            f"Skipped {object_ref.type} '{object_ref.name}' because "
            f"{'its dependency' if len(upstream_refs) == 1 else 'its dependencies'} "
            f"{upstream_names} failed."
        )
        diagnostic = Diagnostic(
            phase=DiagnosticPhase.RUN,
            code="dependency_failed",
            message=message,
            object=object_ref,
            hint="Fix the failed dependency and run again — this job never ran.",
            related=[
                DiagnosticRelated(
                    message=f"{ref.type} '{ref.name}' failed",
                    object=ref,
                )
                for ref in upstream_refs
            ],
        )
        self.failed_job_results.append(
            JobResult(
                item=item,
                success=False,
                message=format_message_skipped(
                    details=f"Skipped job for {object_ref.type} \033[4m{object_ref.name}\033[0m",
                    error_msg=f"upstream {upstream_names} failed",
                ),
                diagnostic=diagnostic,
            )
        )

    @property
    def diagnostics(self):
        """The structured failures of this run, in job-completion order."""
        return [
            result.diagnostic for result in self.failed_job_results if result.diagnostic is not None
        ]

    def create_jobs_from_item(self, item: ParentModel):
        if isinstance(item, Insight):
            return insight_job(
                insight=item, output_dir=self.output_dir, dag=self.project_dag, run_id=self.run_id
            )
        elif isinstance(item, Input):
            return input_job(
                dag=self.project_dag, output_dir=self.output_dir, input_obj=item, run_id=self.run_id
            )
        elif isinstance(item, SqlModel):
            return sql_model_job(
                sql_model=item,
                output_dir=self.output_dir,
                dag=self.project_dag,
                run_id=self.run_id,
                schema_cache=self.schema_cache,
            )
        elif isinstance(item, Source):
            return source_schema_job(
                source=item,
                output_dir=self.output_dir,
                run_id=self.run_id,
                working_dir=self.working_dir,
            )
        return None
