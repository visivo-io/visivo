"""Tests for job utility functions."""

import pytest
import tempfile
import networkx as nx
from unittest.mock import Mock, MagicMock

from visivo.jobs.utils import get_source_for_model
from visivo.models.models.sql_model import SqlModel
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.sources.sqlite_source import SqliteSource
from visivo.models.sources.duckdb_source import DuckdbSource
from visivo.models.base.context_string import ContextString


class TestGetSourceForModel:
    """Test cases for get_source_for_model function."""

    def test_csv_script_model_returns_duckdb_source(self):
        """Test that CsvScriptModel returns a DuckDB source."""
        model = CsvScriptModel(name="test_csv", args=["echo", "x,y\n1,2\n3,4"])
        dag = nx.DiGraph()
        output_dir = tempfile.gettempdir()

        source = get_source_for_model(model, dag, output_dir)

        assert source is not None
        assert isinstance(source, DuckdbSource)

    def test_local_merge_model_returns_duckdb_source(self):
        """Test that LocalMergeModel returns a DuckDB source."""
        model = LocalMergeModel(name="test_merge", sql="SELECT * FROM table1", models=[])
        dag = nx.DiGraph()
        # LocalMergeModel needs to be in the DAG
        dag.add_node(model)
        output_dir = tempfile.gettempdir()

        source = get_source_for_model(model, dag, output_dir)

        assert source is not None
        assert isinstance(source, DuckdbSource)

    def test_sql_model_with_direct_source(self):
        """Test SqlModel with a direct Source object."""
        source_obj = SqliteSource(name="test_source", type="sqlite", database=":memory:")
        model = SqlModel(name="test_model", sql="SELECT * FROM test_table", source=source_obj)
        dag = nx.DiGraph()
        output_dir = tempfile.gettempdir()

        source = get_source_for_model(model, dag, output_dir)

        assert source is source_obj

    def test_sql_model_with_context_string(self):
        """Test SqlModel with a ContextString reference to a source."""
        # Create a mock DAG with a source
        source_obj = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        # Create a model and then manually set its source to a ContextString
        # (simulating what happens during parsing)
        model = SqlModel(name="test_model", sql="SELECT * FROM test_table")

        # Create a ContextString that references the source
        context_string = ContextString("${ref(test_source)}")

        # Mock the get_item method to return our source
        context_string.get_item = Mock(return_value=source_obj)

        # Manually set the source after creation (simulating parsing behavior)
        model.source = context_string

        dag = nx.DiGraph()
        output_dir = tempfile.gettempdir()

        source = get_source_for_model(model, dag, output_dir)

        assert source is source_obj
        context_string.get_item.assert_called_once_with(dag)

    def test_sql_model_with_context_string_fallback_to_dag(self):
        """Test SqlModel with ContextString that fails to resolve, falls back to DAG."""
        source_obj = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        model = SqlModel(name="test_model", sql="SELECT * FROM test_table")

        # Create a ContextString that will fail to resolve
        context_string = ContextString("${ref(nonexistent)}")
        context_string.get_item = Mock(side_effect=ValueError("Not found"))

        # Manually set the source after creation
        model.source = context_string

        # Create DAG with source as descendant of model
        dag = nx.DiGraph()
        dag.add_edge(model, source_obj)

        output_dir = tempfile.gettempdir()

        source = get_source_for_model(model, dag, output_dir)

        assert source is source_obj

    def test_sql_model_with_string_ref(self):
        """Test SqlModel with a string reference."""
        source_obj = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        model = SqlModel(
            name="test_model",
            sql="SELECT * FROM test_table",
            source="ref(test_source)",  # String reference
        )

        # Create DAG with source as descendant
        dag = nx.DiGraph()
        dag.add_edge(model, source_obj)

        output_dir = tempfile.gettempdir()

        source = get_source_for_model(model, dag, output_dir)

        assert source is source_obj

    def test_sql_model_no_source_finds_in_dag(self):
        """Test SqlModel without source finds it in DAG."""
        source_obj = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        model = SqlModel(name="test_model", sql="SELECT * FROM test_table", source=None)

        # Create DAG with source as descendant
        dag = nx.DiGraph()
        dag.add_edge(model, source_obj)

        output_dir = tempfile.gettempdir()

        source = get_source_for_model(model, dag, output_dir)

        assert source is source_obj

    def test_sql_model_no_source_not_in_dag(self):
        """Test SqlModel without source and not in DAG returns None."""
        model = SqlModel(name="test_model", sql="SELECT * FROM test_table", source=None)

        dag = nx.DiGraph()
        dag.add_node(model)

        output_dir = tempfile.gettempdir()

        source = get_source_for_model(model, dag, output_dir)

        assert source is None

    def test_unknown_model_type(self):
        """Test unknown model type tries to find source in DAG."""
        source_obj = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        # Create a mock model that's not a known type
        model = Mock()
        model.name = "unknown_model"

        dag = nx.DiGraph()
        dag.add_edge(model, source_obj)

        output_dir = tempfile.gettempdir()

        source = get_source_for_model(model, dag, output_dir)

        assert source is source_obj

    def test_unknown_model_type_no_source_in_dag(self):
        """Test unknown model type with no source in DAG returns None."""
        model = Mock()
        model.name = "unknown_model"

        dag = nx.DiGraph()
        dag.add_node(model)

        output_dir = tempfile.gettempdir()

        source = get_source_for_model(model, dag, output_dir)

        assert source is None

    def test_sql_model_with_context_string_real_dag(self):
        """Test SqlModel with ContextString using a real DAG structure."""
        # Create a real source and add it to DAG
        source_obj = SqliteSource(name="local_duckdb", type="sqlite", database=":memory:")

        model = SqlModel(name="test_model", sql="SELECT * FROM test_table")

        # Create a ContextString that references the source
        context_string = ContextString("${ref(local_duckdb)}")

        # Manually set the source after creation
        model.source = context_string

        # Create DAG with the source registered by name
        dag = nx.DiGraph()
        dag.add_node(source_obj)
        dag.add_node(model)

        # Add the source to the graph's nodes with its name attribute
        # This simulates how the real DAG would have named nodes
        for node in dag.nodes():
            if hasattr(node, "name") and node.name == "local_duckdb":
                dag.nodes[node]["name"] = "local_duckdb"

        output_dir = tempfile.gettempdir()

        # Mock the context string's get_item to simulate real behavior
        def mock_get_item(dag_arg):
            # Find the node with matching name
            for node in dag_arg.nodes():
                if hasattr(node, "name") and node.name == "local_duckdb":
                    return node
            raise ValueError(f"Invalid context string reference name: 'local_duckdb'.")

        context_string.get_item = Mock(side_effect=mock_get_item)

        source = get_source_for_model(model, dag, output_dir)

        assert source is source_obj
        context_string.get_item.assert_called_once_with(dag)
