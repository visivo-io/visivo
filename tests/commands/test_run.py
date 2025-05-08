import os
import json
from visivo.commands.run import run
from visivo.parsers.file_names import PROJECT_FILE_NAME
from visivo.commands.utils import create_file_database
from tests.support.utils import temp_yml_file
from click.testing import CliRunner
from tests.factories.model_factories import (
    DefaultsFactory,
    ProjectFactory,
    SourceFactory,
    TraceFactory,
)
from tests.support.utils import temp_folder
from visivo.server.hot_reload_server import HotReloadServer

runner = CliRunner()


def get_test_port():
    """Get an available port for testing"""
    return HotReloadServer.find_available_port()


def test_run():
    output_dir = temp_folder()
    project = ProjectFactory()

    create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)

    port = get_test_port()
    response = runner.invoke(
        run, ["-w", working_dir, "-o", output_dir, "-s", "source", "-p", str(port)]
    )

    assert "Running project across 8 threads" in response.output
    assert response.exit_code == 0


def test_run_with_threads():
    output_dir = temp_folder()
    project = ProjectFactory()

    create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)

    port = get_test_port()
    response = runner.invoke(
        run, ["-w", working_dir, "-o", output_dir, "-s", "source", "-th", "3", "-p", str(port)]
    )

    assert "Running project across 3 threads" in response.output
    assert response.exit_code == 0


def test_run_with_model_ref():
    output_dir = temp_folder()
    project = ProjectFactory(model_ref=True)

    create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)

    port = get_test_port()
    response = runner.invoke(
        run, ["-w", working_dir, "-o", output_dir, "-s", "source", "-p", str(port)]
    )

    assert "Running project" in response.output
    assert response.exit_code == 0


def test_run_by_with_passing_new_defaults():
    output_dir = temp_folder()

    project = ProjectFactory(model_ref=True)
    project.defaults = DefaultsFactory(source_name=project.sources[0].name, threads=3)

    project.models[0].source = None
    alternate_source = SourceFactory()
    alternate_source.name = "alternate-source"
    project.sources.append(alternate_source)

    create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)

    port = get_test_port()
    response = runner.invoke(
        run, ["-w", working_dir, "-o", output_dir, "-s", "alternate-source", "-p", str(port)]
    )
    trace = project.dashboards[0].rows[0].items[0].chart.traces[0]

    assert "alternate-source" in response.output
    assert "Running project across 3 threads" in response.output
    assert response.exit_code == 0
    assert os.path.exists(f"{output_dir}/traces/{trace.name}/query.sql")
    with open(f"{output_dir}/traces/{trace.name}/query.sql") as f:
        trace_sql = f.read()
    assert "-- source: alternate-source" == trace_sql.split(f"\n")[-1]
