"""GET-then-POST of every object in the real integration fixture must be a no-op:
no status moves, no YAML bytes change, and every config handed out re-validates."""

import json
import os
import shutil
from urllib.parse import quote

import pytest

from visivo.commands.parse_project_phase import parse_project_phase
from visivo.models.dashboards.template_dashboard import TemplateDashboard
from visivo.models.theme import Theme
from visivo.server.flask_app import FlaskApp
from visivo.server.managers.object_manager import ObjectStatus

SOURCE_PROJECT_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "test-projects", "integration")
)

# (manager attribute, the URL segment its CRUD endpoints live under)
MANAGER_SEGMENTS = [
    ("source_manager", "sources"),
    ("model_manager", "models"),
    ("dimension_manager", "dimensions"),
    ("metric_manager", "metrics"),
    ("relation_manager", "relations"),
    ("insight_manager", "insights"),
    ("input_manager", "inputs"),
    ("markdown_manager", "markdowns"),
    ("chart_manager", "charts"),
    ("table_manager", "tables"),
    ("dashboard_manager", "dashboards"),
]


def _yaml_files(directory):
    """Every project YAML in the fixture, relative to its root."""
    found = []
    for root, dirs, files in os.walk(directory):
        dirs[:] = [d for d in dirs if d not in ("target", ".visivo_cache")]
        for filename in files:
            if filename.endswith((".yml", ".yaml")):
                found.append(os.path.relpath(os.path.join(root, filename), directory))
    return sorted(found)


def _location_bookkeeping(value, trail=""):
    """Every parser-stamped ``path``/``file_path`` in ``value`` as (trail, value).

    Matches ``path`` by its ``project.`` prefix so a Plotly ``layout.shapes[].path`` is not caught.
    """
    found = []
    if isinstance(value, dict):
        for key, sub in value.items():
            if key == "file_path" and isinstance(sub, str):
                found.append((f"{trail}.{key}", sub))
            elif key == "path" and isinstance(sub, str) and sub.startswith("project."):
                found.append((f"{trail}.{key}", sub))
            else:
                found.extend(_location_bookkeeping(sub, f"{trail}.{key}"))
    elif isinstance(value, list):
        for index, sub in enumerate(value):
            found.extend(_location_bookkeeping(sub, f"{trail}[{index}]"))
    return found


def _build_app(project_dir):
    """The real server object graph, loaded from a project directory."""
    output_dir = os.path.join(project_dir, "target")
    cwd_before = os.getcwd()
    os.chdir(project_dir)
    try:
        project = parse_project_phase(
            working_dir=project_dir,
            output_dir=output_dir,
            default_source=None,
            dbt_profile=None,
            dbt_target=None,
        )
    finally:
        os.chdir(cwd_before)

    app = FlaskApp(output_dir, project, working_dir=project_dir)
    app.app.config["TESTING"] = True
    return app


def _copy_fixture(destination_root):
    """A private copy of the integration fixture, so a regression cannot dirty the tracked tree."""
    destination = os.path.join(str(destination_root), "integration")
    shutil.copytree(
        SOURCE_PROJECT_DIR,
        destination,
        ignore=shutil.ignore_patterns("target"),
    )
    return destination


@pytest.fixture(scope="module")
def project_copy(tmp_path_factory):
    return _copy_fixture(tmp_path_factory.mktemp("round_trip"))


@pytest.fixture(scope="module")
def flask_app(project_copy):
    return _build_app(project_copy)


@pytest.fixture
def fresh_project(tmp_path):
    """A per-test copy, for the tests that actually write YAML."""
    return _copy_fixture(tmp_path)


@pytest.fixture
def fresh_app(fresh_project):
    return _build_app(fresh_project)


def _published_objects(flask_app):
    """(manager, segment, name, object) for every published object in the project."""
    for manager_attr, segment in MANAGER_SEGMENTS:
        manager = getattr(flask_app, manager_attr)
        for name, obj in list(manager.published_objects.items()):
            yield manager, segment, name, obj


def _round_trip_everything(app):
    """GET every published object and POST the identical body back; return what was refused."""
    client = app.app.test_client()
    refused = []
    for _, segment, name, obj in _published_objects(app):
        # Template dashboards are read-only in the editor.
        if isinstance(obj, TemplateDashboard):
            continue
        url = f"/api/{segment}/{quote(name, safe='')}/"
        response = client.get(url)
        if response.status_code != 200:
            refused.append((segment, name, response.status_code, response.data))
            continue
        body = json.loads(response.data)
        config = dict(body["config"])
        # The viewer posts a metric/dimension's model scope back alongside its config.
        if body.get("parentModel"):
            config["parentModel"] = body["parentModel"]
        saved = client.post(url, json=config)
        if saved.status_code not in (200, 201):
            refused.append((segment, name, saved.status_code, saved.data))
    return refused


@pytest.fixture(scope="module")
def round_tripped_app(flask_app):
    """The same app with every published object re-saved through the real API."""
    refused = _round_trip_everything(flask_app)
    assert refused == [], f"the server refused its own config: {refused[:5]}"
    return flask_app


def test_the_fixture_actually_covers_the_interesting_types(flask_app):
    """Without these, half of this file silently stops testing anything."""
    assert len(flask_app.input_manager.published_objects) > 0, "fixture has no inputs"
    assert len(flask_app.model_manager.published_objects) > 0, "fixture has no models"
    assert len(flask_app.dashboard_manager.published_objects) > 0, "fixture has no dashboards"
    assert flask_app.project.defaults is not None, "fixture has no defaults block"

    scoped = [
        name
        for name, metric in flask_app.metric_manager.published_objects.items()
        if getattr(metric, "_parent_name", None)
    ]
    assert scoped, "fixture has no model-scoped metrics"

    top_level = {chart.name for chart in (flask_app.project.charts or [])}
    inline = set(flask_app.chart_manager.published_objects) - top_level
    assert inline, "fixture has no dashboard-inline charts"

    composite = flask_app.dashboard_manager.published_objects["simple-dashboard"]
    assert any(
        getattr(row, "path", None) for row in composite.rows
    ), "fixture's dashboards carry no nested path bookkeeping to strip"


def test_every_published_config_is_a_valid_config(flask_app):
    rejected = []
    for manager, _, name, obj in _published_objects(flask_app):
        config = manager._serialize_object(name, obj, ObjectStatus.PUBLISHED)["config"]
        try:
            manager.validate_object(config)
        except Exception as error:
            rejected.append(f"{type(manager).__name__}/{name}: {type(error).__name__}: {error}")

    assert rejected == [], "configs the project cannot parse back:\n" + "\n".join(rejected[:10])


def test_no_config_the_api_hands_out_carries_location_bookkeeping(flask_app):
    """``model_dump(exclude=...)`` is top-level only; dashboards carry ``path`` on every row/item."""
    leaked = []
    client = flask_app.app.test_client()
    for _, segment, name, _ in _published_objects(flask_app):
        response = client.get(f"/api/{segment}/{quote(name, safe='')}/")
        assert response.status_code == 200, (segment, name, response.data)
        for trail, value in _location_bookkeeping(json.loads(response.data)["config"]):
            leaked.append(f"{segment}/{name}{trail} = {value}")

    assert leaked == [], "location bookkeeping in configs handed to the client:\n" + "\n".join(
        leaked[:10]
    )


def test_a_plotly_shape_path_is_not_mistaken_for_bookkeeping(flask_app):
    manager = flask_app.chart_manager
    chart = manager.validate_object(
        {
            "name": "shape-carrying-chart",
            "layout": {"shapes": [{"type": "path", "path": "M 0 0 L 10 10 Z"}]},
        }
    )
    chart.path = "project.charts[99]"
    chart.file_path = "/abs/machine/local/charts.visivo.yml"

    config = manager._serialize_object("shape-carrying-chart", chart, ObjectStatus.PUBLISHED)[
        "config"
    ]

    assert "path" not in config and "file_path" not in config
    assert config["layout"]["shapes"][0]["path"] == "M 0 0 L 10 10 Z"


def test_round_trip_reports_no_modifications(round_tripped_app):
    wrong = []
    for manager in round_tripped_app._all_object_managers():
        for name in list(manager.cached_objects.keys()):
            status = manager.get_status(name)
            if status != ObjectStatus.PUBLISHED:
                wrong.append(f"{type(manager).__name__}/{name}: {status}")

    assert wrong == [], "objects reported changed by a no-op round trip:\n" + "\n".join(wrong[:10])
    assert round_tripped_app.has_draft_changes() is False


def test_round_trip_leaves_the_changes_endpoint_empty(round_tripped_app):
    client = round_tripped_app.app.test_client()
    response = client.get("/api/projects/local/changes/")

    assert response.status_code == 200
    body = json.loads(response.data)
    assert body["to_publish"] == []
    assert body["to_remove"] == []
    assert body["has_changes"] is False


def test_saving_defaults_unchanged_is_not_a_pending_change(fresh_app):
    client = fresh_app.app.test_client()
    published = json.loads(client.get("/api/defaults/").data)

    assert client.post("/api/defaults/", json=published).status_code == 200

    changes = json.loads(client.get("/api/projects/local/changes/").data)
    assert changes["to_publish"] == []
    assert changes["has_changes"] is False
    assert fresh_app.has_draft_changes() is False
    assert json.loads(client.get("/api/commit/pending/").data)["pending"] == []
    assert json.loads(client.get("/api/commit/status/").data)["has_unpublished_changes"] is False


def test_saving_theme_unchanged_is_not_a_pending_change(fresh_app):
    fresh_app.project.theme = Theme(mode="dark")
    client = fresh_app.app.test_client()
    published = json.loads(client.get("/api/theme/").data)

    assert client.post("/api/theme/", json=published).status_code == 200
    assert fresh_app.has_draft_changes() is False
    assert json.loads(client.get("/api/commit/pending/").data)["pending"] == []

    assert client.post("/api/theme/", json=dict(published, mode="light")).status_code == 200
    assert fresh_app.has_draft_changes() is True
    pending = json.loads(client.get("/api/commit/pending/").data)["pending"]
    assert pending == [{"name": "theme", "type": "theme", "status": "modified"}]


def test_re_parenting_a_metric_is_a_pending_change(fresh_app):
    """``_parent_name`` is a PrivateAttr ``model_dump`` omits, but it picks the metric's YAML file."""
    client = fresh_app.app.test_client()
    name, metric = next(
        (name, metric)
        for name, metric in fresh_app.metric_manager.published_objects.items()
        if getattr(metric, "_parent_name", None)
    )
    new_parent = next(
        model for model in fresh_app.model_manager.published_objects if model != metric._parent_name
    )

    body = json.loads(client.get(f"/api/metrics/{quote(name, safe='')}/").data)
    config = dict(body["config"])
    assert body["parentModel"] == metric._parent_name
    config["parentModel"] = new_parent

    response = client.post(f"/api/metrics/{quote(name, safe='')}/", json=config)

    assert response.status_code == 200
    assert json.loads(response.data)["status"] == "modified"
    assert fresh_app.metric_manager.get_status(name) == ObjectStatus.MODIFIED
    changes = json.loads(client.get("/api/projects/local/changes/").data)
    assert {"name": name, "type": "metric", "status": "modified"} in changes["to_publish"]


def test_round_trip_does_not_dirty_the_yaml(round_tripped_app, project_copy):
    tracked = _yaml_files(project_copy)
    assert tracked, "no YAML files found to compare"
    before = {path: open(os.path.join(project_copy, path), "rb").read() for path in tracked}

    client = round_tripped_app.app.test_client()
    response = client.post("/api/commit/", json={})

    assert response.status_code == 200, response.data
    assert json.loads(response.data)["published_count"] == 0

    changed = [
        path
        for path in tracked
        if open(os.path.join(project_copy, path), "rb").read() != before[path]
    ]
    assert changed == [], f"a no-op commit rewrote {changed}"
    assert _yaml_files(project_copy) == tracked, "a no-op commit added or removed a YAML file"


def test_a_real_edit_writes_the_edit_and_no_bookkeeping(fresh_app, fresh_project):
    """A no-op commit never reaches ``ProjectWriter``, so commit one real edit too."""
    client = fresh_app.app.test_client()
    project_yaml = os.path.join(fresh_project, "project.visivo.yml")
    before = open(project_yaml).read()

    config = json.loads(client.get("/api/dashboards/simple-dashboard/").data)["config"]
    config["rows"][0]["height"] = "large"
    assert client.post("/api/dashboards/simple-dashboard/", json=config).status_code == 200

    response = client.post("/api/commit/", json={})
    assert response.status_code == 200, response.data
    assert json.loads(response.data)["published_count"] == 1

    after = open(project_yaml).read()
    added = [
        line
        for line in after.splitlines()
        if line not in before.splitlines() and line.strip().startswith(("path:", "file_path:"))
    ]
    assert added == [], "a commit wrote location bookkeeping into tracked YAML:\n" + "\n".join(
        added[:10]
    )
    assert "height: large" in after, "the edit itself was not written"


def test_a_defaults_edit_is_actually_written(fresh_app, fresh_project):
    client = fresh_app.app.test_client()
    project_yaml = os.path.join(fresh_project, "project.visivo.yml")
    published = json.loads(client.get("/api/defaults/").data)
    edited = dict(published, threads=published.get("threads", 8) + 3)

    assert client.post("/api/defaults/", json=edited).status_code == 200
    changes = json.loads(client.get("/api/projects/local/changes/").data)
    assert {"name": "defaults", "type": "defaults", "status": "modified"} in changes["to_publish"]

    response = client.post("/api/commit/", json={})
    assert response.status_code == 200, response.data
    assert json.loads(response.data)["published_count"] == 1

    reparsed = _build_app(fresh_project)
    assert reparsed.project.defaults.threads == edited["threads"]


def test_editing_a_dashboard_inline_chart_can_be_committed(fresh_app, fresh_project):
    client = fresh_app.app.test_client()
    top_level = {chart.name for chart in (fresh_app.project.charts or [])}
    name = next(name for name in fresh_app.chart_manager.published_objects if name not in top_level)

    config = json.loads(client.get(f"/api/charts/{quote(name, safe='')}/").data)["config"]
    config["layout"] = dict(config.get("layout") or {}, title={"text": "Committed inline"})
    assert client.post(f"/api/charts/{quote(name, safe='')}/", json=config).status_code == 200

    response = client.post("/api/commit/", json={})

    assert response.status_code == 200, response.data
    assert "Committed inline" in open(os.path.join(fresh_project, "project.visivo.yml")).read()


def _changed_lines(before, after):
    import difflib

    return [
        line
        for line in difflib.unified_diff(before.splitlines(), after.splitlines(), lineterm="", n=0)
        if line[:1] in "+-" and not line.startswith(("+++", "---"))
    ]


def _edit_and_commit(app, project_dir, segment, name, edit):
    client = app.app.test_client()
    project_yaml = os.path.join(project_dir, "project.visivo.yml")
    before = open(project_yaml).read()

    config = json.loads(client.get(f"/api/{segment}/{name}/").data)["config"]
    edit(config)
    assert client.post(f"/api/{segment}/{name}/", json=config).status_code == 200
    response = client.post("/api/commit/", json={})
    assert response.status_code == 200, response.data
    assert json.loads(response.data)["published_count"] == 1

    return _changed_lines(before, open(project_yaml).read())


def test_a_one_field_dashboard_commit_touches_only_that_field(fresh_app, fresh_project):
    changed = _edit_and_commit(
        fresh_app,
        fresh_project,
        "dashboards",
        "simple-dashboard",
        lambda config: config["rows"][0].__setitem__("height", "large"),
    )
    assert sorted(line[0] for line in changed) == ["+", "-"], "\n".join(changed)
    assert all("height" in line for line in changed), "\n".join(changed)


def test_a_one_field_source_commit_touches_only_that_field(fresh_app, fresh_project):
    changed = _edit_and_commit(
        fresh_app,
        fresh_project,
        "sources",
        "local-postgres",
        lambda config: config.__setitem__("port", 5435),
    )
    assert changed == ["-    port: 5434", "+    port: 5435"]


def test_a_one_field_input_commit_leaves_the_expression_alone(fresh_app, fresh_project):
    changed = _edit_and_commit(
        fresh_app,
        fresh_project,
        "inputs",
        "min_x_value",
        lambda config: config.__setitem__("label", "Lowest X"),
    )
    assert changed == ['-    label: "Min X Value (Query Dropdown)"', '+    label: "Lowest X"']
