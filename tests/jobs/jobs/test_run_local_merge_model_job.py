from tests.factories.model_factories import (
    LocalMergeModelFactory,
    CsvScriptModelFactory,
    ProjectFactory,
)
from tests.support.utils import temp_folder
from visivo.jobs.run_local_merge_job import job
import os


def test_job():
    output_dir = temp_folder()
    project = ProjectFactory()
    lmm_model = LocalMergeModelFactory()
    project.models.append(lmm_model)
    lmm_job = job(dag=project.dag(), local_merge_model=lmm_model, output_dir=output_dir)
    assert lmm_job.item == lmm_model


def test_job_with_csv_script_model():
    output_dir = temp_folder()
    project = ProjectFactory()

    csv_model = CsvScriptModelFactory(name="csv_model", args=["echo", "col1,col2\n1,2\n3,4"])

    local_merge_model = LocalMergeModelFactory(
        name="local_merge_model",
        sql="SELECT * FROM csv_model.model",
        models=[csv_model],
    )

    project.models.extend([csv_model, local_merge_model])

    lmm_job = job(dag=project.dag(), local_merge_model=local_merge_model, output_dir=output_dir)

    assert lmm_job.item == local_merge_model
    assert len(project.models) == 2


def test_job_with_nested_local_merge_model():
    output_dir = temp_folder()
    project = ProjectFactory()

    # Create a base CSV model
    csv_model = CsvScriptModelFactory(name="csv_model", args=["echo", "x,y\n1,2\n3,4\n5,6"])

    # Create inner local merge model that uses the CSV model
    inner_merge_model = LocalMergeModelFactory(
        name="inner_merge_model",
        sql="SELECT x, y FROM csv_model.model",
        models=[csv_model],
    )

    # Create outer local merge model that uses the inner merge model
    outer_merge_model = LocalMergeModelFactory(
        name="outer_merge_model",
        sql="SELECT x, y FROM inner_merge_model.model",
        models=[inner_merge_model],
    )

    project.models.extend([csv_model, inner_merge_model, outer_merge_model])

    # Create and run the job
    lmm_job = job(dag=project.dag(), local_merge_model=outer_merge_model, output_dir=output_dir)

    assert lmm_job.item == outer_merge_model
    assert len(project.models) == 3
