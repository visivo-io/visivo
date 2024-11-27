from tests.factories.model_factories import DashboardFactory, ProjectFactory
from tests.support.utils import temp_folder
from visivo.query.jobs.run_trace_job import job


def test_job():
    output_dir = temp_folder()
    project = ProjectFactory()
    trace = project.dashboards[0].rows[0].items[0].chart.traces[0]
    trace_job = job(
        dag=project.dag(),
        output_dir=output_dir,
        trace=trace,
    )
    assert trace_job.output_changed == True


def test_jobs_changed():
    output_dir = temp_folder()
    project = ProjectFactory()
    trace = project.dashboards[0].rows[0].items[0].chart.traces[0]
    trace.changed = False
    trace_job = job(
        dag=project.dag(),
        trace=trace,
        output_dir=output_dir,
    )
    assert trace_job.output_changed == False
