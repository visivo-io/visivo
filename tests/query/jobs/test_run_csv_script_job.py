from tests.factories.model_factories import (
    CsvScriptModelFactory,
    DashboardFactory,
    ProjectFactory,
)
from tests.support.utils import temp_folder
from visivo.models.base.parent_model import ParentModel
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


def test_jobs_with_name_filter():
    output_dir = temp_folder()
    project = ProjectFactory()
    csv_model = CsvScriptModelFactory()
    project.dashboards[0].rows[0].items[0].chart.traces[0].model = csv_model
    additional_csv_model = CsvScriptModelFactory(name="Additional Model")
    additional_dashboard = DashboardFactory(name="Other Dashboard")
    additional_dashboard.rows[0].items[0].chart.name = "Additional Chart"
    additional_dashboard.rows[0].items[0].chart.traces[0].name = "Additional Trace"
    additional_dashboard.rows[0].items[0].chart.traces[0].model = additional_csv_model
    project.dashboards.append(additional_dashboard)

    csv_jobs = jobs(
        dag=project.dag(),
        project=project,
        output_dir=output_dir,
        name_filter="dashboard",
    )
    assert len(csv_jobs) == 1
    assert csv_jobs[0].item == csv_model
