"""Type inference on resolved, aliased insight props across source dialects.

The builder infers the SQL type of each resolved prop to decide the default
line-chart sort and to validate single-index slices. Each resolved prop carries
an alias quoted in its source's dialect (backticks on MySQL and BigQuery).
"""

import json
import os

import pytest

from visivo.models.insight import Insight
from visivo.models.models.sql_model import SqlModel
from visivo.models.project import Project
from visivo.models.props.insight_props import InsightProps
from visivo.query.insight.insight_query_builder import InsightQueryBuilder
from tests.factories.model_factories import (
    BigQuerySourceFactory,
    DuckdbSourceFactory,
    MysqlSourceFactory,
    RedshiftSourceFactory,
    SourceFactory,
)

SOURCE_FACTORIES = [
    pytest.param(SourceFactory, id="sqlite"),
    pytest.param(DuckdbSourceFactory, id="duckdb"),
    pytest.param(RedshiftSourceFactory, id="redshift"),
    pytest.param(MysqlSourceFactory, id="mysql"),
    pytest.param(BigQuerySourceFactory, id="bigquery"),
]

SCHEMA = {"x": "INTEGER", "y": "INTEGER", "as_of": "DATE", "label": "VARCHAR"}


def _builder(tmpdir, source_factory, props):
    source = source_factory()
    model = SqlModel(name="m", sql="SELECT * FROM t", source=f"ref({source.name})")
    insight = Insight(name="i", props=InsightProps(**props))
    project = Project(name="p", sources=[source], models=[model], insights=[insight], dashboards=[])
    schema_dir = os.path.join(str(tmpdir), "schemas")
    os.makedirs(schema_dir, exist_ok=True)
    with open(os.path.join(schema_dir, f"{model.name}.json"), "w") as f:
        json.dump({model.name_hash(): SCHEMA}, f)
    builder = InsightQueryBuilder(insight, project.dag(), str(tmpdir))
    builder.resolve()
    return builder


def _line_chart_is_default_sorted(tmpdir, source_factory, x):
    builder = _builder(tmpdir, source_factory, {"type": "scatter", "x": x, "y": "?{${ref(m).y}}"})
    return any(key == "sort" for key, _ in builder.resolved_query_statements)


@pytest.mark.parametrize("source_factory", SOURCE_FACTORIES)
@pytest.mark.parametrize(
    "x",
    [
        "?{${ref(m).x}}",
        "?{${ref(m).as_of}}",
        "?{${ref(m).x} as lbl}",
        '?{${ref(m).x} AS "Quoted Name"}',
        "?{CASE WHEN ${ref(m).x} > 1 THEN 1 ELSE 2 END AS bucket}",
        "?{CAST(${ref(m).label} AS INTEGER)}",
    ],
)
def test_line_chart_with_orderable_x_is_default_sorted(tmpdir, source_factory, x):
    assert _line_chart_is_default_sorted(tmpdir, source_factory, x)


@pytest.mark.parametrize("source_factory", SOURCE_FACTORIES)
@pytest.mark.parametrize(
    "x",
    [
        "?{${ref(m).label}}",
        "?{'a AS b' AS lbl}",
        "?{CONCAT(${ref(m).label}, ' AS x')}",
    ],
)
def test_line_chart_with_string_x_keeps_source_order(tmpdir, source_factory, x):
    assert not _line_chart_is_default_sorted(tmpdir, source_factory, x)


@pytest.mark.parametrize("source_factory", SOURCE_FACTORIES)
def test_scalar_slice_of_numeric_column_into_string_prop_is_rejected(tmpdir, source_factory):
    builder = _builder(
        tmpdir,
        source_factory,
        {"type": "indicator", "value": "?{${ref(m).y}}", "title": {"text": "?{${ref(m).x}}[0]"}},
    )
    with pytest.raises(ValueError, match="Type mismatch on 'props.title.text'"):
        builder.build()


@pytest.mark.parametrize("source_factory", SOURCE_FACTORIES)
def test_scalar_slice_of_string_column_into_string_prop_is_accepted(tmpdir, source_factory):
    builder = _builder(
        tmpdir,
        source_factory,
        {
            "type": "indicator",
            "value": "?{${ref(m).y}}",
            "title": {"text": "?{${ref(m).label}}[0]"},
        },
    )
    assert builder.build().props_slices == {"props.title.text": "[0]"}
