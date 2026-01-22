"""
PreviewDagRunner - Executes preview jobs for unsaved/modified objects

Extends DagRunner to support:
- Single object preview execution
- Automatic dependency detection and execution
- Job-ID based file naming
- Progress reporting to PreviewJobManager
"""
import os
from typing import Any, Dict, Optional
from pydantic import TypeAdapter, ValidationError

from visivo.jobs.dag_runner import DagRunner
from visivo.jobs.job import JobResult
from visivo.jobs.run_insight_job import job as insight_job
from visivo.logger.logger import Logger
from visivo.models.dag import all_descendants_of_type
from visivo.models.insight import Insight
from visivo.models.models.model import Model
from visivo.models.project import Project
from visivo.server.managers.preview_job_manager import PreviewJobManager, JobStatus


class PreviewDagRunner:
    """
    Runs preview jobs for individual objects (currently insights only).

    Unlike DagRunner which processes entire DAGs, PreviewDagRunner:
    - Takes a single object config
    - Builds minimal DAG with dependencies
    - Uses job-id for output file naming
    - Reports progress to PreviewJobManager
    """

    def __init__(
        self,
        project: Project,
        output_dir: str,
        working_dir: str,
        server_url: str,
        job_id: str,
    ):
        self.project = project
        self.output_dir = output_dir
        self.working_dir = working_dir
        self.server_url = server_url
        self.job_id = job_id
        self.job_manager = PreviewJobManager.instance()

    def run_insight_preview(self, insight_config: Dict[str, Any]) -> JobResult:
        """
        Execute preview for a single insight.

        Process:
        1. Validate insight config
        2. Create/update insight object in project DAG
        3. Detect dependent models
        4. Execute insight job with custom output paths
        5. Return result metadata

        Args:
            insight_config: Insight configuration dict

        Returns:
            JobResult with success/failure and metadata
        """
        try:
            # Update progress: validating
            self.job_manager.update_status(
                self.job_id, JobStatus.RUNNING, progress=0.1, progress_message="Validating config"
            )

            # Validate insight config
            insight = self._validate_and_create_insight(insight_config)

            # Update progress: preparing
            self.job_manager.update_status(
                self.job_id, JobStatus.RUNNING, progress=0.2, progress_message="Preparing execution"
            )

            # Build DAG with this insight (reuse existing DAG from project)
            dag = self.project.dag()

            # Update progress: executing
            self.job_manager.update_status(
                self.job_id,
                JobStatus.RUNNING,
                progress=0.5,
                progress_message=f"Executing query for {insight.name or 'preview'}",
            )

            # Execute insight job with custom output paths
            result = self._execute_insight_job(insight, dag)

            if result.success:
                # Update progress: completed
                self.job_manager.update_status(
                    self.job_id, JobStatus.RUNNING, progress=0.9, progress_message="Finalizing results"
                )

                # Load and return result
                result_data = self._load_result_metadata(insight)
                self.job_manager.set_result(self.job_id, result_data)

                return result
            else:
                # Job failed
                self.job_manager.update_status(
                    self.job_id,
                    JobStatus.FAILED,
                    error=str(result.message),
                    error_details={"item_name": insight.name or "preview", "query": str(result)},
                )
                return result

        except ValidationError as e:
            error_msg = f"Invalid insight configuration: {str(e)}"
            Logger.instance().error(error_msg)
            self.job_manager.update_status(
                self.job_id, JobStatus.FAILED, error=error_msg, error_details={"errors": e.errors()}
            )
            return JobResult(
                success=False, message=error_msg, item_name=insight_config.get("name", "preview")
            )

        except Exception as e:
            error_msg = f"Preview job failed: {str(e)}"
            Logger.instance().error(error_msg, exc_info=True)
            self.job_manager.update_status(
                self.job_id, JobStatus.FAILED, error=error_msg, error_details={"exception": str(e)}
            )
            return JobResult(
                success=False, message=error_msg, item_name=insight_config.get("name", "preview")
            )

    def _validate_and_create_insight(self, config: Dict[str, Any]) -> Insight:
        """
        Validate insight config and create Insight object.

        Uses TypeAdapter for validation like InsightManager does.
        """
        # Use TypeAdapter for validation (same as InsightManager)
        insight_adapter = TypeAdapter(Insight)
        insight = insight_adapter.validate_python(config)

        # If insight doesn't have a name, assign a temporary one
        if not insight.name:
            insight.name = f"preview_{self.job_id[:8]}"

        return insight

    def _execute_insight_job(self, insight: Insight, dag: Any) -> JobResult:
        """
        Execute insight job with custom output paths using job_id.

        Modifies output_dir to use job_id for file naming.
        """
        # Create custom output directory structure
        # Files go to: {output_dir}/files/{job_id}_{hash}.parquet
        # Metadata goes to: {output_dir}/insights/{job_id}.json

        # We need to temporarily modify the insight's name_hash to use job_id
        # But we can't modify the object directly, so we'll override in the job function

        # Create the job
        job = insight_job(insight=insight, output_dir=self.output_dir, dag=dag)

        # Override the action to use job_id for file naming
        original_action = job.action

        def custom_action(**kwargs):
            # Inject custom file naming into the action
            return self._run_insight_action_with_job_id(insight, dag, self.output_dir)

        job.action = custom_action

        # Execute the job action directly (not via thread pool)
        try:
            result = job.action(**job.kwargs)
            return result
        except Exception as e:
            Logger.instance().error(f"Insight job execution failed: {e}", exc_info=True)
            return JobResult(
                success=False, message=f"Execution failed: {str(e)}", item_name=insight.name
            )

    def _run_insight_action_with_job_id(
        self, insight: Insight, dag: Any, output_dir: str
    ) -> JobResult:
        """
        Custom insight action that uses job_id for file naming.

        This is a modified version of visivo.jobs.run_insight_job.action
        """
        from time import time
        import json
        import polars as pl
        from visivo.jobs.utils import get_source_for_model
        from visivo.jobs.job import format_message_failure, format_message_success

        try:
            # Get model and source (same as original)
            model = all_descendants_of_type(type=Model, dag=dag, from_node=insight)[0]
            source = get_source_for_model(model, dag, output_dir)

            insight_query_info = insight.get_query_info(dag, output_dir)

            start_time = time()

            files_directory = f"{output_dir}/files"
            os.makedirs(files_directory, exist_ok=True)

            # Execute pre_query if it exists
            if insight_query_info.pre_query:
                data = source.read_sql(insight_query_info.pre_query)

                # Use job_id for file naming instead of insight.name_hash()
                parquet_path = f"{files_directory}/{self.job_id}_{insight.name_hash()}.parquet"
                df = pl.DataFrame(data)
                df.write_parquet(parquet_path)

                files = [
                    {
                        "name_hash": f"{self.job_id}_{insight.name_hash()}",
                        "signed_data_file_url": parquet_path,
                    }
                ]
            else:
                # Use existing model files (no pre_query)
                models = insight.get_all_dependent_models(dag=dag)
                files = [
                    {
                        "name_hash": model.name_hash(),
                        "signed_data_file_url": f"{files_directory}/{model.name_hash()}.parquet",
                    }
                    for model in models
                    if os.path.exists(f"{files_directory}/{model.name_hash()}.parquet")
                ]

            # Store insight metadata - use job_id for filename
            insight_data = {
                "name": insight.name,
                "files": files,
                "query": insight_query_info.post_query,
                "props_mapping": insight_query_info.props_mapping,
                "static_props": insight_query_info.static_props,
                "split_key": insight_query_info.split_key,
                "type": insight_query_info.type,
            }

            insights_directory = f"{output_dir}/insights"
            os.makedirs(insights_directory, exist_ok=True)

            # Use job_id for metadata filename
            insight_path = f"{insights_directory}/{self.job_id}.json"
            with open(insight_path, "w") as f:
                json.dump(insight_data, f, indent=2)

            duration = time() - start_time
            Logger.instance().info(
                format_message_success(
                    item_type="Insight",
                    item_name=insight.name or "preview",
                    time=duration,
                    icon="📊",
                )
            )

            return JobResult(
                success=True,
                message=format_message_success(
                    item_type="Insight",
                    item_name=insight.name or "preview",
                    time=duration,
                    icon="📊",
                ),
                item_name=insight.name,
            )

        except Exception as e:
            Logger.instance().error(f"Insight preview execution failed: {e}", exc_info=True)
            return JobResult(
                success=False,
                message=format_message_failure(
                    item_type="Insight", item_name=insight.name or "preview", error=str(e), icon="📊"
                ),
                item_name=insight.name,
            )

    def _load_result_metadata(self, insight: Insight) -> Dict[str, Any]:
        """
        Load the generated insight metadata file.

        Returns:
            Insight metadata dict with file URLs converted for API serving
        """
        import json

        insight_path = f"{self.output_dir}/insights/{self.job_id}.json"

        if not os.path.exists(insight_path):
            raise FileNotFoundError(f"Preview result not found at {insight_path}")

        with open(insight_path, "r") as f:
            insight_data = json.load(f)

        # Convert file paths to API URLs (same as insight_jobs_views.py does)
        # The frontend expects URLs like /api/files/{hash}/
        for file_info in insight_data.get("files", []):
            file_path = file_info.get("signed_data_file_url", "")
            if file_path:
                # Extract the filename and use it as the URL
                filename = os.path.basename(file_path)
                name_hash = filename.replace(".parquet", "")
                file_info["signed_data_file_url"] = f"/api/files/{name_hash}/"

        return insight_data
