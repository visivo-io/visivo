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


def test_malformed_body_is_400(client):
    assert client.post("/api/insight-execute-draft/", data="not json").status_code == 400
    assert (
        client.post("/api/insight-execute-draft/", json={"insight": {}}).status_code == 400
    )  # no name
