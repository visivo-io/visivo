from tests.factories.model_factories import ProjectFactory
from tests.support.utils import temp_folder
from visivo.query.jobs.run_trace_job import jobs


def test_jobs():
    output_dir = temp_folder()
    project = ProjectFactory()
    csv_jobs = jobs(dag=project.dag(), project=project, output_dir=output_dir)
    assert len(csv_jobs) == 1
