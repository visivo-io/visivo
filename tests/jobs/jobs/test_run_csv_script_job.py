from tests.factories.model_factories import (
    CsvScriptModelFactory,
    ProjectFactory,
)
from tests.support.utils import temp_folder
from visivo.jobs.run_csv_script_job import job


def test_job():
    output_dir = temp_folder()
    project = ProjectFactory()
    csv_model = CsvScriptModelFactory()
    project.models.append(csv_model)
    csv_job = job(
        output_dir=output_dir,
        csv_script_model=csv_model,
    )
    assert csv_job.item == csv_model


def test_csv_script_job_changed():
    output_dir = temp_folder()
    project = ProjectFactory()
    csv_model = CsvScriptModelFactory()
    csv_model.changed = False
    project.models.append(csv_model)
    csv_job = job(
        output_dir=output_dir,
        csv_script_model=csv_model,
    )
    assert csv_job.output_changed == False


def test_csv_script_job_not_changed():
    output_dir = temp_folder()
    project = ProjectFactory()
    csv_model = CsvScriptModelFactory()
    csv_model.changed = True
    project.models.append(csv_model)
    csv_job = job(
        output_dir=output_dir,
        csv_script_model=csv_model,
    )
    assert csv_job.output_changed == True
