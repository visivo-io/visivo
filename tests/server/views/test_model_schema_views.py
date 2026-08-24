"""On-demand model schema inference (``POST /api/models/**/schema/``).

These replaced a read of the artifact ``visivo run`` wrote. The behaviour that
matters, and the reason for the change, is the first test: a model that has
**never been run** answers with real columns. The old endpoint could only 404,
which is why compiling a draft insight against a never-built model failed.

Nothing here touches a database. Inference is SQLGlot ``qualify`` +
``annotate_types`` against the source's *cached* schema — the same call
``visivo run`` makes before writing the artifact down.
"""

import json
import os

import pytest
from unittest.mock import Mock
from flask import Flask

from visivo.constants import DEFAULT_RUN_ID
from visivo.server.views.model_schema_views import register_model_schema_views
from tests.factories.model_factories import DuckdbSourceFactory, SqlModelFactory


def _write_source_schema(output_dir, source_name, tables, run_id=DEFAULT_RUN_ID):
    """Write the source schema artifact inference reads.

    Shape matches SchemaAggregator's stored envelope: a ``sqlglot_schema`` block
    of ``{table: {column: type_string}}`` plus ``metadata``.
    """
    payload = {
        "source_name": source_name,
        "sqlglot_schema": tables,
        "metadata": {"default_schema": None},
    }
    schema_dir = os.path.join(output_dir, run_id, "schemas")
    os.makedirs(schema_dir, exist_ok=True)
    with open(os.path.join(schema_dir, f"{source_name}.json"), "w") as fp:
        json.dump(payload, fp)
    return payload


ORDERS = {"orders": {"id": "INT", "amount": "DECIMAL", "region": "VARCHAR"}}


@pytest.fixture
def output_dir(tmp_path):
    return str(tmp_path)


@pytest.fixture
def source():
    return DuckdbSourceFactory(name="wh")


@pytest.fixture
def model(source):
    return SqlModelFactory(name="rev", sql="SELECT id, amount FROM orders", source=source)


@pytest.fixture
def app(output_dir, model, source):
    app = Flask(__name__)
    app.config["TESTING"] = True
    flask_app = Mock()
    flask_app.project.models = [model]
    flask_app.project.sources = [source]
    # The managers hold published objects too, so a committed model resolves
    # through them in production. Mock() would otherwise hand back a truthy
    # Mock for every name, including ones that should 404.
    flask_app.model_manager.get.side_effect = lambda n: model if n == model.name else None
    flask_app.source_manager.get.side_effect = lambda n: source if n == source.name else None
    register_model_schema_views(app, flask_app, output_dir)
    return app


@pytest.fixture
def client(app):
    return app.test_client()


class TestSavedModelSchema:
    def test_a_never_run_model_still_reports_its_columns(self, client, output_dir):
        """The reason this endpoint exists.

        No model artifact is written anywhere in this test — only the *source*
        schema, which introspection produces. The old read-the-artifact endpoint
        had nothing to return here and 404'd.
        """
        _write_source_schema(output_dir, "wh", ORDERS)

        resp = client.post("/api/model-schemas/rev/")

        assert resp.status_code == 200
        body = resp.get_json()
        assert [c["name"] for c in body["columns"]] == ["amount", "id"]
        assert body["source_schema_cached"] is True

    def test_types_come_from_the_source_schema(self, client, output_dir):
        _write_source_schema(output_dir, "wh", ORDERS)

        body = client.post("/api/model-schemas/rev/").get_json()
        by_name = {c["name"]: c for c in body["columns"]}

        assert by_name["id"]["type"] == "INT"
        assert by_name["amount"]["type"] == "DECIMAL"
        # SQLGlot annotates types, not nullability. Claiming True would be
        # inventing an answer, so it stays unknown.
        assert by_name["id"]["nullable"] is None

    def test_star_expands_from_the_source_schema(self, client, output_dir):
        """`SELECT *` is the case a select-list reader could not fake.

        The column names exist nowhere in the SQL — only qualifying against the
        cached source schema produces them.
        """
        _write_source_schema(output_dir, "wh", ORDERS)

        body = client.post(
            "/api/model-schemas/rev/",
            json={"sql": "SELECT * FROM orders"},
        ).get_json()

        assert [c["name"] for c in body["columns"]] == ["amount", "id", "region"]

    def test_body_sql_overrides_the_saved_model(self, client, output_dir):
        """How the editor asks about SQL it has not saved yet."""
        _write_source_schema(output_dir, "wh", ORDERS)

        body = client.post(
            "/api/model-schemas/rev/",
            json={"sql": "SELECT region FROM orders"},
        ).get_json()

        assert [c["name"] for c in body["columns"]] == ["region"]

    def test_no_cached_source_schema_is_reported_not_failed(self, client, output_dir):
        """A source nobody has introspected yet.

        Inference still runs — a query that names its own columns resolves
        fine — but the flag lets a caller tell "nothing resolved" from "nothing
        to resolve against" and offer to generate a schema.
        """
        resp = client.post("/api/model-schemas/rev/")

        assert resp.status_code == 200
        assert resp.get_json()["source_schema_cached"] is False

    def test_unknown_model_404s(self, client):
        resp = client.post("/api/model-schemas/nope/")
        assert resp.status_code == 404
        assert "not found" in resp.get_json()["error"]


class TestDraftModelSchema:
    def test_infers_from_sql_with_no_saved_model(self, client, output_dir):
        _write_source_schema(output_dir, "wh", ORDERS)

        resp = client.post(
            "/api/model-schemas/",
            json={"sql": "SELECT id, region FROM orders", "source_name": "wh"},
        )

        assert resp.status_code == 200
        assert [c["name"] for c in resp.get_json()["columns"]] == ["id", "region"]

    def test_requires_both_sql_and_source(self, client):
        assert client.post("/api/model-schemas/", json={"sql": "SELECT 1"}).status_code == 400
        assert client.post("/api/model-schemas/", json={"source_name": "wh"}).status_code == 400

    def test_unknown_source_404s(self, client):
        resp = client.post(
            "/api/model-schemas/",
            json={"sql": "SELECT 1", "source_name": "ghost"},
        )
        assert resp.status_code == 404


class TestAgreementWithTheRun:
    def test_endpoint_columns_match_what_a_run_would_persist(self, client, output_dir, model):
        """Pins that extracting the inference did not fork the path.

        ``_build_and_write_schema`` and this endpoint both call
        ``infer_model_columns``. If someone reimplements one of them, this
        fails.
        """
        from visivo.jobs.run_sql_model_job import _build_and_write_schema

        _write_source_schema(output_dir, "wh", ORDERS)

        run_schema = _build_and_write_schema(model, model.source, output_dir, DEFAULT_RUN_ID)
        persisted = run_schema[model.name_hash()]

        endpoint = client.post("/api/model-schemas/rev/").get_json()["columns"]

        assert [c["name"] for c in endpoint] == sorted(persisted.keys())
        assert [c["type"] for c in endpoint] == [str(persisted[c["name"]]) for c in endpoint]


class TestUncommittedModels:
    """A model created in the editor lives in the DRAFT CACHE until Commit.

    ``/api/models/`` serves cached + published (that is what the Library and the
    semantic layer render from), so the viewer shows models that
    ``flask_app.project`` — compiled from YAML — has never heard of. Schema
    inference used to scan only the committed project, so every one of those
    models 404'd: "Model 'test-source_query' not found" the moment the ERD asked
    for its columns.
    """

    @pytest.fixture
    def draft_model(self):
        # A ref STRING, not an embedded object: this is how the editor saves a
        # model that points at a source, and it is what makes DAG-based source
        # resolution impossible for a model the DAG has never seen.
        return SqlModelFactory(
            name="test-source_query",
            sql="SELECT id, amount FROM orders",
            source="ref(wh)",
        )

    @pytest.fixture
    def draft_app(self, output_dir, source, draft_model):
        app = Flask(__name__)
        app.config["TESTING"] = True
        flask_app = Mock()
        # Nothing committed to YAML yet — the draft exists only in the cache,
        # and the compiled DAG has never seen it, so DAG-based source
        # resolution cannot answer for it.
        flask_app.project.models = []
        flask_app.project.sources = [source]
        flask_app.project.dag.return_value = None
        flask_app.model_manager.get.side_effect = lambda n: (
            draft_model if n == draft_model.name else None
        )
        flask_app.source_manager.get.side_effect = lambda n: source if n == source.name else None
        register_model_schema_views(app, flask_app, output_dir)
        return app

    @pytest.fixture
    def draft_client(self, draft_app):
        return draft_app.test_client()

    def test_an_uncommitted_model_reports_its_columns(self, draft_client, output_dir):
        """The reported bug: a 404 in the semantic layer for a draft model."""
        _write_source_schema(output_dir, "wh", ORDERS)

        resp = draft_client.post("/api/model-schemas/test-source_query/")

        assert resp.status_code == 200
        body = resp.get_json()
        assert [c["name"] for c in body["columns"]] == ["amount", "id"]
        assert body["source_name"] == "wh"

    def test_a_context_string_source_resolves_too(self, output_dir, source):
        """``${ref(wh)}`` is the serialized form the same field round-trips as."""
        app = Flask(__name__)
        app.config["TESTING"] = True
        model = SqlModelFactory(name="ctx_query", sql="SELECT id FROM orders", source="${ref(wh)}")
        flask_app = Mock()
        flask_app.project.models = []
        flask_app.project.sources = [source]
        flask_app.project.dag.return_value = None
        flask_app.model_manager.get.side_effect = lambda n: model if n == "ctx_query" else None
        flask_app.source_manager.get.side_effect = lambda n: source if n == "wh" else None
        register_model_schema_views(app, flask_app, output_dir)
        _write_source_schema(output_dir, "wh", ORDERS)

        resp = app.test_client().post("/api/model-schemas/ctx_query/")

        assert resp.status_code == 200
        assert resp.get_json()["source_name"] == "wh"

    def test_a_genuinely_missing_model_still_404s(self, draft_client):
        """The draft lookup must not turn "not found" into something else."""
        resp = draft_client.post("/api/model-schemas/no_such_model/")
        assert resp.status_code == 404

    def test_an_uncommitted_source_resolves_for_a_body_override(
        self, draft_client, output_dir, source
    ):
        """A draft SOURCE is equally invisible to the committed project."""
        _write_source_schema(output_dir, "wh", ORDERS)
        resp = draft_client.post(
            "/api/model-schemas/test-source_query/",
            json={"source_name": "wh"},
        )
        assert resp.status_code == 200

    def test_falls_back_to_the_committed_project_when_no_manager_answers(
        self, output_dir, model, source
    ):
        """The managers are the primary lookup, not the only one.

        A host that wires the views without object managers (or whose manager
        raises) must still resolve committed models from the project.
        """
        app = Flask(__name__)
        app.config["TESTING"] = True
        flask_app = Mock()
        flask_app.project.models = [model]
        flask_app.project.sources = [source]
        flask_app.model_manager.get.side_effect = RuntimeError("no cache here")
        flask_app.source_manager.get.side_effect = RuntimeError("no cache here")
        register_model_schema_views(app, flask_app, output_dir)
        _write_source_schema(output_dir, "wh", ORDERS)

        resp = app.test_client().post("/api/model-schemas/rev/")

        assert resp.status_code == 200
        assert [c["name"] for c in resp.get_json()["columns"]] == ["amount", "id"]
