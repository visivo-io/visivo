"""Explore 2.0 state fix, Phase 3 — the projection-vs-aggregate classification
that routes a draft insight preview to the client (instant, over the fetched
sample) or the server (correct, over the FULL source).

`InsightQueryInfo.requires_full_source` is True iff the insight's query is NOT a
pure row-level projection of its model rows: it aggregates, uses a window, splits,
or spans more than one model (a relation join). Each of these signals must
INDEPENDENTLY flip the class — a SUM over a 1,000-row preview sample is not the
real total, so it must reach the server.
"""

import json
import os

from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps
from visivo.query.insight.insight_query_builder import InsightQueryBuilder
from tests.factories.model_factories import SourceFactory


def _write_schema(model, output_dir):
    """FieldResolver needs each model's column schema to resolve ${ref(m).col}."""
    schema_dir = os.path.join(output_dir, "schemas")
    os.makedirs(schema_dir, exist_ok=True)
    with open(os.path.join(schema_dir, f"{model.name}.json"), "w") as f:
        json.dump(
            {model.name_hash(): {"x": "INTEGER", "y": "INTEGER", "amount": "DECIMAL"}},
            f,
        )


def _classify(insight, extra_models=None, tmpdir=None):
    """Build the insight end-to-end and return requires_full_source."""
    source = SourceFactory()
    models = [
        SqlModel(name="orders", sql="SELECT x, y, amount FROM orders", source=f"ref({source.name})")
    ] + (extra_models or [])
    project = Project(
        name="p",
        sources=[source],
        models=models,
        insights=[insight],
        dashboards=[],
    )
    dag = project.dag()
    for m in models:
        _write_schema(m, str(tmpdir))
    builder = InsightQueryBuilder(insight, dag, str(tmpdir))
    builder.resolve()
    return builder.build().requires_full_source


def test_raw_column_projection_is_not_full_source(tmpdir):
    """x and y are bare columns of a single model — a pure row-level projection.
    Safe to preview client-side over the fetched sample."""
    insight = Insight(
        name="scatter_raw",
        props=InsightProps(type="scatter", x="?{${ref(orders).x}}", y="?{${ref(orders).y}}"),
    )
    assert _classify(insight, tmpdir=tmpdir) is False


def test_aggregate_prop_requires_full_source(tmpdir):
    """A free-text aggregate authored straight into a prop (the same shape a
    Metric ref resolves to) — a SUM over the sample would be wrong, so it must
    execute against the full source."""
    insight = Insight(
        name="scatter_sum",
        props=InsightProps(
            type="scatter",
            x="?{${ref(orders).x}}",
            y="?{sum(${ref(orders).amount})}",
        ),
    )
    assert _classify(insight, tmpdir=tmpdir) is True


def test_window_prop_requires_full_source(tmpdir):
    """A window function needs the full partition to be correct, not a sample."""
    insight = Insight(
        name="scatter_window",
        props=InsightProps(
            type="scatter",
            x="?{${ref(orders).x}}",
            y="?{rank() OVER (ORDER BY ${ref(orders).y})}",
        ),
    )
    assert _classify(insight, tmpdir=tmpdir) is True


def _resolved_projection_builder(tmpdir):
    """A real, resolved builder for a raw-column projection — the baseline the
    split_key / multi-model branches are toggled against."""
    source = SourceFactory()
    model = SqlModel(
        name="orders", sql="SELECT x, y, amount FROM orders", source=f"ref({source.name})"
    )
    insight = Insight(
        name="scatter_raw",
        props=InsightProps(type="scatter", x="?{${ref(orders).x}}", y="?{${ref(orders).y}}"),
    )
    project = Project(name="p", sources=[source], models=[model], insights=[insight], dashboards=[])
    dag = project.dag()
    _write_schema(model, str(tmpdir))
    builder = InsightQueryBuilder(insight, dag, str(tmpdir))
    builder.resolve()
    return builder


def test_split_key_independently_requires_full_source(tmpdir, monkeypatch):
    """A split (multiple traces keyed by a column) is not a row-level projection.
    Proven independently: the same projection builder classifies as False, and
    flips to True the moment a split_key is present. (`split_key` is a read-only
    property derived from a split interaction, so it is patched here to isolate
    exactly the split branch of the classifier.)"""
    builder = _resolved_projection_builder(tmpdir)
    assert builder._requires_full_source() is False
    monkeypatch.setattr(InsightQueryBuilder, "split_key", "split_alias")
    assert builder._requires_full_source() is True


def test_multiple_models_independently_requires_full_source(tmpdir):
    """Spanning more than one model means a relation join — never a single-model
    projection. Proven independently by toggling the resolved model count."""
    builder = _resolved_projection_builder(tmpdir)
    assert builder._requires_full_source() is False
    # A second dependent model (a relation join would activate) flips the class.
    builder.models = list(builder.models) + [
        SqlModel(name="customers", sql="SELECT id FROM customers", source="ref(s)")
    ]
    assert builder._requires_full_source() is True
