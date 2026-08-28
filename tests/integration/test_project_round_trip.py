"""Regression guard for honest object status (M12 / M25).

The editor's whole model of "what changed" rests on one property that nothing
tested: **loading a project, handing its config to a client, and taking that
exact config back must be a no-op.** It was not.

Three independent leaks broke it, and they are asserted here against the REAL
``test-projects/integration`` fixture rather than a synthetic model, because
each only shows up on object types a hand-built fixture is unlikely to include
(inputs, dashboard-inline charts) or on fields only the parser populates
(``path`` on every nested row/item/chart):

1. ``objects_equal`` compared ``path``/``file_path`` — location bookkeeping the
   parser stamps on and every API serializer strips off. A round trip could
   never restore them, so every object in the project reported MODIFIED
   forever, and a Commit rewrote all of them.
2. The strip was applied only to the TOP level of the dump, so for a composite
   (a dashboard, whose rows / items / inline charts each carry their own
   ``path``) all three symptoms survived one level down: bookkeeping in the
   config the API hands out, a genuinely clean config still reported changed,
   and a commit writing ``path:`` / absolute ``file_path:`` lines into tracked
   YAML.
3. ``SingleSelectInput``/``MultiSelectInput`` injected ``name_hash`` (and
   ``structure``) into every ``model_dump``. The parser's ``extra='forbid'``
   rejects both, so the serialized form was not a config at all: committing an
   input wrote YAML the very next parse refused.

Together they are the mechanism behind the field report of a test run leaving
``test-projects/integration/project.visivo.yml`` dirty with ~190 lines of
injected ``name_hash``. The write tests at the bottom are the direct guard: a
no-op round trip leaves every YAML byte-identical, AND a real edit writes only
the edit.

The round trip runs over real HTTP (``GET`` then ``POST`` the same endpoints
the viewer calls) rather than by reaching into the managers, so #640's save
gates and the sibling keys the GET responses attach — ``parentModel``, which
carries a metric's model scope — are exercised as the client exercises them.
"""

import json
import os
import shutil
from urllib.parse import quote

import pytest

from visivo.commands.parse_project_phase import parse_project_phase
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
    """Every location-bookkeeping key in ``value``, at any depth, as (trail, value).

    Deliberately NOT "every key named path": ``layout.shapes[].path`` is a real
    Plotly property (the SVG path of a drawn shape) and stripping it would be a
    worse bug than the one under test. Bookkeeping ``path`` values are the
    parser's dotted object addresses (``project.dashboards[3].rows[0]``), so
    they are recognised by shape and a user's SVG path can never be mistaken
    for one.
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
    """A private copy of the integration fixture.

    Copied rather than used in place so that a regression here can never dirty
    the tracked working tree — which is exactly the failure this file guards.
    """
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
    """GET every published object and POST the identical body back, over HTTP.

    Returns the list of (segment, name, status_code, body) for anything the
    server refused, so a caller can assert the round trip itself was accepted
    before asking what the server then believes.
    """
    client = app.app.test_client()
    refused = []
    for _, segment, name, _ in _published_objects(app):
        url = f"/api/{segment}/{quote(name, safe='')}/"
        response = client.get(url)
        if response.status_code != 200:
            refused.append((segment, name, response.status_code, response.data))
            continue
        body = json.loads(response.data)
        config = dict(body["config"])
        # The GET hands a metric/dimension's model scope back as a SIBLING of
        # config, and the viewer posts it alongside. Dropping it here would
        # make the "round trip" silently un-scope every model-local field.
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
    """Guard the guard.

    If the fixture ever stops containing one of these, a whole half of this
    file silently stops testing anything. Fail loudly instead.
    """
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
    """The config the API hands out must be one the project can parse back.

    This is the ``extra='forbid'`` half: an input whose dump carried
    ``name_hash``/``structure`` failed here, which is why committing an input
    produced YAML the next parse refused.
    """
    rejected = []
    for manager, _, name, obj in _published_objects(flask_app):
        config = manager._serialize_object(name, obj, ObjectStatus.PUBLISHED)["config"]
        try:
            manager.validate_object(config)
        except Exception as error:
            rejected.append(f"{type(manager).__name__}/{name}: {type(error).__name__}: {error}")

    assert rejected == [], "configs the project cannot parse back:\n" + "\n".join(rejected[:10])


def test_no_config_the_api_hands_out_carries_location_bookkeeping(flask_app):
    """At EVERY depth, not just the top level.

    ``exclude={"path", "file_path"}`` reaches only the outermost fields, so a
    dashboard still handed the client ``path`` on every row, item and inline
    chart — and a commit then wrote those, plus an absolute machine-local
    ``file_path``, into the team's YAML.
    """
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
    """The false positive the recursive strip must never produce.

    ``layout.shapes[].path`` and ``layout.selections[].path`` are real,
    user-authored Plotly properties — the SVG path of a drawn shape. They live
    in free-form prop space, so a strip that went by key name would silently
    delete them from the chart it commits: a valid config quietly corrupted,
    which is strictly worse than the bookkeeping leak being fixed.
    """
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
    """GET → POST the identical config → the object is still PUBLISHED.

    This is the ``objects_equal`` half. Before the fix every object here
    reported MODIFIED, so the editor showed the whole project as dirty on a
    freshly loaded project nobody had touched.
    """
    wrong = []
    for manager in round_tripped_app._all_object_managers():
        for name in list(manager.cached_objects.keys()):
            status = manager.get_status(name)
            if status != ObjectStatus.PUBLISHED:
                wrong.append(f"{type(manager).__name__}/{name}: {status}")

    assert wrong == [], "objects reported changed by a no-op round trip:\n" + "\n".join(wrong[:10])
    assert round_tripped_app.has_draft_changes() is False


def test_round_trip_leaves_the_changes_endpoint_empty(round_tripped_app):
    """The viewer's own question — /changes/ — must agree."""
    client = round_tripped_app.app.test_client()
    response = client.get("/api/projects/local/changes/")

    assert response.status_code == 200
    body = json.loads(response.data)
    assert body["to_publish"] == []
    assert body["to_remove"] == []
    assert body["has_changes"] is False


def test_saving_defaults_unchanged_is_not_a_pending_change(fresh_app):
    """Defaults is the one object no ObjectManager owns, and it kept the bug.

    Every commit surface asked ``_cached_defaults is not None`` — "has the
    panel been saved this session?", not "did anything change?" — so opening
    the Defaults panel and pressing Save left a phantom pending change with no
    way back to clean short of committing or restarting.
    """
    client = fresh_app.app.test_client()
    published = json.loads(client.get("/api/defaults/").data)

    assert client.post("/api/defaults/", json=published).status_code == 200

    changes = json.loads(client.get("/api/projects/local/changes/").data)
    assert changes["to_publish"] == []
    assert changes["has_changes"] is False
    assert fresh_app.has_draft_changes() is False
    assert json.loads(client.get("/api/commit/pending/").data)["pending"] == []
    assert json.loads(client.get("/api/commit/status/").data)["has_unpublished_changes"] is False


def test_re_parenting_a_metric_is_a_pending_change(fresh_app):
    """A model-scoped field's scope is content, and no ``model_dump`` can see it.

    ``_parent_name`` is a PrivateAttr, so comparing dumps alone made a save
    that ONLY moves a metric to another model compare equal: reported
    PUBLISHED, never in the pending set, silently dropped when the draft cache
    was cleared — while ``_build_child_info`` reads exactly that attribute to
    decide which YAML file the metric is written into.
    """
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
    """The field symptom, asserted directly.

    With every object round-tripped into the draft cache, a commit must find
    nothing to write and every YAML file must come out byte-identical. Before
    the fix this pass rewrote the entire project — including ``name_hash:``
    lines under every input, which the next parse then rejected.
    """
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
    """The write path the zero-change guard above can never reach.

    ``No changes to commit`` short-circuits before ``ProjectWriter`` is even
    constructed, so byte-identity there is entailed by the short-circuit rather
    than by anything about serialization. Commit ONE real edit instead: the
    edit must land, and the YAML must gain no ``path:`` / ``file_path:``
    bookkeeping. Before the recursive strip this added 20 nested ``path:``
    lines for a single row-height change on ``simple-dashboard``.
    """
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
    """A commit that reports publishing defaults must publish defaults.

    ``ProjectWriter._update`` finds a child by ``value["name"] == child_name``,
    and the YAML ``defaults:`` mapping has no ``name``. The recursion returned
    False, the write was a silent no-op, and the endpoint still answered 200
    with ``published_count: 1`` and cleared the draft cache — the user's edit
    reported as a successful publish and gone.
    """
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
    """A chart written inside a dashboard is publishable.

    ``inject_cached_objects`` appended every draft to the matching TOP-LEVEL
    list, so a draft of an inline-defined chart put the same name in the
    project twice and #640's commit gate refused with
    ``Chart name '...' is not unique in the project`` — about a chart the user
    may never have touched. Every dashboard-inline chart was unpublishable,
    and merely opening one blocked unrelated commits.
    """
    client = fresh_app.app.test_client()
    top_level = {chart.name for chart in (fresh_app.project.charts or [])}
    name = next(name for name in fresh_app.chart_manager.published_objects if name not in top_level)

    config = json.loads(client.get(f"/api/charts/{quote(name, safe='')}/").data)["config"]
    config["layout"] = dict(config.get("layout") or {}, title={"text": "Committed inline"})
    assert client.post(f"/api/charts/{quote(name, safe='')}/", json=config).status_code == 200

    response = client.post("/api/commit/", json={})

    assert response.status_code == 200, response.data
    assert "Committed inline" in open(os.path.join(fresh_project, "project.visivo.yml")).read()
