from tests.factories.model_factories import (
    LocalMergeModelFactory,
    ProjectFactory,
)
from tests.support.utils import temp_folder
from visivo.query.jobs.run_local_merge_job import job


def test_jobs():
    output_dir = temp_folder()
    project = ProjectFactory()
    lmm_model = LocalMergeModelFactory()
    project.models.append(lmm_model)
    lmm_job = job(dag=project.dag(), local_merge_model=lmm_model, output_dir=output_dir)
    assert lmm_job.item == lmm_model
