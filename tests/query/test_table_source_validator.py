"""Tests for the compile-phase single-source check on tables (VIS-1462 T7a)."""

import networkx as nx
import pytest

from tests.factories.model_factories import (
    InsightFactory,
    ProjectFactory,
    RelationFactory,
    SourceFactory,
    SqlModelFactory,
)
from visivo.models.table import Table
from visivo.query.table_source_validator import (
    validate_project_table_sources,
    validate_table_sources,
)


def _graph(*edges, nodes=()):
    g = nx.Graph()
    g.add_nodes_from(nodes)
    g.add_edges_from(edges)
    return g


# --- validate_table_sources (pure) -------------------------------------------


def test_single_source_is_accepted():
    assert validate_table_sources("t", {"a"}, set(), _graph(nodes=["a"])) is None


def test_no_refs_is_accepted():
    assert validate_table_sources("t", set(), set(), _graph()) is None


def test_two_unrelated_models_are_rejected_naming_both():
    error = validate_table_sources(
        "t", {"orders", "users"}, set(), _graph(nodes=["orders", "users"])
    )
    assert error is not None
    assert "'orders'" in error and "'users'" in error
    assert "Table 't'" in error
    assert "no relationship" in error


def test_two_related_models_are_accepted():
    # A declared relation path exists → leave it to VIS-1467's join.
    assert (
        validate_table_sources("t", {"orders", "users"}, set(), _graph(("orders", "users"))) is None
    )


def test_transitively_related_models_are_accepted():
    g = _graph(("a", "b"), ("b", "c"))
    assert validate_table_sources("t", {"a", "c"}, set(), g) is None


def test_two_insights_are_rejected_even_when_models_are_related():
    g = _graph(("a", "b"))
    error = validate_table_sources("t", {"ins-a", "ins-b"}, {"ins-a", "ins-b"}, g)
    assert error is not None
    assert "'ins-a'" in error and "'ins-b'" in error


def test_insight_mixed_with_model_is_rejected():
    error = validate_table_sources("t", {"ins", "m"}, {"ins"}, _graph(nodes=["m"]))
    assert error is not None
    assert "'ins'" in error and "'m'" in error


def test_unknown_name_is_rejected():
    # A ref to something that is neither a model node nor an insight cannot be related.
    error = validate_table_sources("t", {"a", "ghost"}, set(), _graph(nodes=["a"]))
    assert error is not None


# --- validate_project_table_sources (over a project DAG) ----------------------


def _project(tables, models=None, insights=None, relations=None):
    source = SourceFactory(name="s")
    models = models or [
        SqlModelFactory(name="a", source="ref(s)"),
        SqlModelFactory(name="b", source="ref(s)"),
    ]
    project = ProjectFactory(
        sources=[source],
        models=models,
        insights=insights or [],
        relations=relations or [],
        tables=tables,
        dashboards=[],
    )
    return project


def test_project_with_no_tables_returns_none():
    assert validate_project_table_sources(_project([])) is None


def test_project_single_source_tables_return_none():
    project = _project(
        [
            Table(name="sel", columns=["${ref(a).x} as X", "${ref(a).y}"]),
            Table(
                name="piv",
                columns=["${ref(b).region}"],
                rows=["${ref(b).product}"],
                values=["sum(${ref(b).revenue})"],
            ),
            Table(name="plain", data="ref(a)"),
        ]
    )
    assert validate_project_table_sources(project) is None


def test_project_two_model_table_is_rejected_with_both_names_and_fix():
    project = _project(
        [
            Table(name="ok", columns=["${ref(a).x}"]),
            Table(name="mixed", columns=["${ref(a).x}", "${ref(b).y}"]),
        ]
    )
    error = validate_project_table_sources(project)
    assert error is not None
    assert "Table 'mixed'" in error
    assert "'a'" in error and "'b'" in error
    assert "'ok'" not in error
    assert "1 table reads" in error
    assert "To fix" in error


def test_project_two_model_table_across_rows_and_values_is_rejected():
    project = _project(
        [
            Table(
                name="piv",
                columns=["${ref(a).region}"],
                rows=["${ref(a).product}"],
                values=["sum(${ref(b).revenue})"],
            ),
        ]
    )
    error = validate_project_table_sources(project)
    assert error is not None and "'a'" in error and "'b'" in error


def test_project_related_models_are_accepted():
    relation = RelationFactory(name="a_b", condition="${ref(a).id} = ${ref(b).a_id}")
    project = _project(
        [Table(name="joined", columns=["${ref(a).x}", "${ref(b).y}"])],
        relations=[relation],
    )
    assert validate_project_table_sources(project) is None


def test_project_two_insight_table_is_rejected():
    model = SqlModelFactory(name="a", source="ref(s)")
    insight_a = InsightFactory(
        name="ins-a", model=None, props={"type": "scatter", "x": "?{${ref(a).x}}"}
    )
    insight_b = InsightFactory(
        name="ins-b", model=None, props={"type": "scatter", "x": "?{${ref(a).x}}"}
    )
    project = _project(
        [Table(name="two-ins", columns=["${ref(ins-a).x}", "${ref(ins-b).x}"])],
        models=[model],
        insights=[insight_a, insight_b],
    )
    error = validate_project_table_sources(project)
    assert error is not None
    assert "'ins-a'" in error and "'ins-b'" in error


def test_project_counts_multiple_broken_tables():
    project = _project(
        [
            Table(name="m1", columns=["${ref(a).x}", "${ref(b).y}"]),
            Table(name="m2", columns=["${ref(b).x}"], rows=["${ref(a).y}"], values=["count(*)"]),
        ]
    )
    error = validate_project_table_sources(project)
    assert "2 tables read" in error
    assert "'m1'" in error and "'m2'" in error
