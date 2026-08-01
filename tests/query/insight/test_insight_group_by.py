"""Tests for GROUP BY emission (smoke-test bug #2).

A pure projection — a histogram/box/violin plotting RAW observations — must NOT
auto-GROUP-BY its selected columns, or it silently dedupes raw rows to distinct
value-tuples and distorts the distribution (e.g. a female median total_kg of
320 became 339 once deduped). GROUP BY is emitted only when the SELECT actually
aggregates (or a HAVING is present).
"""

import json
import os

import pytest

from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps
from tests.factories.model_factories import SourceFactory


@pytest.fixture
def build_sql(tmpdir):
    def _build(insight, schema, force_dynamic=False):
        source = SourceFactory()
        model = SqlModel(name="m", sql="SELECT * FROM t", source=f"ref({source.name})")
        project = Project(
            name="p", sources=[source], models=[model], insights=[insight], dashboards=[]
        )
        dag = project.dag()
        schema_dir = os.path.join(str(tmpdir), "schemas")
        os.makedirs(schema_dir, exist_ok=True)
        with open(os.path.join(schema_dir, f"{model.name}.json"), "w") as f:
            json.dump({model.name_hash(): schema}, f)
        from visivo.query.insight.insight_query_builder import InsightQueryBuilder

        builder = InsightQueryBuilder(insight, dag, str(tmpdir), force_dynamic=force_dynamic)
        builder.resolve()
        query_info = builder.build()
        return f"{query_info.pre_query or ''}\n{query_info.post_query or ''}".upper()

    return _build


def test_histogram_projection_emits_no_group_by(build_sql):
    # x = raw column, no aggregate -> raw rows, NO GROUP BY. Reverting the fix
    # re-adds `GROUP BY bodyweight`, deduping the observations.
    insight = Insight(
        name="hist",
        props=InsightProps(type="histogram", x="?{${ref(m).bodyweight}}"),
    )
    sql = build_sql(insight, {"bodyweight": "DOUBLE", "sex": "VARCHAR"})
    assert "GROUP BY" not in sql, sql


def test_box_raw_values_emit_no_group_by(build_sql):
    # x = category, y = raw value, no aggregate -> the raw values per category
    # must survive so client-side quartiles/median are correct.
    insight = Insight(
        name="box",
        props=InsightProps(type="box", x="?{${ref(m).sex}}", y="?{${ref(m).total}}"),
    )
    sql = build_sql(insight, {"sex": "VARCHAR", "total": "DOUBLE"})
    assert "GROUP BY" not in sql, sql


def test_violin_raw_values_emit_no_group_by(build_sql):
    insight = Insight(
        name="violin",
        props=InsightProps(type="violin", x="?{${ref(m).sex}}", y="?{${ref(m).bodyweight}}"),
    )
    sql = build_sql(insight, {"sex": "VARCHAR", "bodyweight": "DOUBLE"})
    assert "GROUP BY" not in sql, sql


def test_aggregate_bar_still_groups_by_its_dimension(build_sql):
    # An actual aggregate (count) over a dimension MUST still GROUP BY — the fix
    # only suppresses grouping for pure projections.
    insight = Insight(
        name="bar",
        props=InsightProps(type="bar", x="?{${ref(m).sex}}", y="?{count(${ref(m).total})}"),
    )
    sql = build_sql(insight, {"sex": "VARCHAR", "total": "DOUBLE"})
    assert "GROUP BY" in sql, sql


def test_dynamic_preview_path_projection_emits_no_group_by(build_sql):
    # The browser-preview (force_dynamic) path uses a separate string-assembly
    # builder — it must apply the same rule so an Explorer histogram preview
    # isn't silently deduped either.
    insight = Insight(
        name="hist_dyn",
        props=InsightProps(type="histogram", x="?{${ref(m).bodyweight}}"),
    )
    sql = build_sql(insight, {"bodyweight": "DOUBLE"}, force_dynamic=True)
    assert "GROUP BY" not in sql, sql


def test_dynamic_preview_path_aggregate_still_groups(build_sql):
    insight = Insight(
        name="bar_dyn",
        props=InsightProps(type="bar", x="?{${ref(m).sex}}", y="?{count(${ref(m).total})}"),
    )
    sql = build_sql(insight, {"sex": "VARCHAR", "total": "DOUBLE"}, force_dynamic=True)
    assert "GROUP BY" in sql, sql


def test_dynamic_aggregate_with_inner_cast_still_groups(build_sql):
    # Regression (adversarial review): an aggregate containing an inner ` AS `
    # (CAST(x AS DOUBLE)) must still be DETECTED as an aggregate in the dynamic
    # path — otherwise the needed GROUP BY is dropped and the Explorer live
    # preview errors ("column must appear in the GROUP BY clause"). The old
    # split(" AS ")[0] truncated the aggregate into unbalanced, unparseable SQL.
    insight = Insight(
        name="cast_agg",
        props=InsightProps(
            type="bar",
            x="?{${ref(m).sex}}",
            y="?{SUM(CAST(${ref(m).total} AS DOUBLE))}",
        ),
    )
    sql = build_sql(insight, {"sex": "VARCHAR", "total": "VARCHAR"}, force_dynamic=True)
    assert "GROUP BY" in sql, sql


def test_non_aggregate_window_emits_no_group_by(build_sql):
    # A pure non-aggregate window (ROW_NUMBER) needs no GROUP BY — the fix
    # correctly leaves it ungrouped (a genuine improvement to lock in).
    insight = Insight(
        name="win",
        props=InsightProps(
            type="scatter",
            x="?{${ref(m).sex}}",
            y="?{ROW_NUMBER() OVER (ORDER BY ${ref(m).total})}",
        ),
    )
    sql = build_sql(insight, {"sex": "VARCHAR", "total": "DOUBLE"})
    assert "GROUP BY" not in sql, sql


def test_lone_aggregate_with_no_dimension_emits_no_group_by(build_sql):
    # A lone aggregate with no non-aggregate column has nothing to group by.
    insight = Insight(
        name="lone_count",
        props=InsightProps(type="indicator", value="?{count(${ref(m).total})}"),
    )
    sql = build_sql(insight, {"total": "DOUBLE"})
    assert "GROUP BY" not in sql, sql
