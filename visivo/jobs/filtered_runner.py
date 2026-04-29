from visivo.jobs.dag_runner import DagRunner
from visivo.models.project import Project


class FilteredRunner:
    def __init__(
        self,
        project: Project,
        output_dir: str,
        threads: int = 8,
        soft_failure: bool = False,
        dag_filter: str = None,
        server_url: str = None,
        working_dir: str = None,
        run_id: str = None,
    ):
        self.project = project
        self.output_dir = output_dir
        self.threads = threads
        self.soft_failure = soft_failure
        self.dag_filter = dag_filter
        self.server_url = server_url
        self.working_dir = working_dir
        self.run_id = run_id
        self.project_dag = project.dag()
        # Aggregated per-job results across every filtered DAG iteration.
        # The preview executor reads these to surface the real upstream
        # error when a soft-failure run leaves an insight's JSON
        # unwritten (B13 follow-up).
        self.failed_job_results = []
        self.successful_job_results = []

    def run(self):
        for job_dag in self.project_dag.filter_dag(self.dag_filter):
            dag_runner = DagRunner(
                project=self.project,
                output_dir=self.output_dir,
                threads=self.threads,
                soft_failure=self.soft_failure,
                server_url=self.server_url,
                job_dag=job_dag,
                working_dir=self.working_dir,
                run_id=self.run_id,
            )
            dag_runner.run()
            self.failed_job_results.extend(dag_runner.failed_job_results)
            self.successful_job_results.extend(dag_runner.successful_job_results)
