import os
import json
from visivo.commands.dist import dist
from visivo.parsers.file_names import PROJECT_FILE_NAME
from visivo.commands.utils import create_file_database
from click.testing import CliRunner
from tests.support.utils import temp_yml_file, temp_folder
from tests.factories.model_factories import (
    ProjectFactory,
    SqlModelFactory,
    InsightFactory,
    ChartFactory,
    ItemFactory,
    RowFactory,
    DashboardFactory,
)
import pytest

runner = CliRunner()


@pytest.fixture
def output_dir():
    return temp_folder()


@pytest.fixture
def dist_dir():
    return temp_folder()


def _make_runnable_project():
    """Create a project with an insight that references a model, suitable for running."""
    model = SqlModelFactory(name="model", source="ref(source)")
    insight = InsightFactory(name="insight", model=model)
    chart = ChartFactory(
        name="chart",
        insights=[insight],
    )
    item = ItemFactory(name="item", chart=chart)
    row = RowFactory(name="row", items=[item])
    dashboard = DashboardFactory(name="dashboard", rows=[row])
    return ProjectFactory(
        models=[model],
        dashboards=[dashboard],
    )


@pytest.fixture
def setup_project(output_dir):
    project = _make_runnable_project()

    create_file_database(url=project.sources[0].url(), output_dir=output_dir)

    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)
    return project, working_dir


def test_dist_creates_dist_folder(setup_project, output_dir, dist_dir):
    project, working_dir = setup_project

    from visivo.commands.run import run

    run_result = runner.invoke(run, ["-w", working_dir, "-o", output_dir, "-s", "source"])
    assert run_result.exit_code == 0

    result = runner.invoke(dist, ["--output-dir", output_dir, "--dist-dir", dist_dir])
    assert result.exit_code == 0
    assert "Created dist folder" in result.output

    assert os.path.exists(os.path.join(os.getcwd(), dist_dir, "data"))
    assert os.path.exists(os.path.join(os.getcwd(), dist_dir, "data", "error.json"))
    assert os.path.exists(os.path.join(os.getcwd(), dist_dir, "data", "project.json"))
    assert os.path.exists(os.path.join(os.getcwd(), dist_dir, "data", "dashboards"))
    assert os.path.exists(os.path.join(os.getcwd(), dist_dir, "data", "insights"))

    with open(os.path.join(dist_dir, "data", "project.json")) as project_json:
        data = json.load(project_json)
        assert "id" in data
        assert "created_at" in data
        assert "project_json" in data


def test_dist_errors_without_data(setup_project, output_dir, dist_dir):
    project, working_dir = setup_project

    result = runner.invoke(dist, ["--output-dir", output_dir, "--dist-dir", dist_dir])

    assert "Error creating dist" in result.output
    assert "Try running `visivo run`" in result.output


def test_dist_errors_with_invalid_working_dir(output_dir, dist_dir):
    result = runner.invoke(dist, ["--output-dir", "nonexistent_dir", "--dist-dir", dist_dir])

    assert "Error creating dist" in result.output


def test_dist_errors_with_invalid_project_file(output_dir, dist_dir):
    working_dir = temp_folder()

    result = runner.invoke(dist, ["--output-dir", output_dir, "--dist-dir", dist_dir])

    assert "Error creating dist" in result.output
