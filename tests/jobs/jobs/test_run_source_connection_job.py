from tests.factories.model_factories import SourceFactory
from tests.support.utils import temp_folder
from visivo.commands.utils import create_file_database
from visivo.jobs.run_source_connection_job import job, action


def test_job_changed():
    source = SourceFactory()
    trace_job = job(source=source)
    assert trace_job.output_changed == True


def test_success_action():
    output_dir = temp_folder()
    source = SourceFactory(database=f"{output_dir}/test.sqlite")

    create_file_database(url=source.url(), output_dir=output_dir)

    job_result = action(source)
    assert job_result.success == True


def test_failure_action():
    source = SourceFactory(database=f"http://localhost:8080/test.sqlite")

    job_result = action(source)
    assert job_result.success == False
    assert "Failed connection for source" in job_result.message
    assert "database: http://localhost:8080/test.sqlite." in job_result.message
