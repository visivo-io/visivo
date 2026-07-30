"""Tests for the default x-ascending sort injected on LINE-mode insights.

Line charts connect points in row order, so an unsorted result renders a
tangled web (the model's own ORDER BY lives inside the CTE and is discarded by
the outer GROUP BY). InsightQueryBuilder.resolve() now injects a default
``sort by x ASC`` for line-mode insights that have no explicit sort. Bar charts
and marker-only scatters are left untouched, and an explicit sort is never
overridden.
"""

import json
import os
import pytest

from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps
from visivo.models.interaction import InsightInteraction
from visivo.query.insight.insight_query_builder import InsightQueryBuilder
from tests.factories.model_factories import SourceFactory


@pytest.fixture
def create_schema_file(tmpdir):
    def _create_schema(model, output_dir):
        schema_dir = os.path.join(output_dir, "schemas", model.name)
        os.makedirs(schema_dir, exist_ok=True)
        with open(os.path.join(schema_dir, "schema.json"), "w") as f:
            json.dump({model.name_hash(): {"x": "INTEGER", "y": "INTEGER"}}, f)

    return _create_schema


def _build(insight, tmpdir, create_schema_file):
    source = SourceFactory()
    model = SqlModel(
        name="line_model", sql="SELECT x, y FROM t ORDER BY x", source=f"ref({source.name})"
    )
    # rebind the insight's refs to this model name
    project = Project(name="p", sources=[source], models=[model], insights=[insight], dashboards=[])
    dag = project.dag()
    create_schema_file(model, str(tmpdir))
    builder = InsightQueryBuilder(insight, dag, str(tmpdir))
    builder.resolve()
    return builder


def _sort_keys(builder):
    return [k for k, _ in builder.resolved_query_statements if k == "sort"]


def test_line_mode_gets_default_x_sort(tmpdir, create_schema_file):
    # A line-mode insight (mode includes "lines") with NO explicit sort must get
    # a default sort injected, and the built query must ORDER BY. Reverting the
    # fix leaves resolved_query_statements with zero "sort" entries -> fails.
    insight = Insight(
        name="line_insight",
        props=InsightProps(
            type="scatter",
            mode="lines+markers",
            x="?{${ref(line_model).x}}",
            y="?{${ref(line_model).y}}",
        ),
    )
    builder = _build(insight, tmpdir, create_schema_file)
    assert len(_sort_keys(builder)) == 1
    query_info = builder.build()
    # The ORDER BY lands in the pre_query (the source query that writes the
    # sorted parquet); post_query is a bare `SELECT * FROM parquet` that reads
    # it back in order.
    built_sql = f"{query_info.pre_query or ''} {query_info.post_query or ''}"
    assert "ORDER BY" in built_sql.upper()


def test_marker_only_scatter_gets_no_default_sort(tmpdir, create_schema_file):
    # A marker-only scatter is a point cloud — never reorder it.
    insight = Insight(
        name="markers_insight",
        props=InsightProps(
            type="scatter",
            mode="markers",
            x="?{${ref(line_model).x}}",
            y="?{${ref(line_model).y}}",
        ),
    )
    builder = _build(insight, tmpdir, create_schema_file)
    assert _sort_keys(builder) == []


def test_bar_gets_no_default_sort(tmpdir, create_schema_file):
    insight = Insight(
        name="bar_insight",
        props=InsightProps(
            type="bar",
            x="?{${ref(line_model).x}}",
            y="?{${ref(line_model).y}}",
        ),
    )
    builder = _build(insight, tmpdir, create_schema_file)
    assert _sort_keys(builder) == []


def test_explicit_sort_is_not_overridden(tmpdir, create_schema_file):
    # A line insight that already declares a sort keeps exactly that one sort.
    insight = Insight(
        name="explicit_sort_insight",
        props=InsightProps(
            type="scatter",
            mode="lines",
            x="?{${ref(line_model).x}}",
            y="?{${ref(line_model).y}}",
        ),
        interactions=[InsightInteraction(sort="?{${ref(line_model).y} DESC}")],
    )
    builder = _build(insight, tmpdir, create_schema_file)
    assert len(_sort_keys(builder)) == 1
