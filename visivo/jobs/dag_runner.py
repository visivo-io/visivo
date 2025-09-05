from typing import Any
import warnings

from visivo.models.base.parent_model import ParentModel
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.models.sql_model import SqlModel
from visivo.models.dashboard import Dashboard
from visivo.models.project import Project
from visivo.logger.logger import Logger
from time import time
from concurrent.futures import Future, ThreadPoolExecutor
import queue
import sys
from visivo.models.sources.source import Source
from visivo.models.trace import Trace
from visivo.jobs.job import JobResult

from visivo.jobs.run_csv_script_job import job as csv_script_job
from visivo.jobs.run_trace_job import job as trace_job
from visivo.jobs.run_local_merge_job import job as local_merge_job
from visivo.jobs.run_source_connection_job import job as source_connection_job
from visivo.jobs.extract_dimensions_job import job as extract_dimensions_job
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
        server_url: str,
        job_dag: Any,
        working_dir: str,
    ):
        self.project = project
        self.output_dir = output_dir
        self.threads = threads
        self.soft_failure = soft_failure
        self.server_url = server_url
        self.job_dag = job_dag
        self.working_dir = working_dir
        self.job_tracking_dag = job_dag.copy()
        self.project_dag = project.dag()
        self.failed_job_results = []
        self.successful_job_results = []
        self.lock = Lock()

    def run(self):
        complete = False
        job_tracker = JobTracker()
        start_time = time()
        
        # Track models and whether dimensions have been extracted
        all_models = set()
        dimensions_extracted = False
        
        # Identify all models that will need dimension extraction
        for node in self.job_dag.nodes():
            if isinstance(node, (CsvScriptModel, LocalMergeModel)):
                all_models.add(node.name)
        
        with ThreadPoolExecutor(max_workers=self.threads) as executor:
            while True:
                # Check if all models are done and we haven't extracted dimensions yet
                if all_models and not dimensions_extracted:
                    all_models_done = all(
                        job_tracker.is_job_name_done(model_name) for model_name in all_models
                    )
                    if all_models_done:
                        # All models are done, extract dimensions before traces start
                        Logger.instance().debug("All models complete, extracting dimensions...")
                        self._extract_all_dimensions()
                        dimensions_extracted = True
                
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
            # For CSV models, run the data generation job
            # Dimension extraction happens later when needed
            return csv_script_job(
                csv_script_model=item, output_dir=self.output_dir, working_dir=self.working_dir
            )
        elif isinstance(item, LocalMergeModel):
            # For LocalMerge models, run the data generation job
            # Dimension extraction happens later when needed
            return local_merge_job(
                local_merge_model=item, output_dir=self.output_dir, dag=self.project_dag
            )
        elif isinstance(item, Source):
            return source_connection_job(source=item, working_dir=self.working_dir)
        elif isinstance(item, SqlModel):
            # For SQL models, we can extract dimensions directly
            # since they don't need data generation first
            return extract_dimensions_job(
                model=item, dag=self.project_dag, output_dir=self.output_dir
            )
        return None
    
    def _extract_all_dimensions(self):
        """Extract dimensions for all models in parallel using thread pool."""
        from concurrent.futures import ThreadPoolExecutor, as_completed
        
        models_to_process = []
        
        # Collect all models that need dimension extraction
        for node in self.job_dag.nodes():
            if isinstance(node, (CsvScriptModel, LocalMergeModel)):
                # Only extract if not already done
                if not hasattr(node, '_implicit_dimensions'):
                    models_to_process.append(node)
        
        if not models_to_process:
            return
        
        Logger.instance().info(f"Extracting dimensions for {len(models_to_process)} models...")
        dimension_start = time()
        
        # Process dimension extraction in parallel with limited concurrency
        # Use fewer threads to avoid overwhelming the database
        max_workers = min(4, self.threads)  # Limit to 4 concurrent extractions
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(self._extract_dimensions_for_model, model): model 
                      for model in models_to_process}
            
            completed = 0
            failed = 0
            # Process completions as they happen
            for future in as_completed(futures):
                model = futures[future]
                try:
                    future.result(timeout=2)  # 2 second timeout per model
                    completed += 1
                except Exception as e:
                    failed += 1
                    Logger.instance().debug(f"Failed to extract dimensions for {model.name}: {str(e)}")
        
        Logger.instance().info(
            f"Dimension extraction completed in {round(time()-dimension_start, 2)}s "
            f"({completed} succeeded, {failed} failed)"
        )
    
    def _extract_dimensions_for_model(self, model):
        """Extract dimensions for a single model."""
        from visivo.jobs.extract_dimensions_job import extract_dimensions_for_model
        from visivo.jobs.utils import get_source_for_model
        
        try:
            source = get_source_for_model(model=model, dag=self.project_dag, output_dir=self.output_dir)
            if source:
                extract_dimensions_for_model(model, source)
                return f"Extracted dimensions for {model.name}"
        except Exception as e:
            raise Exception(f"Failed to extract dimensions for {model.name}: {str(e)}")
