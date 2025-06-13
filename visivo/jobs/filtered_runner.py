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
    ):
        self.project = project
        self.output_dir = output_dir
        self.threads = threads
        self.soft_failure = soft_failure
        self.dag_filter = dag_filter
        self.server_url = server_url
        self.project_dag = project.dag()

    def run(self):
        for job_dag in self.project_dag.filter_dag(self.dag_filter):
            dag_runner = DagRunner(
                project=self.project,
                output_dir=self.output_dir,
                threads=self.threads,
                soft_failure=self.soft_failure,
                server_url=self.server_url,
                job_dag=job_dag,
            )
            dag_runner.run()
