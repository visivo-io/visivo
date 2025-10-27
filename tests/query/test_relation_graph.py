"""
Tests for visivo.query.relation_graph module.

This module tests the RelationGraph class which handles:
- Building a graph of model relationships from declared relations
- Finding optimal join paths between models using BFS
- Detecting ambiguous joins and providing clear error messages
- Generating join plans for multi-model queries
"""

import pytest
import json
from visivo.query.relation_graph import RelationGraph, NoJoinPathError, AmbiguousJoinError
from visivo.query.resolvers.field_resolver import FieldResolver
from visivo.models.models.sql_model import SqlModel
from visivo.models.relation import Relation
from visivo.models.sources.duckdb_source import DuckdbSource
from visivo.models.project import Project
from tests.factories.model_factories import RelationFactory


class TestRelationGraphBasics:
    """Test basic graph building and initialization."""

    def test_build_graph_with_models(self, tmpdir):
        """Test that graph is built with model nodes."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model_a = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")
        model_b = SqlModel(name="users", sql="SELECT * FROM users", source="ref(test_source)")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model_a, model_b],
            dashboards=[],
        )
        dag = project.dag()

        # Create schemas
        schema_base = tmpdir.mkdir("schema")
        for model in [model_a, model_b]:
            model_hash = model.name_hash()
            schema_dir = schema_base.mkdir(model.name)
            schema_file = schema_dir.join("schema.json")
            schema_data = {model_hash: {"id": "INTEGER", "name": "VARCHAR"}}
            schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")
        graph = RelationGraph(dag=dag, field_resolver=resolver)

        # Verify nodes exist
        assert graph.graph.has_node("orders")
        assert graph.graph.has_node("users")

    def test_build_graph_with_relations(self, tmpdir):
        """Test that relations create edges with resolved conditions."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model_a = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")
        model_b = SqlModel(name="users", sql="SELECT * FROM users", source="ref(test_source)")

        relation = Relation(
            name="orders_to_users",
            condition="${ref(orders).user_id} = ${ref(users).id}",
            join_type="inner",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[model_a, model_b],
            relations=[relation],
            dashboards=[],
        )
        dag = project.dag()

        # Create schemas
        schema_base = tmpdir.mkdir("schema")
        for model in [model_a, model_b]:
            model_hash = model.name_hash()
            schema_dir = schema_base.mkdir(model.name)
            schema_file = schema_dir.join("schema.json")
            schema_data = {model_hash: {"id": "INTEGER", "user_id": "INTEGER"}}
            schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")
        graph = RelationGraph(dag=dag, field_resolver=resolver)

        # Verify edge exists
        assert graph.graph.has_edge("orders", "users")
        edge_data = graph.graph.get_edge_data("orders", "users")
        assert edge_data["join_type"] == "inner"
        assert "resolved_condition" in edge_data
        # Resolved condition should not have ${ref} patterns
        assert "${ref" not in edge_data["resolved_condition"]

    def test_graph_node_has_model_reference(self, tmpdir):
        """Test that graph nodes store references to model objects."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model_a = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model_a],
            dashboards=[],
        )
        dag = project.dag()

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")
        graph = RelationGraph(dag=dag, field_resolver=resolver)

        # Verify node has model reference
        node_data = graph.graph.nodes["orders"]
        assert "model" in node_data
        assert node_data["model"].name == "orders"


class TestTwoModelJoins:
    """Test finding join paths between two models."""

    def test_find_path_between_two_direct(self, tmpdir):
        """Test finding direct path between two models."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model_a = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")
        model_b = SqlModel(name="users", sql="SELECT * FROM users", source="ref(test_source)")

        relation = Relation(
            name="orders_to_users",
            condition="${ref(orders).user_id} = ${ref(users).id}",
            join_type="inner",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[model_a, model_b],
            relations=[relation],
            dashboards=[],
        )
        dag = project.dag()

        # Create schemas
        schema_base = tmpdir.mkdir("schema")
        for model in [model_a, model_b]:
            model_hash = model.name_hash()
            schema_dir = schema_base.mkdir(model.name)
            schema_file = schema_dir.join("schema.json")
            schema_data = {model_hash: {"id": "INTEGER", "user_id": "INTEGER"}}
            schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")
        graph = RelationGraph(dag=dag, field_resolver=resolver)

        # Find path
        path = graph._find_path_between_two("orders", "users")

        assert len(path) == 1
        from_model, to_model, condition = path[0]
        assert from_model == "orders"
        assert to_model == "users"
        assert "${ref" not in condition  # Should be resolved

    def test_find_path_between_two_indirect(self, tmpdir):
        """Test finding indirect path A-B-C for query on A and C."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model_a = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")
        model_b = SqlModel(name="users", sql="SELECT * FROM users", source="ref(test_source)")
        model_c = SqlModel(
            name="addresses", sql="SELECT * FROM addresses", source="ref(test_source)"
        )

        relation_ab = Relation(
            name="orders_to_users",
            condition="${ref(orders).user_id} = ${ref(users).id}",
        )
        relation_bc = Relation(
            name="users_to_addresses",
            condition="${ref(users).address_id} = ${ref(addresses).id}",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[model_a, model_b, model_c],
            relations=[relation_ab, relation_bc],
            dashboards=[],
        )
        dag = project.dag()

        # Create schemas
        schema_base = tmpdir.mkdir("schema")
        for model in [model_a, model_b, model_c]:
            model_hash = model.name_hash()
            schema_dir = schema_base.mkdir(model.name)
            schema_file = schema_dir.join("schema.json")
            schema_data = {
                model_hash: {"id": "INTEGER", "user_id": "INTEGER", "address_id": "INTEGER"}
            }
            schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")
        graph = RelationGraph(dag=dag, field_resolver=resolver)

        # Find path from orders to addresses (should go through users)
        path = graph._find_path_between_two("orders", "addresses")

        assert len(path) == 2  # Two joins: orders->users, users->addresses
        # Verify the path connects properly
        assert path[0][0] == "orders"
        assert path[0][1] == "users"
        assert path[1][0] == "users"
        assert path[1][1] == "addresses"

    def test_no_path_raises_error(self, tmpdir):
        """Test that disconnected models raise NoJoinPathError."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model_a = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")
        model_b = SqlModel(name="users", sql="SELECT * FROM users", source="ref(test_source)")

        # No relations defined - models are disconnected
        project = Project(
            name="test_project",
            sources=[source],
            models=[model_a, model_b],
            dashboards=[],
        )
        dag = project.dag()

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")
        graph = RelationGraph(dag=dag, field_resolver=resolver)

        # Should raise error
        with pytest.raises(NoJoinPathError) as exc_info:
            graph._find_path_between_two("orders", "users")

        assert "No join path found" in str(exc_info.value)

    def test_nonexistent_model_raises_error(self, tmpdir):
        """Test that unknown model raises NoJoinPathError."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model_a = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model_a],
            dashboards=[],
        )
        dag = project.dag()

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")
        graph = RelationGraph(dag=dag, field_resolver=resolver)

        # Should raise error for nonexistent model
        with pytest.raises(NoJoinPathError) as exc_info:
            graph._find_path_between_two("orders", "nonexistent")

        assert "not found in relation graph" in str(exc_info.value)


class TestAmbiguousPaths:
    """Test detection and reporting of ambiguous join paths."""

    def test_ambiguous_path_raises_error(self, tmpdir):
        """Test that multiple equal-length paths raise AmbiguousJoinError."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")

        # Create diamond pattern: A connects to both B and C, both connect to D
        model_a = SqlModel(name="a", sql="SELECT * FROM a", source="ref(test_source)")
        model_b = SqlModel(name="b", sql="SELECT * FROM b", source="ref(test_source)")
        model_c = SqlModel(name="c", sql="SELECT * FROM c", source="ref(test_source)")
        model_d = SqlModel(name="d", sql="SELECT * FROM d", source="ref(test_source)")

        # Two equal-length paths from A to D: A-B-D and A-C-D
        rel_ab = Relation(name="a_to_b", condition="${ref(a).id} = ${ref(b).a_id}")
        rel_ac = Relation(name="a_to_c", condition="${ref(a).id} = ${ref(c).a_id}")
        rel_bd = Relation(name="b_to_d", condition="${ref(b).id} = ${ref(d).b_id}")
        rel_cd = Relation(name="c_to_d", condition="${ref(c).id} = ${ref(d).c_id}")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model_a, model_b, model_c, model_d],
            relations=[rel_ab, rel_ac, rel_bd, rel_cd],
            dashboards=[],
        )
        dag = project.dag()

        # Create schemas
        schema_base = tmpdir.mkdir("schema")
        for model in [model_a, model_b, model_c, model_d]:
            model_hash = model.name_hash()
            schema_dir = schema_base.mkdir(model.name)
            schema_file = schema_dir.join("schema.json")
            schema_data = {
                model_hash: {
                    "id": "INTEGER",
                    "a_id": "INTEGER",
                    "b_id": "INTEGER",
                    "c_id": "INTEGER",
                }
            }
            schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")
        graph = RelationGraph(dag=dag, field_resolver=resolver)

        # Should raise ambiguous error
        with pytest.raises(AmbiguousJoinError) as exc_info:
            graph._find_path_between_two("a", "d")

        assert "Multiple join paths found" in str(exc_info.value)

    def test_ambiguous_error_shows_alternatives(self, tmpdir):
        """Test that ambiguous error message shows alternative paths.

        Note: This test intentionally doesn't raise AmbiguousJoinError because
        networkx shortest_path algorithm will deterministically choose one path
        when there are multiple equal-length paths. The ambiguous error only occurs
        when there are truly different shortest paths (like in a diamond pattern).

        This test now verifies that when there IS an ambiguous case, the error
        message contains helpful information.
        """
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")

        # Create square pattern: A connects to B and C, both connect to D
        # This creates two equal paths A->B->D and A->C->D
        model_a = SqlModel(name="a", sql="SELECT * FROM a", source="ref(test_source)")
        model_b = SqlModel(name="b", sql="SELECT * FROM b", source="ref(test_source)")
        model_c = SqlModel(name="c", sql="SELECT * FROM c", source="ref(test_source)")
        model_d = SqlModel(name="d", sql="SELECT * FROM d", source="ref(test_source)")

        rel_ab = Relation(name="a_to_b", condition="${ref(a).id} = ${ref(b).a_id}")
        rel_ac = Relation(name="a_to_c", condition="${ref(a).id} = ${ref(c).a_id}")
        rel_bd = Relation(name="b_to_d", condition="${ref(b).id} = ${ref(d).b_id}")
        rel_cd = Relation(name="c_to_d", condition="${ref(c).id} = ${ref(d).c_id}")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model_a, model_b, model_c, model_d],
            relations=[rel_ab, rel_ac, rel_bd, rel_cd],
            dashboards=[],
        )
        dag = project.dag()

        # Create schemas
        schema_base = tmpdir.mkdir("schema")
        for model in [model_a, model_b, model_c, model_d]:
            model_hash = model.name_hash()
            schema_dir = schema_base.mkdir(model.name)
            schema_file = schema_dir.join("schema.json")
            schema_data = {
                model_hash: {
                    "id": "INTEGER",
                    "a_id": "INTEGER",
                    "b_id": "INTEGER",
                    "c_id": "INTEGER",
                }
            }
            schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")
        graph = RelationGraph(dag=dag, field_resolver=resolver)

        # Should raise ambiguous error with path descriptions
        with pytest.raises(AmbiguousJoinError) as exc_info:
            graph._find_path_between_two("a", "d")

        error_msg = str(exc_info.value)
        assert "Multiple join paths found" in error_msg
        # Should show at least one path option
        assert "->" in error_msg


class TestMultiModelJoins:
    """Test minimum spanning tree for 3+ model joins."""

    def test_minimum_spanning_tree_three_linear(self, tmpdir):
        """Test MST for three models in linear chain A-B-C."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")

        model_a = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")
        model_b = SqlModel(name="users", sql="SELECT * FROM users", source="ref(test_source)")
        model_c = SqlModel(
            name="addresses", sql="SELECT * FROM addresses", source="ref(test_source)"
        )

        rel_ab = Relation(
            name="orders_to_users",
            condition="${ref(orders).user_id} = ${ref(users).id}",
        )
        rel_bc = Relation(
            name="users_to_addresses",
            condition="${ref(users).address_id} = ${ref(addresses).id}",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[model_a, model_b, model_c],
            relations=[rel_ab, rel_bc],
            dashboards=[],
        )
        dag = project.dag()

        # Create schemas
        schema_base = tmpdir.mkdir("schema")
        for model in [model_a, model_b, model_c]:
            model_hash = model.name_hash()
            schema_dir = schema_base.mkdir(model.name)
            schema_file = schema_dir.join("schema.json")
            schema_data = {
                model_hash: {"id": "INTEGER", "user_id": "INTEGER", "address_id": "INTEGER"}
            }
            schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")
        graph = RelationGraph(dag=dag, field_resolver=resolver)

        # Find MST
        joins = graph._find_minimum_spanning_tree(["orders", "users", "addresses"])

        # Should have exactly 2 joins to connect 3 models
        assert len(joins) == 2

        # Verify all models are connected
        models_in_joins = set()
        for from_m, to_m, _condition in joins:
            models_in_joins.add(from_m)
            models_in_joins.add(to_m)
        assert models_in_joins == {"orders", "users", "addresses"}

    def test_minimum_spanning_tree_three_star(self, tmpdir):
        """Test MST for star pattern: A-B, B-C, B-D."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")

        model_a = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")
        model_b = SqlModel(name="users", sql="SELECT * FROM users", source="ref(test_source)")
        model_c = SqlModel(
            name="addresses", sql="SELECT * FROM addresses", source="ref(test_source)"
        )
        model_d = SqlModel(name="payments", sql="SELECT * FROM payments", source="ref(test_source)")

        # B is the center
        rel_ab = Relation(name="a_to_b", condition="${ref(orders).user_id} = ${ref(users).id}")
        rel_bc = Relation(
            name="b_to_c", condition="${ref(users).address_id} = ${ref(addresses).id}"
        )
        rel_bd = Relation(name="b_to_d", condition="${ref(users).id} = ${ref(payments).user_id}")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model_a, model_b, model_c, model_d],
            relations=[rel_ab, rel_bc, rel_bd],
            dashboards=[],
        )
        dag = project.dag()

        # Create schemas
        schema_base = tmpdir.mkdir("schema")
        for model in [model_a, model_b, model_c, model_d]:
            model_hash = model.name_hash()
            schema_dir = schema_base.mkdir(model.name)
            schema_file = schema_dir.join("schema.json")
            schema_data = {
                model_hash: {"id": "INTEGER", "user_id": "INTEGER", "address_id": "INTEGER"}
            }
            schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")
        graph = RelationGraph(dag=dag, field_resolver=resolver)

        # Find MST
        joins = graph._find_minimum_spanning_tree(["orders", "users", "addresses", "payments"])

        # Should have exactly 3 joins to connect 4 models
        assert len(joins) == 3

    def test_disconnected_components_in_mst(self, tmpdir):
        """Test that MST fails when models are in disconnected components."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")

        # Two disconnected pairs: A-B and C-D
        model_a = SqlModel(name="a", sql="SELECT * FROM a", source="ref(test_source)")
        model_b = SqlModel(name="b", sql="SELECT * FROM b", source="ref(test_source)")
        model_c = SqlModel(name="c", sql="SELECT * FROM c", source="ref(test_source)")
        model_d = SqlModel(name="d", sql="SELECT * FROM d", source="ref(test_source)")

        rel_ab = Relation(name="a_to_b", condition="${ref(a).id} = ${ref(b).a_id}")
        rel_cd = Relation(name="c_to_d", condition="${ref(c).id} = ${ref(d).c_id}")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model_a, model_b, model_c, model_d],
            relations=[rel_ab, rel_cd],
            dashboards=[],
        )
        dag = project.dag()

        # Create schemas
        schema_base = tmpdir.mkdir("schema")
        for model in [model_a, model_b, model_c, model_d]:
            model_hash = model.name_hash()
            schema_dir = schema_base.mkdir(model.name)
            schema_file = schema_dir.join("schema.json")
            schema_data = {model_hash: {"id": "INTEGER", "a_id": "INTEGER", "c_id": "INTEGER"}}
            schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")
        graph = RelationGraph(dag=dag, field_resolver=resolver)

        # Should fail when trying to connect all four models
        with pytest.raises(NoJoinPathError):
            graph._find_minimum_spanning_tree(["a", "b", "c", "d"])


class TestJoinPlan:
    """Test join plan generation for SQL queries."""

    def test_get_join_plan_single_model(self, tmpdir):
        """Test that single model returns empty joins."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model_a = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model_a],
            dashboards=[],
        )
        dag = project.dag()

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")
        graph = RelationGraph(dag=dag, field_resolver=resolver)

        plan = graph.get_join_plan(["orders"])

        assert plan["from_model"] == "orders"
        assert plan["joins"] == []

    def test_get_join_plan_two_models(self, tmpdir):
        """Test join plan for two models."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model_a = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")
        model_b = SqlModel(name="users", sql="SELECT * FROM users", source="ref(test_source)")

        relation = Relation(
            name="orders_to_users",
            condition="${ref(orders).user_id} = ${ref(users).id}",
            join_type="left",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[model_a, model_b],
            relations=[relation],
            dashboards=[],
        )
        dag = project.dag()

        # Create schemas
        schema_base = tmpdir.mkdir("schema")
        for model in [model_a, model_b]:
            model_hash = model.name_hash()
            schema_dir = schema_base.mkdir(model.name)
            schema_file = schema_dir.join("schema.json")
            schema_data = {model_hash: {"id": "INTEGER", "user_id": "INTEGER"}}
            schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")
        graph = RelationGraph(dag=dag, field_resolver=resolver)

        plan = graph.get_join_plan(["orders", "users"])

        assert plan["from_model"] in ["orders", "users"]
        assert len(plan["joins"]) == 1

        # Verify join structure
        from_m, to_m, condition, join_type = plan["joins"][0]
        assert {from_m, to_m} == {"orders", "users"}
        assert join_type == "left"
        assert "${ref" not in condition  # Should be resolved

    def test_get_join_plan_three_models_central_from(self, tmpdir):
        """Test that most central model is selected for FROM clause."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")

        # Star pattern: users is central, connects to orders and addresses
        model_users = SqlModel(name="users", sql="SELECT * FROM users", source="ref(test_source)")
        model_orders = SqlModel(
            name="orders", sql="SELECT * FROM orders", source="ref(test_source)"
        )
        model_addr = SqlModel(
            name="addresses", sql="SELECT * FROM addresses", source="ref(test_source)"
        )

        rel_uo = Relation(name="u_to_o", condition="${ref(users).id} = ${ref(orders).user_id}")
        rel_ua = Relation(name="u_to_a", condition="${ref(users).id} = ${ref(addresses).user_id}")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model_users, model_orders, model_addr],
            relations=[rel_uo, rel_ua],
            dashboards=[],
        )
        dag = project.dag()

        # Create schemas
        schema_base = tmpdir.mkdir("schema")
        for model in [model_users, model_orders, model_addr]:
            model_hash = model.name_hash()
            schema_dir = schema_base.mkdir(model.name)
            schema_file = schema_dir.join("schema.json")
            schema_data = {model_hash: {"id": "INTEGER", "user_id": "INTEGER"}}
            schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")
        graph = RelationGraph(dag=dag, field_resolver=resolver)

        plan = graph.get_join_plan(["users", "orders", "addresses"])

        # users should be selected as FROM because it has highest degree centrality
        assert plan["from_model"] == "users"
        assert len(plan["joins"]) == 2

    def test_get_join_plan_preserves_join_types(self, tmpdir):
        """Test that JOIN types (INNER/LEFT/RIGHT) are preserved in plan."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model_a = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")
        model_b = SqlModel(name="users", sql="SELECT * FROM users", source="ref(test_source)")

        relation = Relation(
            name="orders_to_users",
            condition="${ref(orders).user_id} = ${ref(users).id}",
            join_type="right",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[model_a, model_b],
            relations=[relation],
            dashboards=[],
        )
        dag = project.dag()

        # Create schemas
        schema_base = tmpdir.mkdir("schema")
        for model in [model_a, model_b]:
            model_hash = model.name_hash()
            schema_dir = schema_base.mkdir(model.name)
            schema_file = schema_dir.join("schema.json")
            schema_data = {model_hash: {"id": "INTEGER", "user_id": "INTEGER"}}
            schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")
        graph = RelationGraph(dag=dag, field_resolver=resolver)

        plan = graph.get_join_plan(["orders", "users"])

        # Verify join type is preserved
        _from, _to, _cond, join_type = plan["joins"][0]
        assert join_type == "right"


class TestValidation:
    """Test graph validation functionality."""

    def test_validate_disconnected_components(self, tmpdir):
        """Test validation detects disconnected model groups."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")

        # Two disconnected pairs
        model_a = SqlModel(name="a", sql="SELECT * FROM a", source="ref(test_source)")
        model_b = SqlModel(name="b", sql="SELECT * FROM b", source="ref(test_source)")
        model_c = SqlModel(name="c", sql="SELECT * FROM c", source="ref(test_source)")
        model_d = SqlModel(name="d", sql="SELECT * FROM d", source="ref(test_source)")

        rel_ab = Relation(name="a_to_b", condition="${ref(a).id} = ${ref(b).id}")
        rel_cd = Relation(name="c_to_d", condition="${ref(c).id} = ${ref(d).id}")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model_a, model_b, model_c, model_d],
            relations=[rel_ab, rel_cd],
            dashboards=[],
        )
        dag = project.dag()

        # Create schemas
        schema_base = tmpdir.mkdir("schema")
        for model in [model_a, model_b, model_c, model_d]:
            model_hash = model.name_hash()
            schema_dir = schema_base.mkdir(model.name)
            schema_file = schema_dir.join("schema.json")
            schema_data = {model_hash: {"id": "INTEGER"}}
            schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")
        graph = RelationGraph(dag=dag, field_resolver=resolver)

        warnings = graph.validate_relations()

        # Should warn about disconnected groups
        assert len(warnings) > 0
        assert any("disconnected" in w.lower() for w in warnings)

    def test_validate_isolated_nodes(self, tmpdir):
        """Test validation detects models with no relations."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")

        model_a = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")
        model_b = SqlModel(name="users", sql="SELECT * FROM users", source="ref(test_source)")
        model_c = SqlModel(name="isolated", sql="SELECT * FROM isolated", source="ref(test_source)")

        # Only connect A and B
        relation = Relation(name="a_to_b", condition="${ref(orders).id} = ${ref(users).id}")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model_a, model_b, model_c],
            relations=[relation],
            dashboards=[],
        )
        dag = project.dag()

        # Create schemas
        schema_base = tmpdir.mkdir("schema")
        for model in [model_a, model_b, model_c]:
            model_hash = model.name_hash()
            schema_dir = schema_base.mkdir(model.name)
            schema_file = schema_dir.join("schema.json")
            schema_data = {model_hash: {"id": "INTEGER"}}
            schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")
        graph = RelationGraph(dag=dag, field_resolver=resolver)

        warnings = graph.validate_relations()

        # Should warn about isolated model
        assert len(warnings) > 0
        assert any("isolated" in w.lower() for w in warnings)


class TestDefaultRelationResolution:
    """Test that is_default flag resolves ambiguous paths."""

    @pytest.mark.xfail(reason="is_default flag resolution not yet fully implemented")
    def test_is_default_flag_resolves_ambiguity(self, tmpdir):
        """
        Test that when multiple paths exist, is_default=True chooses that relation.

        This is the desired behavior but may not be fully implemented yet.
        """
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")

        # Diamond: A-B-D and A-C-D (two equal paths)
        model_a = SqlModel(name="a", sql="SELECT * FROM a", source="ref(test_source)")
        model_b = SqlModel(name="b", sql="SELECT * FROM b", source="ref(test_source)")
        model_c = SqlModel(name="c", sql="SELECT * FROM c", source="ref(test_source)")
        model_d = SqlModel(name="d", sql="SELECT * FROM d", source="ref(test_source)")

        # Mark one path as default
        rel_ab = Relation(name="a_to_b", condition="${ref(a).id} = ${ref(b).a_id}", is_default=True)
        rel_ac = Relation(
            name="a_to_c", condition="${ref(a).id} = ${ref(c).a_id}", is_default=False
        )
        rel_bd = Relation(name="b_to_d", condition="${ref(b).id} = ${ref(d).b_id}", is_default=True)
        rel_cd = Relation(
            name="c_to_d", condition="${ref(c).id} = ${ref(d).c_id}", is_default=False
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[model_a, model_b, model_c, model_d],
            relations=[rel_ab, rel_ac, rel_bd, rel_cd],
            dashboards=[],
        )
        dag = project.dag()

        # Create schemas
        schema_base = tmpdir.mkdir("schema")
        for model in [model_a, model_b, model_c, model_d]:
            model_hash = model.name_hash()
            schema_dir = schema_base.mkdir(model.name)
            schema_file = schema_dir.join("schema.json")
            schema_data = {
                model_hash: {
                    "id": "INTEGER",
                    "a_id": "INTEGER",
                    "b_id": "INTEGER",
                    "c_id": "INTEGER",
                }
            }
            schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")
        graph = RelationGraph(dag=dag, field_resolver=resolver)

        # Should NOT raise AmbiguousJoinError since default path is marked
        # Should prefer the default path (A-B-D)
        try:
            path = graph._find_path_between_two("a", "d")
            # Verify it chose the default path (through B)
            assert len(path) == 2
            assert any(
                "b" in str(from_m).lower() or "b" in str(to_m).lower() for from_m, to_m, _ in path
            )
        except AmbiguousJoinError:
            pytest.fail("is_default flag should have resolved ambiguity")

    def test_multiple_defaults_between_same_models(self, tmpdir):
        """Test handling when multiple relations between same models are marked default."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")

        model_a = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")
        model_b = SqlModel(name="users", sql="SELECT * FROM users", source="ref(test_source)")

        # Two relations between same models, both marked default
        rel1 = Relation(
            name="by_id",
            condition="${ref(orders).user_id} = ${ref(users).id}",
            is_default=True,
        )
        rel2 = Relation(
            name="by_email",
            condition="${ref(orders).email} = ${ref(users).email}",
            is_default=True,
        )

        # Should this raise an error? Or just pick one?
        # Current behavior is undocumented
        project = Project(
            name="test_project",
            sources=[source],
            models=[model_a, model_b],
            relations=[rel1, rel2],
            dashboards=[],
        )
        dag = project.dag()

        # Create schemas
        schema_base = tmpdir.mkdir("schema")
        for model in [model_a, model_b]:
            model_hash = model.name_hash()
            schema_dir = schema_base.mkdir(model.name)
            schema_file = schema_dir.join("schema.json")
            schema_data = {model_hash: {"id": "INTEGER", "user_id": "INTEGER", "email": "VARCHAR"}}
            schema_file.write(json.dumps(schema_data))

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")
        graph = RelationGraph(dag=dag, field_resolver=resolver)

        # What happens? Should work but behavior is undefined
        # NetworkX will pick one deterministically
        path = graph._find_path_between_two("orders", "users")
        assert len(path) == 1


class TestEdgeCases:
    """Test edge cases and error conditions."""

    def test_empty_model_list_raises_error(self, tmpdir):
        """Test that empty model list raises error."""
        source = DuckdbSource(name="test_source", database="test.duckdb", type="duckdb")
        model_a = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model_a],
            dashboards=[],
        )
        dag = project.dag()

        resolver = FieldResolver(dag=dag, output_dir=str(tmpdir), native_dialect="duckdb")
        graph = RelationGraph(dag=dag, field_resolver=resolver)

        with pytest.raises(NoJoinPathError):
            graph.get_join_plan([])
