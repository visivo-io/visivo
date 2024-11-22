from tests.factories.model_factories import DashboardFactory, ProjectFactory
from tests.support.utils import temp_folder
from visivo.query.jobs.run_trace_job import job


def test_jobs():
    output_dir = temp_folder()
    project = ProjectFactory()
    trace_job = job(
        dag=project.dag(),
        output_dir=output_dir,
        name_filter=None,
    )
    assert trace_job.output_changed == True


def test_jobs_with_name_filter():
    output_dir = temp_folder()
    project = ProjectFactory()
    trace = project.dashboards[0].rows[0].items[0].chart.traces[0]
    additional_dashboard = DashboardFactory(name="Other Dashboard")
    additional_dashboard.rows[0].items[0].chart.name = "Additional Chart"
    additional_dashboard.rows[0].items[0].chart.traces[0].name = "Additional Trace"
    additional_dashboard.rows[0].items[0].chart.traces[0].model.name = "Other Model"
    project.dashboards.append(additional_dashboard)

    trace_job = job(
        dag=project.dag(),
        output_dir=output_dir,
        name_filter="dashboard",
    )
    assert trace_job.item == trace
    assert trace_job.output_changed == True


def test_jobs_changed():
    output_dir = temp_folder()
    project = ProjectFactory()
    trace = project.dashboards[0].rows[0].items[0].chart.traces[0]
    trace.changed = False
    trace_job = job(
        dag=project.dag(),
        project=project,
        output_dir=output_dir,
        name_filter=None,
    )
    assert trace_job.output_changed == False
