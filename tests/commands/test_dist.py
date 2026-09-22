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
    TableFactory,
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


def _project_with_a_model_backed_table(**overrides):
    """A dashboard whose item is a TABLE reading a model, not a chart.

    That shape is what makes the run materialise `models/<name>.parquet` — a
    model is built to data only when a dynamic insight or a table reads it —
    and it is the shape the models manifest exists for.
    """
    model = SqlModelFactory(name="model", source="ref(source)")
    table = TableFactory(name="table", data="${ref(model)}")
    item = ItemFactory(name="item", chart=None, table=table)
    row = RowFactory(name="row", items=[item])
    dashboard = DashboardFactory(name="dashboard", rows=[row])
    return ProjectFactory(models=[model], dashboards=[dashboard], **overrides)


@pytest.fixture
def setup_table_project(output_dir):
    project = _project_with_a_model_backed_table()
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
    # Traces are gone from the product — there is no Trace model, `Project` has
    # no `traces` field, and nothing writes `target/traces/`. dist kept a block
    # that globbed for them anyway, so every bundle shipped an empty
    # `data/traces/` and a `data/traces.json` of `[]`.
    assert not os.path.exists(os.path.join(os.getcwd(), dist_dir, "data", "traces"))
    assert not os.path.exists(os.path.join(os.getcwd(), dist_dir, "data", "traces.json"))

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


class TestCurrentArtifacts:
    """`visivo run` only ever ADDS artifacts — it never removes the ones a
    rename or a naming-scheme change orphaned.

    Before VIS-1128 each artifact was written as `alpha_hash(name).json`; now it
    is `<name>.json`. A project that predates the change has both on disk,
    carrying the same `"name"`. dist globbed the directory, so every object
    shipped TWICE in `insights.json` / `inputs.json` — and the stale copy's
    parquet URL used the old hashed filename, which nothing copies any more. A
    hosted bundle 404'd on its own data and DuckDB reported
    `Table with name m… does not exist`.
    """

    def _write(self, directory, filename, payload):
        # `temp_folder()` only names a path; nothing has created it yet.
        os.makedirs(directory, exist_ok=True)
        path = os.path.join(directory, filename)
        with open(path, "w") as f:
            json.dump(payload, f)
        return path

    def test_the_current_artifact_wins_over_the_hashed_one(self):
        from visivo.commands.dist_phase import _current_artifacts
        from visivo.models.base.named_model import alpha_hash

        directory = temp_folder()
        stale = self._write(
            directory,
            f"{alpha_hash('station-bubbles')}.json",
            {"name": "station-bubbles", "files": [{"signed_data_file_url": "/old.parquet"}]},
        )
        current = self._write(
            directory,
            "station-bubbles.json",
            {"name": "station-bubbles", "files": [{"signed_data_file_url": "/new.parquet"}]},
        )

        resolved = _current_artifacts([stale, current])

        assert len(resolved) == 1
        path, data = resolved[0]
        assert path == current
        assert data["files"][0]["signed_data_file_url"] == "/new.parquet"

    def test_order_on_disk_does_not_decide_it(self):
        """The glob's order is arbitrary; the answer must not be."""
        from visivo.commands.dist_phase import _current_artifacts
        from visivo.models.base.named_model import alpha_hash

        directory = temp_folder()
        stale = self._write(directory, f"{alpha_hash('x')}.json", {"name": "x"})
        current = self._write(directory, "x.json", {"name": "x"})

        for order in ([stale, current], [current, stale]):
            ((path, _),) = _current_artifacts(order)
            assert path == current

    def test_distinct_objects_are_all_kept(self):
        from visivo.commands.dist_phase import _current_artifacts

        directory = temp_folder()
        paths = [
            self._write(directory, "a.json", {"name": "a"}),
            self._write(directory, "b.json", {"name": "b"}),
        ]

        assert sorted(d["name"] for _p, d in _current_artifacts(paths)) == ["a", "b"]

    def test_an_object_with_only_a_stale_artifact_still_ships(self):
        """Dropping it would turn a cosmetic staleness into a missing insight."""
        from visivo.commands.dist_phase import _current_artifacts
        from visivo.models.base.named_model import alpha_hash

        directory = temp_folder()
        stale = self._write(directory, f"{alpha_hash('only')}.json", {"name": "only"})

        ((path, data),) = _current_artifacts([stale])
        assert path == stale
        assert data["name"] == "only"

    def test_unreadable_or_nameless_files_are_skipped_not_fatal(self):
        from visivo.commands.dist_phase import _current_artifacts

        directory = temp_folder()
        nameless = self._write(directory, "nameless.json", {"files": []})
        broken = os.path.join(directory, "broken.json")
        os.makedirs(directory, exist_ok=True)
        with open(broken, "w") as f:
            f.write("{not json")
        good = self._write(directory, "good.json", {"name": "good"})

        assert [d["name"] for _p, d in _current_artifacts([nameless, broken, good])] == ["good"]


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


class TestDeploymentRoot:
    """Where a dist is mounted, and how every URL in it is written.

    Each URL is built by pasting the root in front of an absolute path, so the
    root having a leading slash is the difference between an absolute URL and a
    relative one — and a relative ``src`` on the bundle means the page never
    loads at all.
    """

    def test_a_typed_root_becomes_absolute(self):
        from visivo.commands.dist_phase import normalize_deployment_root

        assert normalize_deployment_root("path/sub") == "/path/sub"

    def test_an_absolute_root_is_left_as_it_is(self):
        from visivo.commands.dist_phase import normalize_deployment_root

        assert normalize_deployment_root("/path/sub") == "/path/sub"

    def test_a_trailing_slash_goes(self):
        """Otherwise every URL gets a double slash where the two are joined."""
        from visivo.commands.dist_phase import normalize_deployment_root

        assert normalize_deployment_root("/path/sub/") == "/path/sub"

    def test_the_site_root_stays_empty(self):
        from visivo.commands.dist_phase import normalize_deployment_root

        assert normalize_deployment_root(None) == ""
        assert normalize_deployment_root("") == ""
        assert normalize_deployment_root("/") == ""


def test_dist_under_a_deployment_root_writes_absolute_urls(setup_project, output_dir, dist_dir):
    """A root typed without its leading slash used to produce
    ``src="path/sub/assets/index.js"``. Loaded from ``/path/sub/`` the browser
    asks for ``/path/sub/path/sub/assets/index.js``, 404s, and renders nothing —
    no error, because nothing ran.
    """
    _, working_dir = setup_project

    from visivo.commands.run import run

    assert runner.invoke(run, ["-w", working_dir, "-o", output_dir, "-s", "source"]).exit_code == 0
    result = runner.invoke(
        dist,
        [
            "-w",
            working_dir,
            "-s",
            "source",
            "--output-dir",
            output_dir,
            "--dist-dir",
            dist_dir,
            "-dr",
            "path/sub",
        ],
    )
    assert result.exit_code == 0

    with open(os.path.join(dist_dir, "index.html")) as f:
        html = f.read()

    assert "window.deploymentRoot = '/path/sub';" in html
    # Every asset the document pulls in, not just the ones we happened to check.
    for attribute in ('src="', 'href="'):
        for reference in _references(html, attribute):
            assert reference.startswith("/") or "://" in reference, (
                f'{attribute}{reference}" is relative — it resolves against the '
                "page's own directory, not the deployment root"
            )
    assert '"/path/sub/assets/' in html


def test_dist_under_a_deployment_root_writes_absolute_data_urls(
    setup_project, output_dir, dist_dir
):
    """The dashboards list and insight envelopes paste the same root in front of
    their own paths, so they go relative in exactly the same way."""
    _, working_dir = setup_project

    from visivo.commands.run import run

    assert runner.invoke(run, ["-w", working_dir, "-o", output_dir, "-s", "source"]).exit_code == 0
    assert (
        runner.invoke(
            dist,
            [
                "-w",
                working_dir,
                "-s",
                "source",
                "--output-dir",
                output_dir,
                "--dist-dir",
                dist_dir,
                "-dr",
                "path/sub",
            ],
        ).exit_code
        == 0
    )

    with open(os.path.join(dist_dir, "data", "dashboards.json")) as f:
        dashboards = json.load(f)["dashboards"]
    for dashboard in dashboards:
        url = dashboard.get("signed_thumbnail_file_url")
        assert url is None or url.startswith("/path/sub/"), url

    insights_dir = os.path.join(dist_dir, "data", "insights")
    for name in os.listdir(insights_dir):
        with open(os.path.join(insights_dir, name)) as f:
            insight = json.load(f)
        for file_ref in insight.get("files") or []:
            url = file_ref.get("signed_data_file_url")
            assert url is None or url.startswith("/path/sub/"), url


def _references(html, attribute):
    """Every ``attribute`` value in ``html`` — e.g. every ``src="…"``."""
    found = []
    index = html.find(attribute)
    while index != -1:
        start = index + len(attribute)
        end = html.find('"', start)
        found.append(html[start:end])
        index = html.find(attribute, end)
    return found


def test_dist_writes_a_models_manifest(setup_table_project, output_dir, dist_dir):
    """A table whose `data` is a model reads `modelJobs`, which this manifest
    feeds. Without it `fetchModelJobs` returns [] and the table renders "No data
    available" while the insight-backed charts beside it work — the parquets
    were already being copied, only the manifest naming them was missing."""
    _, working_dir = setup_table_project

    from visivo.commands.run import run
    from visivo.models.base.named_model import alpha_hash

    assert runner.invoke(run, ["-w", working_dir, "-o", output_dir, "-s", "source"]).exit_code == 0
    assert (
        runner.invoke(
            dist,
            ["-w", working_dir, "-s", "source", "--output-dir", output_dir, "--dist-dir", dist_dir],
        ).exit_code
        == 0
    )

    with open(os.path.join(dist_dir, "data", "models.json")) as f:
        models = json.load(f)

    assert models, "a project whose table reads a model should list it"
    for model in models:
        # name_hash is the DuckDB table the client registers the file as and
        # then selects from; without it every model registers as "undefined".
        assert model["name_hash"] == alpha_hash(model["name"])
        assert model["signed_data_file_url"].endswith(f"{model['name']}.parquet")
        # The file it names has to actually be in the bundle.
        assert os.path.exists(os.path.join(dist_dir, "data", "files", f"{model['name']}.parquet"))


def test_dist_models_manifest_follows_the_deployment_root(
    setup_table_project, output_dir, dist_dir
):
    _, working_dir = setup_table_project

    from visivo.commands.run import run

    assert runner.invoke(run, ["-w", working_dir, "-o", output_dir, "-s", "source"]).exit_code == 0
    assert (
        runner.invoke(
            dist,
            [
                "-w",
                working_dir,
                "-s",
                "source",
                "--output-dir",
                output_dir,
                "--dist-dir",
                dist_dir,
                "-dr",
                "path/sub",
            ],
        ).exit_code
        == 0
    )

    with open(os.path.join(dist_dir, "data", "models.json")) as f:
        models = json.load(f)

    assert models
    for model in models:
        assert model["signed_data_file_url"].startswith("/path/sub/")


def test_dist_writes_an_empty_models_manifest_when_there_are_none(
    setup_project, output_dir, dist_dir
):
    """An absent file 404s, which reads as a broken bundle. An empty list is
    the honest answer and matches insights.json."""
    _, working_dir = setup_project

    from visivo.commands.run import run

    assert runner.invoke(run, ["-w", working_dir, "-o", output_dir, "-s", "source"]).exit_code == 0
    assert (
        runner.invoke(
            dist,
            ["-w", working_dir, "-s", "source", "--output-dir", output_dir, "--dist-dir", dist_dir],
        ).exit_code
        == 0
    )

    with open(os.path.join(dist_dir, "data", "models.json")) as f:
        assert json.load(f) == []
