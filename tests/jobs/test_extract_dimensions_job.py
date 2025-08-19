"""Tests for the extract dimensions job."""

import pytest
from unittest.mock import MagicMock, patch
from visivo.jobs.extract_dimensions_job import job as extract_dimensions_job
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.sqlite_source import SqliteSource
from visivo.models.dimension import Dimension
from visivo.models.base.project_dag import ProjectDag


class TestExtractDimensionsJob:
    """Test suite for dimension extraction job."""
    
    def test_extract_dimensions_from_sql_model(self):
        """Test extracting dimensions from a SQL model's schema."""
        # Create a model with one explicit dimension
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")
        model = SqlModel(
            name="test_model",
            sql="SELECT id, name, amount, created_at FROM test_table",
            source=source,
            dimensions=[
                Dimension(name="amount_category", expression="CASE WHEN amount > 100 THEN 'high' ELSE 'low' END")
            ]
        )
        
        # Create a mock DAG with a project root
        from visivo.models.project import Project
        project = Project(name="test_project")
        dag = ProjectDag()
        dag.add_node(project)
        dag.add_node(source)
        dag.add_node(model)
        dag.add_edge(project, source)
        dag.add_edge(source, model)
        
        # Mock the database connection and query execution
        mock_connection = MagicMock()
        mock_result = MagicMock()
        
        # Mock cursor.description to return column metadata
        # Format: (name, type_code, display_size, internal_size, precision, scale, null_ok)
        mock_result.cursor.description = [
            ("id", "INTEGER", None, None, None, None, True),
            ("name", "VARCHAR", None, None, None, None, True),
            ("amount", "NUMERIC", None, None, None, None, True),
            ("created_at", "TIMESTAMP", None, None, None, None, True),
        ]
        mock_result.keys.return_value = ["id", "name", "amount", "created_at"]
        
        mock_connection.execute.return_value = mock_result
        mock_connection.__enter__.return_value = mock_connection
        mock_connection.__exit__.return_value = None
        
        # Patch the source.connect method
        with patch.object(source, 'connect', return_value=mock_connection):
            # Create and run the job
            job = extract_dimensions_job(model=model, dag=dag)
            assert job is not None
            assert job.name == "test_model"
            
            # Execute the job
            result = job.action()
            assert result.success
            
            # Check that implicit dimensions were created
            assert hasattr(model, '_implicit_dimensions')
            implicit_dims = model._implicit_dimensions
            
            # Should have implicit dimensions for all columns except amount_category
            # which already has an explicit dimension (though with a different expression)
            assert len(implicit_dims) == 4  # id, name, amount, created_at
            
            # Check dimension properties
            dim_by_name = {dim.name: dim for dim in implicit_dims}
            
            assert "id" in dim_by_name
            assert dim_by_name["id"].expression == "id"
            assert dim_by_name["id"].data_type == "INTEGER"
            
            assert "name" in dim_by_name
            assert dim_by_name["name"].expression == "name"
            assert dim_by_name["name"].data_type == "VARCHAR"
            
            assert "amount" in dim_by_name
            assert dim_by_name["amount"].expression == "amount"
            assert dim_by_name["amount"].data_type == "NUMERIC"
            
            assert "created_at" in dim_by_name
            assert dim_by_name["created_at"].expression == "created_at"
            assert dim_by_name["created_at"].data_type == "TIMESTAMP"
    
    def test_extract_dimensions_with_type_inference(self):
        """Test dimension extraction with type inference from data when schema metadata fails."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")
        model = SqlModel(
            name="test_model",
            sql="SELECT * FROM test_table",
            source=source,
            dimensions=[]
        )
        
        from visivo.models.project import Project
        project = Project(name="test_project")
        dag = ProjectDag()
        dag.add_node(project)
        dag.add_node(source)
        dag.add_node(model)
        dag.add_edge(project, source)
        dag.add_edge(source, model)
        
        # Mock connection that fails on LIMIT 0 but works with LIMIT 10
        mock_connection = MagicMock()
        
        def execute_side_effect(query):
            query_str = str(query)
            if "LIMIT 0" in query_str:
                # Simulate failure for LIMIT 0
                raise Exception("LIMIT 0 not supported")
            else:
                # Return data for LIMIT 10
                mock_result = MagicMock()
                mock_result.keys.return_value = ["id", "active", "price", "date_str"]
                mock_result.fetchall.return_value = [
                    (1, True, 99.99, "2024-01-15"),
                    (2, False, 150.50, "2024-01-16"),
                    (3, True, 75.00, "2024-01-17"),
                ]
                return mock_result
        
        mock_connection.execute.side_effect = execute_side_effect
        mock_connection.__enter__.return_value = mock_connection
        mock_connection.__exit__.return_value = None
        
        with patch.object(source, 'connect', return_value=mock_connection):
            job = extract_dimensions_job(model=model, dag=dag)
            result = job.action()
            
            assert result.success
            assert hasattr(model, '_implicit_dimensions')
            
            # Check inferred types
            dim_by_name = {dim.name: dim for dim in model._implicit_dimensions}
            
            assert dim_by_name["id"].data_type == "INTEGER"
            assert dim_by_name["active"].data_type == "BOOLEAN"
            assert dim_by_name["price"].data_type == "NUMERIC"
            assert dim_by_name["date_str"].data_type == "DATE"  # Inferred from string pattern
    
    def test_skip_non_sql_model(self):
        """Test that non-SQL models are skipped."""
        # Create a non-SQL model (just a mock object)
        mock_model = MagicMock()
        mock_model.name = "non_sql_model"
        
        from visivo.models.project import Project
        project = Project(name="test_project")
        dag = ProjectDag()
        dag.add_node(project)
        
        job = extract_dimensions_job(model=mock_model, dag=dag)
        result = job.action()
        
        assert result.success
        assert "Skipping dimension extraction for non-SQL model" in result.message
    
    def test_handle_missing_source(self):
        """Test handling when source cannot be found."""
        model = SqlModel(
            name="test_model",
            sql="SELECT * FROM test",
            source=None,  # No source
            dimensions=[]
        )
        
        from visivo.models.project import Project
        project = Project(name="test_project")
        dag = ProjectDag()
        dag.add_node(project)
        dag.add_node(model)
        dag.add_edge(project, model)
        
        job = extract_dimensions_job(model=model, dag=dag)
        result = job.action()
        
        assert not result.success
        assert "Could not find source" in result.message
    
    def test_preserve_explicit_dimensions(self):
        """Test that explicitly defined dimensions are not overwritten."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")
        
        # Model with explicit dimensions
        model = SqlModel(
            name="test_model",
            sql="SELECT id, name, custom_field FROM test",
            source=source,
            dimensions=[
                Dimension(name="id", expression="id * 100", data_type="INTEGER"),
                Dimension(name="name_upper", expression="UPPER(name)", data_type="VARCHAR")
            ]
        )
        
        from visivo.models.project import Project
        project = Project(name="test_project")
        dag = ProjectDag()
        dag.add_node(project)
        dag.add_node(source)
        dag.add_node(model)
        dag.add_edge(project, source)
        dag.add_edge(source, model)
        
        # Mock the query execution
        mock_connection = MagicMock()
        mock_result = MagicMock()
        mock_result.cursor.description = [
            ("id", "INTEGER", None, None, None, None, True),
            ("name", "VARCHAR", None, None, None, None, True),
            ("custom_field", "VARCHAR", None, None, None, None, True),
        ]
        mock_connection.execute.return_value = mock_result
        mock_connection.__enter__.return_value = mock_connection
        mock_connection.__exit__.return_value = None
        
        with patch.object(source, 'connect', return_value=mock_connection):
            job = extract_dimensions_job(model=model, dag=dag)
            result = job.action()
            
            assert result.success
            
            # Original explicit dimensions should be unchanged
            assert len(model.dimensions) == 2
            assert model.dimensions[0].name == "id"
            assert model.dimensions[0].expression == "id * 100"  # Not overwritten
            
            # Implicit dimensions should only be created for non-explicit columns
            implicit_dims = model._implicit_dimensions
            dim_names = {dim.name for dim in implicit_dims}
            
            # Should have implicit dimensions for columns without explicit definitions
            assert "custom_field" in dim_names
            assert "name" in dim_names  # name_upper is different from name
            assert "id" not in dim_names  # Explicitly defined