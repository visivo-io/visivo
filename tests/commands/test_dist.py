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


def _make_runnable_project(**overrides):
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
        **overrides,
    )


def _write_project(project, output_dir):
    """Put `project` on disk as a working dir `dist` can be pointed at."""
    create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    tmp = temp_yml_file(
        dict=json.loads(project.model_dump_json(exclude_none=True)), name=PROJECT_FILE_NAME
    )
    return os.path.dirname(tmp)


@pytest.fixture
def setup_project(output_dir):
    project = _make_runnable_project()
    return project, _write_project(project, output_dir)


@pytest.fixture
def setup_unnamed_project(output_dir):
    """A project with no `name:` — which the schema allows.

    `ProjectFactory` supplies `name = "project"`, so every fixture in this file
    had one and the optional case was never represented. That is why a
    KeyError on `project_json["name"]` shipped: the assertion covering it
    (`data["name"] == project.name`) was real, the fixture just never varied.
    """
    project = _make_runnable_project(name=None)
    assert project.name is None
    return project, _write_project(project, output_dir)


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
        # COUNTS, not just presence. These were read out of the dereferenced
        # dump, and `Serializer.dereference` deliberately empties the
        # top-level collections once everything is inlined into the dashboards
        # (`project.sources = []`, and the same for charts/models/insights/…).
        # So `source_count` was structurally guaranteed to be 0 in every bundle
        # ever built, for every project, no matter how many sources it had.
        assert data["dashboard_count"] == len(project.dashboards)
        assert data["source_count"] == len(project.sources)
        assert data["source_count"] > 0


def test_dist_works_for_a_project_with_no_name(setup_unnamed_project, output_dir, dist_dir):
    """`visivo dist` used to die with `KeyError: 'name'` on any project that
    didn't declare one.

    The envelope is dumped with `exclude_none=True`, so an optional field left
    unset is not `null` in the JSON — it is ABSENT. `project_json["name"]` was
    the one field here read without a default, so the whole command failed for
    a perfectly valid project. Reading it off the model, the way the server's
    `/api/project/` does, gives `None` instead: the viewer already falls back
    to "project" for display.
    """
    project, working_dir = setup_unnamed_project

    from visivo.commands.run import run

    run_result = runner.invoke(run, ["-w", working_dir, "-o", output_dir, "-s", "source"])
    assert run_result.exit_code == 0

    result = runner.invoke(
        dist,
        ["-w", working_dir, "-s", "source", "--output-dir", output_dir, "--dist-dir", dist_dir],
    )

    assert result.exit_code == 0, result.output
    with open(os.path.join(dist_dir, "data", "project.json")) as project_json:
        data = json.load(project_json)
    # Present and null, matching the server envelope — not missing, which would
    # move the same failure into the viewer.
    assert "name" in data
    assert data["name"] is None
    # The rest of the bundle is unaffected.
    assert data["dashboard_count"] == 1
    assert data["source_count"] == 1
    assert "defaults" in data["config"]


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
