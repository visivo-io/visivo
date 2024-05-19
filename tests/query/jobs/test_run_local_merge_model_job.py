from tests.factories.model_factories import (
    CsvScriptModelFactory,
    DashboardFactory,
    LocalMergeModelFactory,
    ProjectFactory,
)
from tests.support.utils import temp_folder
from visivo.query.jobs.run_local_merge_job import jobs


def test_jobs():
    output_dir = temp_folder()
    project = ProjectFactory()
    lmm_model = LocalMergeModelFactory()
    project.models.append(lmm_model)
    lmm_jobs = jobs(
        dag=project.dag(), project=project, output_dir=output_dir, name_filter=None
    )
    assert len(lmm_jobs) == 1


def test_jobs_with_name_filter():
    output_dir = temp_folder()
    project = ProjectFactory()
    lmm_model = LocalMergeModelFactory()
    project.dashboards[0].rows[0].items[0].chart.traces[0].model = lmm_model
    additional_csv_model = CsvScriptModelFactory(name="Additional Model")
    additional_dashboard = DashboardFactory(name="Other Dashboard")
    additional_dashboard.rows[0].items[0].chart.name = "Additional Chart"
    additional_dashboard.rows[0].items[0].chart.traces[0].name = "Additional Trace"
    additional_dashboard.rows[0].items[0].chart.traces[0].model = additional_csv_model
    project.dashboards.append(additional_dashboard)

    lmm_jobs = jobs(
        dag=project.dag(),
        project=project,
        output_dir=output_dir,
        name_filter="dashboard",
    )
    assert len(lmm_jobs) == 1
    assert lmm_jobs[0].item == lmm_model


def test_jobs_with_ref():
    output_dir = temp_folder()
    project = ProjectFactory()
    lmm_model = LocalMergeModelFactory()
    project.dashboards[0].rows[0].items[0].chart.traces[0].model = lmm_model
    project.models = [lmm_model]
    lmm_model.models = [f"ref({lmm_model.models[0].name})"]

    lmm_jobs = jobs(
        dag=project.dag(), project=project, output_dir=output_dir, name_filter=None
    )
    assert len(lmm_jobs) == 1
    assert lmm_jobs[0].item == lmm_model
