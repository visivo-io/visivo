"""Regression guard for honest object status (M12 / M25).

The editor's whole model of "what changed" rests on one property that nothing
tested: **loading a project, handing its config to a client, and taking that
exact config back must be a no-op.** It was not.

Two independent leaks broke it, and both are asserted here against the REAL
``test-projects/integration`` fixture rather than a synthetic model, because
each leak only shows up on object types a hand-built fixture is unlikely to
include (inputs) or on fields only the parser populates (``path``):

1. ``objects_equal`` compared ``path``/``file_path`` — location bookkeeping the
   parser stamps on and every API serializer strips off. A round trip could
   never restore them, so every object in the project reported MODIFIED
   forever, and a Commit rewrote all of them.
2. ``SingleSelectInput``/``MultiSelectInput`` injected ``name_hash`` (and
   ``structure``) into every ``model_dump``. The parser's ``extra='forbid'``
   rejects both, so the serialized form was not a config at all: committing an
   input wrote YAML the very next parse refused.

Together they are the mechanism behind the field report of a test run leaving
``test-projects/integration/project.visivo.yml`` dirty with ~190 lines of
injected ``name_hash``. The last test here is the direct guard on that: a
no-op round trip must leave every YAML file byte-identical.
"""

import json
import os
import shutil

import pytest

from visivo.commands.parse_project_phase import parse_project_phase
from visivo.server.flask_app import FlaskApp
from visivo.server.managers.object_manager import ObjectStatus

SOURCE_PROJECT_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "test-projects", "integration")
)


def _yaml_files(directory):
    """Every project YAML in the fixture, relative to its root."""
    found = []
    for root, dirs, files in os.walk(directory):
        dirs[:] = [d for d in dirs if d not in ("target", ".visivo_cache")]
        for filename in files:
            if filename.endswith((".yml", ".yaml")):
                found.append(os.path.relpath(os.path.join(root, filename), directory))
    return sorted(found)


@pytest.fixture(scope="module")
def project_copy(tmp_path_factory):
    """A private copy of the integration fixture.

    Copied rather than used in place so that a regression here can never dirty
    the tracked working tree — which is exactly the failure this file guards.
    """
    destination = str(tmp_path_factory.mktemp("round_trip") / "integration")
    shutil.copytree(
        SOURCE_PROJECT_DIR,
        destination,
        ignore=shutil.ignore_patterns("target"),
    )
    return destination


@pytest.fixture(scope="module")
def flask_app(project_copy):
    """The real server object graph, loaded from the real project."""
    output_dir = os.path.join(project_copy, "target")
    cwd_before = os.getcwd()
    os.chdir(project_copy)
    try:
        project = parse_project_phase(
            working_dir=project_copy,
            output_dir=output_dir,
            default_source=None,
            dbt_profile=None,
            dbt_target=None,
        )
    finally:
        os.chdir(cwd_before)

    app = FlaskApp(output_dir, project, working_dir=project_copy)
    app.app.config["TESTING"] = True
    return app


def _published_objects(flask_app):
    """(manager, name, object) for every published object in the project."""
    for manager in flask_app._all_object_managers():
        for name, obj in list(manager.published_objects.items()):
            yield manager, name, obj


@pytest.fixture(scope="module")
def round_tripped_app(flask_app):
    """The same app with every published object re-saved from its own config.

    This is the client's no-op: GET the config, POST the identical bytes back.
    Every downstream assertion is about what the server believes AFTER that.
    """
    for manager, name, obj in _published_objects(flask_app):
        config = manager._serialize_object(name, obj, ObjectStatus.PUBLISHED)["config"]
        manager.save(name, manager.validate_object(config))
    return flask_app


def test_the_fixture_actually_covers_the_interesting_types(flask_app):
    """Guard the guard.

    If the fixture ever stops containing inputs, the ``name_hash`` half of this
    file silently stops testing anything. Fail loudly instead.
    """
    assert len(flask_app.input_manager.published_objects) > 0, "fixture has no inputs"
    assert len(flask_app.model_manager.published_objects) > 0, "fixture has no models"
    assert len(flask_app.dashboard_manager.published_objects) > 0, "fixture has no dashboards"


def test_every_published_config_is_a_valid_config(flask_app):
    """The config the API hands out must be one the project can parse back.

    This is the ``extra='forbid'`` half: an input whose dump carried
    ``name_hash``/``structure`` failed here, which is why committing an input
    produced YAML the next parse refused.
    """
    rejected = []
    for manager, name, obj in _published_objects(flask_app):
        config = manager._serialize_object(name, obj, ObjectStatus.PUBLISHED)["config"]
        try:
            manager.validate_object(config)
        except Exception as error:
            rejected.append(f"{type(manager).__name__}/{name}: {type(error).__name__}: {error}")

    assert rejected == [], "configs the project cannot parse back:\n" + "\n".join(rejected[:10])


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
