"""End-to-end typing of join-path failures through the insight run job (VIS-1007).

When an insight spans two models with no relation between them, the query
builder raises ``NoJoinPathError`` from inside ``run_insight_job.action``. The
job's broad ``except`` must keep flowing the human-readable message AND attach
structured ``error_details`` (``error_type`` + the ``error_models`` pair) to the
``JobResult`` so the preview run-status payload can drive the inline join-fix
card instead of a dead-end red error block.
"""

import json

from visivo.jobs.run_insight_job import action
from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.duckdb_source import DuckdbSource
from visivo.models.project import Project


def _write_schema(schema_base, model, columns):
    """Mirror the on-disk schema layout the FieldResolver reads from."""
    model_hash = model.name_hash()
    schema_dir = schema_base.mkdir(model.name)
    schema_file = schema_dir.join("schema.json")
    schema_file.write(json.dumps({model_hash: columns}))


def _two_unjoined_model_project():
    source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
    orders = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")
    users = SqlModel(name="users", sql="SELECT * FROM users", source="ref(test_source)")
    # Insight that pulls a field from EACH model -> spans two models with no
    # relation declared between them.
    insight = Insight(
        name="cross_model_insight",
        props=InsightProps(
            type="scatter",
            x="?{ ${ ref(orders).amount } }",
            y="?{ ${ ref(users).age } }",
        ),
    )
    project = Project(
        name="test_project",
        sources=[source],
        models=[orders, users],
        insights=[insight],
        dashboards=[],
    )
    return project, insight, orders, users


def test_two_unjoined_model_insight_run_yields_missing_relation(tmpdir):
    """A real insight run over two unjoined models fails with a typed
    ``missing_relation`` error carrying the offending model pair."""
    project, insight, orders, users = _two_unjoined_model_project()
    dag = project.dag()

    run_id = "main"
    output_dir = str(tmpdir)
    # FieldResolver reads schemas from {output_dir}/{run_id}/schemas/<model>/schema.json
    run_dir = tmpdir.mkdir(run_id)
    schema_base = run_dir.mkdir("schemas")
    _write_schema(schema_base, orders, {"amount": "INTEGER"})
    _write_schema(schema_base, users, {"age": "INTEGER"})

    result = action(insight, dag, output_dir, run_id=run_id)

    assert result.success is False
    # The structured fields the run-status payload threads to the viewer.
    assert result.error_details is not None
    assert result.error_details["error_type"] == "missing_relation"
    assert set(result.error_details["error_models"]) == {"orders", "users"}


def test_non_join_failure_has_no_structured_error_details(tmpdir):
    """Ordinary failures (e.g. a model with no schema on disk) keep the generic
    error path — ``error_details`` stays ``None`` so the plain red error shows."""
    source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
    orders = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")
    insight = Insight(
        name="single_model_insight",
        props=InsightProps(type="scatter", x="?{ ${ ref(orders).amount } }", y="?{ count() }"),
    )
    project = Project(
        name="test_project",
        sources=[source],
        models=[orders],
        insights=[insight],
        dashboards=[],
    )
    dag = project.dag()

    # No schema written -> field resolution / build fails for a non-join reason.
    result = action(insight, dag, str(tmpdir), run_id="main")

    assert result.success is False
    assert result.error_details is None
