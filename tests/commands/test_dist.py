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

    result = runner.invoke(
        dist,
        ["-w", working_dir, "-s", "source", "--output-dir", output_dir, "--dist-dir", dist_dir],
    )
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
        # The bundle ships the same envelope the server serves, not the
        # whole dereferenced project tree.
        assert "project_json" not in data
        assert data["name"] == project.name
        assert "defaults" in data["config"]
        assert "dashboard_count" in data
        assert "source_count" in data


def test_dist_writes_a_dashboards_list_with_layout(setup_project, output_dir, dist_dir):
    """The bundle must carry the dashboards LIST, with each config's layout.

    `/api/project/` stopped shipping the dereferenced project — resource lists
    moved to their own endpoints — and dist was never given an equivalent. The
    viewer's `dashboardsList` fetch had nothing to resolve to in dist mode, so
    every static build rendered "No dashboards found". The per-dashboard files
    existed but carried only id/name/thumbnail: a name with no layout.
    """
    project, working_dir = setup_project

    from visivo.commands.run import run

    assert runner.invoke(run, ["-w", working_dir, "-o", output_dir, "-s", "source"]).exit_code == 0
    result = runner.invoke(
        dist,
        ["-w", working_dir, "-s", "source", "--output-dir", output_dir, "--dist-dir", dist_dir],
    )
    assert result.exit_code == 0

    list_path = os.path.join(dist_dir, "data", "dashboards.json")
    assert os.path.exists(list_path), "dist wrote no dashboards list"

    with open(list_path) as f:
        payload = json.load(f)

    # Same envelope the server's `/api/dashboards/` returns, so the viewer
    # reads one shape in both modes.
    assert "dashboards" in payload
    names = [d["name"] for d in payload["dashboards"]]
    assert names == [project.dashboards[0].name]

    entry = payload["dashboards"][0]
    assert set(["id", "name", "status", "config"]).issubset(entry.keys())
    assert entry["status"] == "published"
    # The load-bearing part: rows/items, not just a name.
    assert entry["config"]["rows"], "dashboard config carries no rows"
    assert entry["config"]["rows"][0]["items"], "dashboard row carries no items"

    # The per-dashboard detail file stays in sync with its list entry.
    detail_path = os.path.join(dist_dir, "data", "dashboards", f"{entry['name']}.json")
    with open(detail_path) as f:
        assert json.load(f)["config"] == entry["config"]


def test_dist_project_created_at_is_a_string(setup_project, output_dir, dist_dir):
    """A stray trailing comma made `created_at` a 1-tuple, so it serialized as
    `["<iso>"]` — an array where every consumer expects a timestamp."""
    project, working_dir = setup_project

    from visivo.commands.run import run

    assert runner.invoke(run, ["-w", working_dir, "-o", output_dir, "-s", "source"]).exit_code == 0
    runner.invoke(
        dist,
        ["-w", working_dir, "-s", "source", "--output-dir", output_dir, "--dist-dir", dist_dir],
    )

    with open(os.path.join(dist_dir, "data", "project.json")) as f:
        assert isinstance(json.load(f)["created_at"], str)


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
