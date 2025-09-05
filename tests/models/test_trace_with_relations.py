"""Tests for Trace model with relations field."""

import pytest
from visivo.models.trace import Trace
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.sqlite_source import SqliteSource
from visivo.models.trace_props.trace_props import TraceProps
from visivo.models.relation import Relation


class TestTraceWithRelations:
    """Test suite for Trace model with relations field."""

    def test_trace_with_relation_refs(self):
        """Test creating a trace with relation references using ref() syntax."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")
        model = SqlModel(name="test_model", sql="SELECT * FROM test", source=source)

        trace = Trace(
            name="test_trace",
            model=model,
            props={"type": "scatter", "x": "?{x}", "y": "?{y}"},
            relations=["ref(orders_to_users)", "ref(users_to_accounts)"],
        )

        assert trace.name == "test_trace"
        assert trace.relations == ["ref(orders_to_users)", "ref(users_to_accounts)"]
        assert len(trace.relations) == 2

    def test_trace_with_inline_relations(self):
        """Test creating a trace with inline relation definitions."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")
        model = SqlModel(name="test_model", sql="SELECT * FROM test", source=source)

        trace = Trace(
            name="test_trace",
            model=model,
            props={"type": "scatter", "x": "?{x}", "y": "?{y}"},
            relations=[
                Relation(
                    name="orders_to_users",
                    condition="${ref(orders).user_id} = ${ref(users).id}",
                    join_type="inner",
                ),
                Relation(
                    name="users_to_accounts",
                    condition="${ref(users).account_id} = ${ref(accounts).id}",
                    join_type="left",
                ),
            ],
        )

        assert trace.name == "test_trace"
        assert len(trace.relations) == 2
        # Check that relations correctly extract model references from condition
        assert "orders" in trace.relations[0].get_referenced_models()
        assert "users" in trace.relations[0].get_referenced_models()
        assert trace.relations[1].join_type == "left"

    def test_trace_with_context_string_relations(self):
        """Test creating a trace with context string relation references."""
        from visivo.models.base.context_string import ContextString

        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")
        model = SqlModel(name="test_model", sql="SELECT * FROM test", source=source)

        trace = Trace(
            name="test_trace",
            model=model,
            props={"type": "scatter", "x": "?{x}", "y": "?{y}"},
            relations=["${orders_to_users}", "${users_to_accounts}"],
        )

        assert trace.name == "test_trace"
        assert len(trace.relations) == 2
        # Context strings are parsed into ContextString objects
        assert isinstance(trace.relations[0], ContextString)
        assert isinstance(trace.relations[1], ContextString)
        assert str(trace.relations[0]) == "${orders_to_users}"
        assert str(trace.relations[1]) == "${users_to_accounts}"

    def test_trace_with_mixed_relations(self):
        """Test creating a trace with both relation refs and inline definitions."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")
        model = SqlModel(name="test_model", sql="SELECT * FROM test", source=source)

        trace = Trace(
            name="test_trace",
            model=model,
            props={"type": "scatter", "x": "?{x}", "y": "?{y}"},
            relations=[
                "ref(orders_to_users)",
                Relation(
                    name="users_to_accounts",
                    condition="${ref(users).account_id} = ${ref(accounts).id}",
                ),
            ],
        )

        assert trace.name == "test_trace"
        assert len(trace.relations) == 2
        assert trace.relations[0] == "ref(orders_to_users)"
        assert isinstance(trace.relations[1], Relation)
        assert "users" in trace.relations[1].get_referenced_models()

    def test_trace_without_relations(self):
        """Test that traces without relations still work (backward compatibility)."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")
        model = SqlModel(name="test_model", sql="SELECT * FROM test", source=source)

        trace = Trace(
            name="test_trace", model=model, props={"type": "scatter", "x": "?{x}", "y": "?{y}"}
        )

        assert trace.name == "test_trace"
        assert trace.relations is None

    def test_trace_with_empty_relations(self):
        """Test creating a trace with an empty relations list."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")
        model = SqlModel(name="test_model", sql="SELECT * FROM test", source=source)

        trace = Trace(
            name="test_trace",
            model=model,
            props={"type": "scatter", "x": "?{x}", "y": "?{y}"},
            relations=[],
        )

        assert trace.name == "test_trace"
        assert trace.relations == []

    def test_trace_relations_field_in_yaml_context(self):
        """Test that relations field is properly positioned in the Trace model."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")
        model = SqlModel(name="test_model", sql="SELECT * FROM test", source=source)

        # Create a trace with all common fields to ensure relations doesn't conflict
        trace = Trace(
            name="complex_trace",
            model=model,
            cohort_on="category",
            order_by=["date ASC"],
            filters=["amount > 100"],
            columns={"total": "SUM(amount)"},
            props={"type": "scatter", "x": "?{x}", "y": "?{y}"},
            relations=["ref(model_a_to_b)", "ref(model_b_to_c)"],
        )

        assert trace.name == "complex_trace"
        assert trace.cohort_on == "category"
        assert trace.order_by == ["date ASC"]
        assert trace.filters == ["amount > 100"]
        assert trace.columns.total == "SUM(amount)"
        assert trace.relations == ["ref(model_a_to_b)", "ref(model_b_to_c)"]

        # Verify all fields coexist properly
        assert hasattr(trace, "model")
        assert hasattr(trace, "props")
        assert hasattr(trace, "relations")
