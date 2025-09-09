"""Tests for field-level lineage tracking in ProjectDag."""

import pytest
from visivo.models.base.project_dag import ProjectDag, FieldNode
from tests.factories.model_factories import (
    ProjectFactory,
    SqlModelFactory,
    SourceFactory,
    TraceFactory,
)


class TestFieldNodeClass:
    """Test the FieldNode class."""

    def test_field_node_creation(self):
        """Test creating a field node with metadata."""
        metadata = {"type": "string", "description": "Test field"}
        node = FieldNode("model1.column1", metadata)

        assert node.field_id == "model1.column1"
        assert node.metadata == metadata
        assert node.node_type == "field"

    def test_field_node_str_repr(self):
        """Test string representations of field node."""
        node = FieldNode("model1.column1", {"type": "string"})

        assert str(node) == "FieldNode(model1.column1)"
        assert "model1.column1" in repr(node)
        assert "type" in repr(node)

    def test_field_node_equality(self):
        """Test field node equality comparison."""
        node1 = FieldNode("model1.column1")
        node2 = FieldNode("model1.column1")
        node3 = FieldNode("model1.column2")

        assert node1 == node2
        assert node1 != node3
        assert node1 != "not a field node"

    def test_field_node_hashable(self):
        """Test that field nodes can be used in sets/dicts."""
        node1 = FieldNode("model1.column1")
        node2 = FieldNode("model1.column1")
        node3 = FieldNode("model1.column2")

        # Should be able to add to a set
        field_set = {node1, node2, node3}
        assert len(field_set) == 2  # node1 and node2 are the same


class TestProjectDagFieldMethods:
    """Test field-level lineage methods in ProjectDag."""

    def test_add_field_node(self):
        """Test adding field nodes to the DAG."""
        dag = ProjectDag()

        # Add field without metadata
        dag.add_field_node("model1.column1")

        # Add field with metadata
        metadata = {"type": "integer", "nullable": False}
        dag.add_field_node("model1.column2", metadata)

        # Verify nodes were added
        field_nodes = dag.get_all_field_nodes()
        assert len(field_nodes) == 2

        field_ids = [node.field_id for node in field_nodes]
        assert "model1.column1" in field_ids
        assert "model1.column2" in field_ids

    def test_add_field_edge(self):
        """Test adding edges between field nodes."""
        dag = ProjectDag()

        # Add field nodes
        dag.add_field_node("source1.column1")
        dag.add_field_node("model1.column1")
        dag.add_field_node("model1.column2")

        # Add edges
        dag.add_field_edge("source1.column1", "model1.column1")
        dag.add_field_edge("model1.column1", "model1.column2")

        # Verify edges exist
        source_node = dag._get_field_node("source1.column1")
        model1_node = dag._get_field_node("model1.column1")
        model2_node = dag._get_field_node("model1.column2")

        assert dag.has_edge(source_node, model1_node)
        assert dag.has_edge(model1_node, model2_node)

    def test_add_field_edge_nonexistent_nodes(self):
        """Test that adding edges for non-existent fields doesn't crash."""
        dag = ProjectDag()

        # Try to add edge between non-existent fields
        dag.add_field_edge("nonexistent1", "nonexistent2")

        # Should not raise an error
        assert len(dag.edges()) == 0

    def test_get_field_lineage(self):
        """Test getting upstream and downstream lineage for a field."""
        dag = ProjectDag()

        # Build a simple lineage chain:
        # source.col1 -> model1.col1 -> model2.col1 -> trace.col1
        dag.add_field_node("source.col1")
        dag.add_field_node("model1.col1")
        dag.add_field_node("model2.col1")
        dag.add_field_node("trace.col1")

        dag.add_field_edge("source.col1", "model1.col1")
        dag.add_field_edge("model1.col1", "model2.col1")
        dag.add_field_edge("model2.col1", "trace.col1")

        # Test lineage for middle node
        lineage = dag.get_field_lineage("model1.col1")
        assert lineage["upstream"] == ["source.col1"]
        assert lineage["downstream"] == ["model2.col1"]

        # Test lineage for source node
        lineage = dag.get_field_lineage("source.col1")
        assert lineage["upstream"] == []
        assert lineage["downstream"] == ["model1.col1"]

        # Test lineage for leaf node
        lineage = dag.get_field_lineage("trace.col1")
        assert lineage["upstream"] == ["model2.col1"]
        assert lineage["downstream"] == []

    def test_get_field_lineage_nonexistent(self):
        """Test getting lineage for non-existent field."""
        dag = ProjectDag()

        lineage = dag.get_field_lineage("nonexistent")
        assert lineage["upstream"] == []
        assert lineage["downstream"] == []

    def test_get_field_metadata(self):
        """Test retrieving metadata for a field."""
        dag = ProjectDag()

        metadata = {"type": "string", "nullable": True, "description": "Test field"}
        dag.add_field_node("model1.column1", metadata)

        retrieved = dag.get_field_metadata("model1.column1")
        assert retrieved == metadata

        # Non-existent field should return empty dict
        assert dag.get_field_metadata("nonexistent") == {}

    def test_get_fields_for_object(self):
        """Test getting all fields belonging to an object."""
        dag = ProjectDag()

        # Add fields for different objects
        dag.add_field_node("model1.column1")
        dag.add_field_node("model1.column2")
        dag.add_field_node("model1.column3")
        dag.add_field_node("model2.column1")
        dag.add_field_node("source1.column1")

        # Get fields for model1
        model1_fields = dag.get_fields_for_object("model1")
        assert len(model1_fields) == 3
        assert "model1.column1" in model1_fields
        assert "model1.column2" in model1_fields
        assert "model1.column3" in model1_fields

        # Get fields for model2
        model2_fields = dag.get_fields_for_object("model2")
        assert model2_fields == ["model2.column1"]

        # Non-existent object should return empty list
        assert dag.get_fields_for_object("nonexistent") == []

    def test_add_field_to_object_edge(self):
        """Test linking field nodes to their parent object nodes."""
        # Create a project with a model
        model = SqlModelFactory(name="test_model")
        project = ProjectFactory(models=[model])
        dag = project.dag()

        # Add a field node
        dag.add_field_node("test_model.column1")

        # Link it to the model object
        dag.add_field_to_object_edge("test_model.column1", model)

        # Verify edge exists
        field_node = dag._get_field_node("test_model.column1")
        assert dag.has_edge(model, field_node)

    def test_get_field_impact_analysis(self):
        """Test analyzing downstream impact of field changes."""
        dag = ProjectDag()

        # Build a more complex lineage:
        #        -> model2.col1 -> trace1.col1
        # source.col1
        #        -> model3.col1 -> trace2.col1
        #                       -> trace3.col1

        dag.add_field_node("source.col1")
        dag.add_field_node("model2.col1")
        dag.add_field_node("model3.col1")
        dag.add_field_node("trace1.col1")
        dag.add_field_node("trace2.col1")
        dag.add_field_node("trace3.col1")

        dag.add_field_edge("source.col1", "model2.col1")
        dag.add_field_edge("source.col1", "model3.col1")
        dag.add_field_edge("model2.col1", "trace1.col1")
        dag.add_field_edge("model3.col1", "trace2.col1")
        dag.add_field_edge("model3.col1", "trace3.col1")

        # Get all impacted fields
        impacted = dag.get_field_impact_analysis("source.col1")
        assert len(impacted) == 5
        assert "model2.col1" in impacted
        assert "model3.col1" in impacted
        assert "trace1.col1" in impacted
        assert "trace2.col1" in impacted
        assert "trace3.col1" in impacted

        # Test with max_depth
        impacted = dag.get_field_impact_analysis("source.col1", max_depth=1)
        assert len(impacted) == 2
        assert "model2.col1" in impacted
        assert "model3.col1" in impacted

        # Test for leaf node
        impacted = dag.get_field_impact_analysis("trace1.col1")
        assert len(impacted) == 0

    def test_field_impact_analysis_nonexistent(self):
        """Test impact analysis for non-existent field."""
        dag = ProjectDag()

        impacted = dag.get_field_impact_analysis("nonexistent")
        assert impacted == set()


class TestBackwardCompatibility:
    """Test that existing DAG functionality still works with field nodes."""

    def test_regular_dag_operations_with_field_nodes(self):
        """Test that regular DAG operations work when field nodes are present."""
        project = ProjectFactory()
        dag = project.dag()

        # Add some field nodes
        dag.add_field_node("model1.column1")
        dag.add_field_node("model1.column2")
        dag.add_field_edge("model1.column1", "model1.column2")

        # Existing DAG validation should still work
        assert dag.validate_dag()

        # Root nodes should still be Project (not field nodes)
        roots = dag.get_root_nodes()
        assert len(roots) == 1
        assert roots[0].__class__.__name__ == "Project"

    def test_get_node_by_name_ignores_field_nodes(self):
        """Test that get_node_by_name doesn't return field nodes."""
        dag = ProjectDag()

        # Add a regular named node
        model = SqlModelFactory(name="test_model")
        dag.add_node(model)

        # Add a field node that happens to have 'name' in its ID
        dag.add_field_node("test_model.name_column")

        # Should only find the model, not the field
        found = dag.get_node_by_name("test_model")
        assert found == model

    def test_named_nodes_subgraph_excludes_field_nodes(self):
        """Test that field nodes are excluded from named nodes subgraph."""
        project = ProjectFactory()
        dag = project.dag()

        # Add field nodes
        dag.add_field_node("model1.column1")
        dag.add_field_node("model1.column2")

        # Get named nodes subgraph
        named_subgraph = dag.get_named_nodes_subgraph()

        # Field nodes should not be in the subgraph
        field_nodes = [n for n in named_subgraph.nodes() if isinstance(n, FieldNode)]
        assert len(field_nodes) == 0

    def test_filter_dag_preserves_field_nodes(self):
        """Test that filtering DAG preserves related field nodes."""
        model = SqlModelFactory(name="test_model")
        project = ProjectFactory(models=[model])
        dag = project.dag()

        # Add field nodes for the model
        dag.add_field_node("test_model.column1")
        dag.add_field_node("test_model.column2")
        dag.add_field_to_object_edge("test_model.column1", model)
        dag.add_field_to_object_edge("test_model.column2", model)

        # Filter DAG to include the model
        filtered_dags = dag.filter_dag("test_model")

        # The filtered DAG should include the model
        assert len(filtered_dags) > 0
        filtered_dag = filtered_dags[0]
        assert model in filtered_dag.nodes()


class TestComplexFieldLineage:
    """Test complex field lineage scenarios."""

    def test_multiple_sources_to_single_target(self):
        """Test field with multiple upstream sources."""
        dag = ProjectDag()

        # Multiple source columns combine into one model column
        dag.add_field_node("source1.col1")
        dag.add_field_node("source1.col2")
        dag.add_field_node("source2.col1")
        dag.add_field_node("model1.combined_col")

        dag.add_field_edge("source1.col1", "model1.combined_col")
        dag.add_field_edge("source1.col2", "model1.combined_col")
        dag.add_field_edge("source2.col1", "model1.combined_col")

        lineage = dag.get_field_lineage("model1.combined_col")
        assert len(lineage["upstream"]) == 3
        assert "source1.col1" in lineage["upstream"]
        assert "source1.col2" in lineage["upstream"]
        assert "source2.col1" in lineage["upstream"]

    def test_single_source_to_multiple_targets(self):
        """Test field that feeds multiple downstream fields."""
        dag = ProjectDag()

        # One source column feeds multiple model columns
        dag.add_field_node("source1.col1")
        dag.add_field_node("model1.col1")
        dag.add_field_node("model1.col2")
        dag.add_field_node("model2.col1")

        dag.add_field_edge("source1.col1", "model1.col1")
        dag.add_field_edge("source1.col1", "model1.col2")
        dag.add_field_edge("source1.col1", "model2.col1")

        lineage = dag.get_field_lineage("source1.col1")
        assert len(lineage["downstream"]) == 3
        assert "model1.col1" in lineage["downstream"]
        assert "model1.col2" in lineage["downstream"]
        assert "model2.col1" in lineage["downstream"]

    def test_circular_field_reference_detection(self):
        """Test that circular field references don't break the DAG."""
        dag = ProjectDag()

        # Create a potential circular reference
        dag.add_field_node("model1.col1")
        dag.add_field_node("model2.col1")
        dag.add_field_node("model3.col1")

        dag.add_field_edge("model1.col1", "model2.col1")
        dag.add_field_edge("model2.col1", "model3.col1")
        # This would create a cycle
        dag.add_field_edge("model3.col1", "model1.col1")

        # The DAG should detect this as invalid
        with pytest.raises(ValueError, match="circular reference"):
            dag.validate_dag()

    def test_field_lineage_with_metadata(self):
        """Test field lineage tracking with rich metadata."""
        dag = ProjectDag()

        # Add fields with different metadata
        dag.add_field_node(
            "source.customer_id", {"type": "integer", "primary_key": True, "nullable": False}
        )

        dag.add_field_node(
            "model.customer_id",
            {
                "type": "integer",
                "description": "Customer identifier",
                "derived_from": "source.customer_id",
            },
        )

        dag.add_field_node("model.customer_name", {"type": "string", "nullable": True})

        # Create lineage
        dag.add_field_edge("source.customer_id", "model.customer_id")

        # Verify metadata is preserved
        assert dag.get_field_metadata("source.customer_id")["primary_key"] == True
        assert dag.get_field_metadata("model.customer_id")["derived_from"] == "source.customer_id"
        assert dag.get_field_metadata("model.customer_name")["type"] == "string"
