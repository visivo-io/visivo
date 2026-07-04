"""Coverage-focused behavioral tests for RelationGraph public-API surfaces.

These exercise the branches the primary test_relation_graph.py suite doesn't:
the public find_join_path dispatch, get_join_condition, get_connected_models,
suggest_relation, the model1-not-found arm, MST missing-node handling, and the
single-missing-model pairing in the disconnected-tree error.
"""

import json

import pytest

from visivo.models.models.sql_model import SqlModel
from visivo.models.project import Project
from visivo.models.relation import Relation
from visivo.models.sources.duckdb_source import DuckdbSource
from visivo.query.relation_graph import NoJoinPathError, RelationGraph
from visivo.query.resolvers.field_resolver import FieldResolver


def _build_graph(tmpdir, models, relations, columns=None):
    """Build a RelationGraph from a project of SqlModels + relations.

    Writes a schema.json per model so the FieldResolver can resolve each
    relation's condition during graph construction.
    """
    columns = columns or {"id": "INTEGER", "user_id": "INTEGER", "address_id": "INTEGER"}
    source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
    sql_models = [
        SqlModel(name=name, sql=f"SELECT * FROM {name}", source="ref(test_source)")
        for name in models
    ]
    project = Project(
        name="test_project",
        sources=[source],
        models=sql_models,
        relations=relations,
        dashboards=[],
    )
    dag = project.dag()

    schema_base = tmpdir.mkdir("schemas")
    for model in sql_models:
        schema_dir = schema_base.mkdir(model.name)
        schema_dir.join("schema.json").write(json.dumps({model.name_hash(): columns}))

    resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")
    return RelationGraph(dag=dag, field_resolver=resolver)


class TestFindJoinPathDispatch:
    """find_join_path() dispatches on the model count."""

    def test_fewer_than_two_models_returns_empty(self, tmpdir):
        graph = _build_graph(tmpdir, ["orders"], [])
        assert graph.find_join_path(["orders"]) == []
        assert graph.find_join_path([]) == []

    def test_two_models_returns_single_join(self, tmpdir):
        rel = Relation(name="o_u", condition="${ref(orders).user_id} = ${ref(users).id}")
        graph = _build_graph(tmpdir, ["orders", "users"], [rel])

        path = graph.find_join_path(["orders", "users"])

        assert len(path) == 1
        assert {path[0][0], path[0][1]} == {"orders", "users"}

    def test_three_models_uses_spanning_tree(self, tmpdir):
        rel_ou = Relation(name="o_u", condition="${ref(orders).user_id} = ${ref(users).id}")
        rel_ua = Relation(name="u_a", condition="${ref(users).address_id} = ${ref(addresses).id}")
        graph = _build_graph(tmpdir, ["orders", "users", "addresses"], [rel_ou, rel_ua])

        path = graph.find_join_path(["orders", "users", "addresses"])

        # A linear chain of 3 models needs exactly 2 joins.
        assert len(path) == 2


class TestModelNotFoundArms:
    def test_first_model_missing_raises(self, tmpdir):
        """The model1-not-in-graph guard (distinct from the model2 guard)."""
        graph = _build_graph(tmpdir, ["orders"], [])
        with pytest.raises(NoJoinPathError) as exc:
            graph._find_path_between_two("ghost", "orders")
        assert exc.value.model_a == "ghost"
        assert "not found in relation graph" in str(exc.value)

    def test_spanning_tree_missing_model_raises(self, tmpdir):
        graph = _build_graph(tmpdir, ["orders"], [])
        with pytest.raises(NoJoinPathError) as exc:
            graph._find_minimum_spanning_tree(["orders", "ghost"])
        assert exc.value.model_a == "ghost"

    def test_single_disconnected_model_pairs_with_connected(self, tmpdir):
        """One isolated node among an otherwise-connected set: the error pairs
        the missing model with a connected one so the inline builder has two
        endpoints (covers the len(missing) < 2 branch)."""
        rel = Relation(name="o_u", condition="${ref(orders).user_id} = ${ref(users).id}")
        # addresses is a node but has NO relation → isolated.
        graph = _build_graph(tmpdir, ["orders", "users", "addresses"], [rel])

        with pytest.raises(NoJoinPathError) as exc:
            graph._find_minimum_spanning_tree(["orders", "users", "addresses"])

        assert exc.value.model_a == "addresses"
        assert exc.value.model_b in {"orders", "users"}


class TestDirectAccessors:
    def test_get_join_condition_returns_raw_for_direct_edge(self, tmpdir):
        rel = Relation(name="o_u", condition="${ref(orders).user_id} = ${ref(users).id}")
        graph = _build_graph(tmpdir, ["orders", "users"], [rel])

        condition = graph.get_join_condition("orders", "users")
        assert condition == "${ref(orders).user_id} = ${ref(users).id}"

    def test_get_join_condition_none_when_no_direct_edge(self, tmpdir):
        graph = _build_graph(tmpdir, ["orders", "users"], [])
        assert graph.get_join_condition("orders", "users") is None

    def test_get_connected_models_walks_the_chain(self, tmpdir):
        rel_ou = Relation(name="o_u", condition="${ref(orders).user_id} = ${ref(users).id}")
        rel_ua = Relation(name="u_a", condition="${ref(users).address_id} = ${ref(addresses).id}")
        graph = _build_graph(tmpdir, ["orders", "users", "addresses"], [rel_ou, rel_ua])

        # From orders you can reach users (direct) and addresses (transitive),
        # but not the starting node itself.
        assert graph.get_connected_models("orders") == {"users", "addresses"}

    def test_get_connected_models_unknown_returns_empty(self, tmpdir):
        graph = _build_graph(tmpdir, ["orders"], [])
        assert graph.get_connected_models("ghost") == set()

    def test_suggest_relation_returns_template(self, tmpdir):
        graph = _build_graph(tmpdir, ["orders", "users"], [])
        suggestion = graph.suggest_relation("orders", "users")
        assert "orders" in suggestion and "users" in suggestion
        assert suggestion.startswith("#")
