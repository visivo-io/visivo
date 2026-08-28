"""Flask test-client coverage for the draft insight EXECUTE endpoint (Explore
2.0 state fix, Phase 3). Unlike compile-draft, this endpoint really EXECUTES the
insight's query against the source, so the fixtures back it with a real DuckDB
file whose full table is what the aggregate must be computed over.
"""

import glob
import json
import os

import duckdb
import pytest
from flask import Flask

from visivo.models.project import Project
from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps
from visivo.models.interaction import InsightInteraction
from visivo.models.inputs.types.multi_select import MultiSelectInput
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.duckdb_source import DuckdbSource
from visivo.server.views.insight_execute_views import register_insight_execute_views


class FlaskAppStub:
    def __init__(self, project):
        self.project = project


# The FULL table: five rows, amount summing to 150 (west=30, east=120). A
# preview SAMPLE of the first rows would sum to less — the whole point of the
# server lane is that the endpoint aggregates over ALL of this, not a sample.
FULL_TOTAL = 150


@pytest.fixture
def duckdb_file(tmp_path):
    db_path = str(tmp_path / "warehouse.duckdb")
    con = duckdb.connect(db_path)
    con.execute("CREATE TABLE orders (region VARCHAR, amount INTEGER)")
    con.execute(
        "INSERT INTO orders VALUES "
        "('west', 10), ('west', 20), ('east', 30), ('east', 40), ('east', 50)"
    )
    con.close()
    return db_path


@pytest.fixture
def project(duckdb_file):
    source = DuckdbSource(name="warehouse", database=duckdb_file, type="duckdb")
    model = SqlModel(name="orders_q", sql="SELECT * FROM orders", source="ref(warehouse)")
    return Project(name="p", sources=[source], models=[model])


@pytest.fixture
def app(tmp_path, project):
    app = Flask(__name__)
    app.config["TESTING"] = True
    stub = FlaskAppStub(project)
    register_insight_execute_views(app, stub, str(tmp_path))
    app.output_dir = str(tmp_path)
    return app


@pytest.fixture
def client(app):
    return app.test_client()


MODEL_SCHEMAS = {"orders_q": {"region": "VARCHAR", "amount": "INTEGER"}}


def _aggregate_payload():
    """region on x, sum(amount) on y → a real GROUP BY aggregate."""
    return {
        "insight": {
            "name": "sales_by_region",
            "props": {
                "type": "bar",
                "x": "?{${ref(orders_q).region}}",
                "y": "?{sum(${ref(orders_q).amount})}",
            },
        },
        "model_schemas": MODEL_SCHEMAS,
    }


def test_aggregate_executes_against_the_full_source_not_a_sample(client):
    resp = client.post("/api/insight-execute-draft/", json=_aggregate_payload())
    assert resp.status_code == 200, resp.get_json()
    data = resp.get_json()

    # Two regions -> two grouped rows, and the y column sums to the FULL-source
    # total (150), which a client-side aggregate over a preview SAMPLE could not
    # produce. The rows ARE the final chart rows; find the y column via the
    # props_mapping the client binds through.
    assert data["row_count"] == 2
    y_key = next(k for k in data["props_mapping"] if k.endswith("y"))
    y_alias = data["props_mapping"][y_key]
    assert sum(row[y_alias] for row in data["rows"]) == FULL_TOTAL
    assert data["type"] == "bar"
    assert {"name": "orders_q"} == {"name": data["models"][0]["name"]}


def test_execution_writes_no_parquet_or_artifacts(client, app):
    client.post("/api/insight-execute-draft/", json=_aggregate_payload())
    # The executor is called with no output_dir/name, so nothing is materialized.
    assert glob.glob(os.path.join(app.output_dir, "**", "*.parquet"), recursive=True) == []
    assert glob.glob(os.path.join(app.output_dir, "**", "*.json"), recursive=True) == []


def test_scratch_model_with_no_schema_is_422_model_not_run(client):
    # Same insight, but no model_schemas and the model has never been run: the
    # FieldResolver has no columns to resolve ${ref}.col against.
    payload = _aggregate_payload()
    payload.pop("model_schemas")
    resp = client.post("/api/insight-execute-draft/", json=payload)
    assert resp.status_code == 422
    body = resp.get_json()
    assert body["error_type"] == "model_not_run"


def test_insight_referencing_an_input_is_409_requires_client_lane(duckdb_file, tmp_path):
    # An insight whose filter references a real Input is DYNAMIC → pre_query is
    # None (the ${input} placeholder can't be baked server-side) → the endpoint
    # tells the client to keep the DuckDB sample lane.
    source = DuckdbSource(name="warehouse", database=duckdb_file, type="duckdb")
    model = SqlModel(name="orders_q", sql="SELECT * FROM orders", source="ref(warehouse)")
    an_input = MultiSelectInput(name="region_filter", label="Region", options=["west", "east"])
    insight = Insight(
        name="filtered",
        props=InsightProps(
            type="bar",
            x="?{${ref(orders_q).region}}",
            y="?{sum(${ref(orders_q).amount})}",
        ),
        interactions=[
            InsightInteraction(
                filter="?{${ref(orders_q).region} IN (${ref(region_filter).values})}"
            )
        ],
    )
    proj = Project(
        name="p", sources=[source], models=[model], inputs=[an_input], insights=[insight]
    )
    app = Flask(__name__)
    register_insight_execute_views(app, FlaskAppStub(proj), str(tmp_path))
    client = app.test_client()

    resp = client.post(
        "/api/insight-execute-draft/",
        json={
            "insight": {
                "name": "filtered",
                "props": {
                    "type": "bar",
                    "x": "?{${ref(orders_q).region}}",
                    "y": "?{sum(${ref(orders_q).amount})}",
                },
                "interactions": [
                    {"filter": "?{${ref(orders_q).region} IN (${ref(region_filter).values})}"}
                ],
            },
            "model_schemas": MODEL_SCHEMAS,
        },
    )
    assert resp.status_code == 409
    assert resp.get_json()["error_type"] == "requires_client_lane"


def test_multi_source_insight_is_rejected_400_multi_source(duckdb_file, tmp_path):
    # Two models on two DIFFERENT sources: the built query would embed both
    # sources' CTEs but can only execute against one, so the endpoint must reject
    # it cleanly (Phase 4 review fix) instead of executing against an arbitrary
    # source and surfacing a raw "table does not exist" driver error.
    db2 = str(tmp_path / "warehouse2.duckdb")
    con = duckdb.connect(db2)
    con.execute("CREATE TABLE users (id INTEGER)")
    con.execute("INSERT INTO users VALUES (1), (2)")
    con.close()

    source1 = DuckdbSource(name="warehouse", database=duckdb_file, type="duckdb")
    source2 = DuckdbSource(name="warehouse2", database=db2, type="duckdb")
    model_a = SqlModel(name="orders_q", sql="SELECT * FROM orders", source="ref(warehouse)")
    model_b = SqlModel(name="users_q", sql="SELECT * FROM users", source="ref(warehouse2)")
    insight = Insight(
        name="cross",
        props=InsightProps(
            type="scatter",
            x="?{${ref(orders_q).amount}}",
            y="?{${ref(users_q).id}}",
        ),
    )
    proj = Project(
        name="p", sources=[source1, source2], models=[model_a, model_b], insights=[insight]
    )
    app = Flask(__name__)
    register_insight_execute_views(app, FlaskAppStub(proj), str(tmp_path))
    client = app.test_client()

    resp = client.post(
        "/api/insight-execute-draft/",
        json={
            "insight": {
                "name": "cross",
                "props": {
                    "type": "scatter",
                    "x": "?{${ref(orders_q).amount}}",
                    "y": "?{${ref(users_q).id}}",
                },
            },
            "model_schemas": {
                "orders_q": {"amount": "INTEGER"},
                "users_q": {"id": "INTEGER"},
            },
        },
    )
    assert resp.status_code == 400
    assert resp.get_json()["error_type"] == "multi_source"


def test_datetime_rows_serialise_as_iso8601_not_rfc1123(duckdb_file, tmp_path):
    """B7-b / S2-19: Flask's default jsonify renders datetime as RFC-1123
    ("Mon, 01 Jun 2026 00:00:00 GMT"), which Plotly's date parser rejects —
    the axis then autotypes as category in row order. Rows must carry ISO-8601.
    """
    import re

    con = duckdb.connect(duckdb_file)
    con.execute("CREATE TABLE readings (reading_ts TIMESTAMP, value INTEGER)")
    con.execute(
        "INSERT INTO readings VALUES "
        "('2026-06-01 00:00:00', 10), ('2026-06-02 00:00:00', 20), ('2026-06-03 00:00:00', 30)"
    )
    con.close()

    source = DuckdbSource(name="warehouse", database=duckdb_file, type="duckdb")
    model = SqlModel(name="readings_q", sql="SELECT * FROM readings", source="ref(warehouse)")
    proj = Project(name="p", sources=[source], models=[model])
    app = Flask(__name__)
    register_insight_execute_views(app, FlaskAppStub(proj), str(tmp_path))
    client = app.test_client()

    resp = client.post(
        "/api/insight-execute-draft/",
        json={
            "insight": {
                "name": "readings_by_day",
                "props": {
                    "type": "bar",
                    "x": "?{${ref(readings_q).reading_ts}}",
                    "y": "?{sum(${ref(readings_q).value})}",
                },
            },
            "model_schemas": {"readings_q": {"reading_ts": "TIMESTAMP", "value": "INTEGER"}},
        },
    )
    assert resp.status_code == 200, resp.get_json()
    data = resp.get_json()

    x_key = next(k for k in data["props_mapping"] if k.endswith("x"))
    x_alias = data["props_mapping"][x_key]
    # Plotly's DATETIME_REGEXP (plotly.js src/lib/dates.js) — the parser the
    # values must satisfy for the axis to autotype as date.
    plotly_datetime = re.compile(
        r"^\s*(-?\d\d\d\d|\d\d)(-(0?[1-9]|1[012])(-([0-3]?\d)([ Tt]([01]?\d|2[0-3])"
        r"(:([0-5]\d)(:([0-5]\d(\.\d+)?))?(Z|z|[+\-]\d\d(:?\d\d)?)?)?)?)?)?\s*$"
    )
    for row in data["rows"]:
        value = row[x_alias]
        assert isinstance(value, str)
        assert plotly_datetime.match(value), f"not Plotly-parseable: {value!r}"
        assert "GMT" not in value


def test_model_schemas_as_non_dict_is_400_not_500(client):
    # Phase 4 review fix: a truthy non-dict model_schemas (a JSON list) must be a
    # clean 400, never an unhandled AttributeError → raw 500.
    resp = client.post(
        "/api/insight-execute-draft/",
        json={**_aggregate_payload(), "model_schemas": [1, 2]},
    )
    assert resp.status_code == 400


def test_malformed_body_is_400(client):
    assert client.post("/api/insight-execute-draft/", data="not json").status_code == 400
    assert (
        client.post("/api/insight-execute-draft/", json={"insight": {}}).status_code == 400
    )  # no name


class TestExecuteDraftPositionalAxisTypeGate:
    """WB9 / S5-14: the execute-draft path is the one the Explorer's preview
    lane actually calls, so its 400 must carry the structured diagnostics too.

    The compile view got dedicated endpoint tests for this; this view's
    identical wiring shipped with none — falsified by reverting the view's
    `**diagnostic_fields(e)` to a bare `{"error": message}` and watching the
    whole suite stay green.
    """

    def _struct_payload(self):
        return {
            "insight": {
                "name": "blank_chart",
                "props": {
                    "type": "bar",
                    # The S5-14 double-wrap: the inner ?{...} survives into the
                    # resolved SQL and SQLGlot reads it as a struct literal.
                    "x": "?{?{${ref(orders_q).region}}}",
                    "y": "?{sum(${ref(orders_q).amount})}",
                },
            },
            "model_schemas": MODEL_SCHEMAS,
        }

    def test_struct_bound_to_x_is_a_400_not_a_blank_200(self, client):
        resp = client.post("/api/insight-execute-draft/", json=self._struct_payload())
        assert resp.status_code == 400, resp.get_json()
        error = resp.get_json()["error"]
        assert "blank_chart" in error
        assert "props.x" in error
        assert "STRUCT" in error

    def test_the_400_carries_the_structured_diagnostics(self, client):
        resp = client.post("/api/insight-execute-draft/", json=self._struct_payload())
        body = resp.get_json()
        # PLURAL key, LIST value — the shape `diagnosticsFrom` in
        # viewer/src/types/diagnostic.js reads.
        assert isinstance(body["diagnostics"], list)
        assert len(body["diagnostics"]) == 1
        diagnostic = body["diagnostics"][0]
        assert diagnostic["code"] == "non_plottable_axis_type"
        assert diagnostic["phase"] == "compile"
        assert diagnostic["severity"] == "error"
        assert diagnostic["field"] == "props.x"
        assert diagnostic["object"] == {"type": "insight", "name": "blank_chart"}
        assert diagnostic["hint"]

    def test_an_ordinary_build_failure_carries_no_diagnostics_key(self, client):
        """`diagnostics` is additive — a 400 from a failure that produced none
        must not grow an empty/null key."""
        resp = client.post(
            "/api/insight-execute-draft/",
            json={**self._struct_payload(), "model_schemas": [1, 2]},
        )
        assert resp.status_code == 400
        assert "diagnostics" not in resp.get_json()
