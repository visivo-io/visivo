from tests.factories.model_factories import CsvScriptModelFactory, ProjectFactory
from tests.support.utils import temp_folder
from visivo.query.jobs.run_csv_script_job import jobs


def test_jobs():
    output_dir = temp_folder()
    project = ProjectFactory()
    csv_model = CsvScriptModelFactory()
    project.models.append(csv_model)
    csv_jobs = jobs(
        dag=project.dag(), project=project, output_dir=output_dir, name_filter=None
    )
    assert len(csv_jobs) == 1
