"""An aggregate with FILTER (WHERE ...) is still an aggregate: its predicate
column must not become a GROUP BY key (it split every group into two rows)."""

import json
import os

import duckdb
import pytest
import sqlglot
from sqlglot import exp

from tests.factories.model_factories import SourceFactory
from visivo.models.insight import Insight
from visivo.models.models.sql_model import SqlModel
from visivo.models.project import Project
from visivo.models.props.insight_props import InsightProps
from visivo.query.sqlglot_utils import find_non_aggregated_expressions


@pytest.mark.parametrize(
    "expression",
    [
        "SUM(mrr) FILTER (WHERE mrr > 0)",
        "COUNT(mrr) FILTER (WHERE mrr > 0)",
        "AVG(mrr) FILTER (WHERE mrr > 0 AND plan = 'pro')",
        "COUNT(*) FILTER (WHERE mrr > 0)",
        "SUM(mrr) FILTER (WHERE mrr > 0) / COUNT(mrr) FILTER (WHERE mrr > 0)",
    ],
)
def test_filtered_aggregate_has_no_non_aggregated_expressions(expression):
    parsed = sqlglot.parse_one(expression, dialect="duckdb")
    assert find_non_aggregated_expressions(parsed, dialect="duckdb") == []


def test_filtered_aggregate_keeps_real_dimension_as_group_key():
    parsed = sqlglot.parse_one(
        "SELECT quarter, SUM(mrr) FILTER (WHERE mrr > 0) FROM t", dialect="duckdb"
    )
    assert find_non_aggregated_expressions(parsed, dialect="duckdb") == ["quarter"]


def test_case_inside_sum_control_is_aggregated():
    parsed = sqlglot.parse_one("SUM(CASE WHEN mrr > 0 THEN mrr END)", dialect="duckdb")
    assert find_non_aggregated_expressions(parsed, dialect="duckdb") == []


def _build_sql(tmpdir, y_expression):
    source = SourceFactory()
    model = SqlModel(name="m", sql="SELECT * FROM t", source=f"ref({source.name})")
    insight = Insight(
        name="bar",
        props=InsightProps(type="bar", x="?{${ref(m).quarter}}", y=f"?{{{y_expression}}}"),
    )
    project = Project(name="p", sources=[source], models=[model], insights=[insight], dashboards=[])
    schema_dir = os.path.join(str(tmpdir), "schemas")
    os.makedirs(schema_dir, exist_ok=True)
    with open(os.path.join(schema_dir, f"{model.name}.json"), "w") as f:
        json.dump({model.name_hash(): {"quarter": "VARCHAR", "mrr": "DOUBLE"}}, f)
    from visivo.query.insight.insight_query_builder import InsightQueryBuilder

    builder = InsightQueryBuilder(insight, project.dag(), str(tmpdir), force_dynamic=True)
    builder.resolve()
    info = builder.build()
    return info.post_query or info.pre_query, model


@pytest.mark.parametrize(
    "y_expression",
    [
        "sum(${ref(m).mrr}) filter (where ${ref(m).mrr} > 0)",
        "count(${ref(m).mrr}) filter (where ${ref(m).mrr} > 0)",
        "avg(${ref(m).mrr}) filter (where ${ref(m).mrr} > 0)",
        "sum(case when ${ref(m).mrr} > 0 then ${ref(m).mrr} end)",
    ],
)
def test_insight_query_returns_one_row_per_group(tmpdir, y_expression):
    sql, model = _build_sql(tmpdir, y_expression)
    group_by = sqlglot.parse_one(sql, dialect="duckdb").find(exp.Group)
    assert len(group_by.expressions) == 1

    con = duckdb.connect()
    con.execute(
        "CREATE TABLE t AS SELECT * FROM (VALUES "
        "('Q1', 10.0), ('Q1', -5.0), ('Q1', 20.0), ('Q2', 7.0), ('Q2', 0.0), ('Q3', -1.0)"
        ") AS v(quarter, mrr)"
    )
    sql = sql.replace(f'"{model.name_hash()}"', "t")
    rows = con.execute(sql).fetchall()
    assert len(rows) == 3, (sql, rows)
