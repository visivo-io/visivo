"""Tests for the extract dimensions job."""

import pytest
from sqlalchemy import text
from visivo.jobs.extract_dimensions_job import job as extract_dimensions_job
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.sqlite_source import SqliteSource
from visivo.models.dimension import Dimension
from visivo.models.base.project_dag import ProjectDag


class TestExtractDimensionsJob:
    """Test suite for dimension extraction job."""

    def test_extract_dimensions_from_sql_model(self):
        """Test extracting dimensions from a SQL model's schema."""
        # Create a real SQLite database with test data
        import tempfile
        import os

        # Use a temporary file for SQLite database
        temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        temp_db_path = temp_db.name
        temp_db.close()

        try:
            source = SqliteSource(name="test_source", type="sqlite", database=temp_db_path)

            # Create the test table with real data
            with source.connect() as conn:
                conn.execute(
                    text(
                        """
                    CREATE TABLE test_table (
                        id INTEGER PRIMARY KEY,
                        name VARCHAR(100),
                        amount NUMERIC(10,2),
                        created_at TIMESTAMP
                    )
                """
                    )
                )
                conn.execute(
                    text(
                        """
                    INSERT INTO test_table (id, name, amount, created_at) VALUES
                    (1, 'Test Item 1', 150.50, '2024-01-01 10:00:00'),
                    (2, 'Test Item 2', 75.25, '2024-01-02 11:00:00'),
                    (3, 'Test Item 3', 200.00, '2024-01-03 12:00:00')
                """
                    )
                )
                conn.commit()

            # Create model with one explicit dimension
            model = SqlModel(
                name="test_model",
                sql="SELECT id, name, amount, created_at FROM test_table",
                source=source,
                dimensions=[
                    Dimension(
                        name="amount_category",
                        expression="CASE WHEN amount > 100 THEN 'high' ELSE 'low' END",
                    )
                ],
            )

            # Create a DAG with a project root
            from visivo.models.project import Project

            project = Project(name="test_project")
            dag = ProjectDag()
            dag.add_node(project)
            dag.add_node(source)
            dag.add_node(model)
            dag.add_edge(project, source)
            dag.add_edge(source, model)

            # Create and run the job with real database
            job = extract_dimensions_job(model=model, dag=dag)
            assert job is not None
            assert job.name == "test_model"

            # Execute the job
            result = job.action()
            if not result.success:
                print(f"Job failed with message: {result.message}")
            assert result.success

            # Check that implicit dimensions were created
            assert hasattr(model, "_implicit_dimensions")
            implicit_dims = model._implicit_dimensions

            # Should have implicit dimensions for all columns
            # The explicit dimension "amount_category" doesn't prevent "amount" from being extracted
            assert len(implicit_dims) == 4  # id, name, amount, created_at

            # Check dimension properties
            dim_by_name = {dim.name: dim for dim in implicit_dims}

            assert "id" in dim_by_name
            assert dim_by_name["id"].expression == "id"
            assert dim_by_name["id"].data_type in ["INTEGER", "INT"]

            assert "name" in dim_by_name
            assert dim_by_name["name"].expression == "name"
            assert dim_by_name["name"].data_type in ["VARCHAR", "TEXT", "VARCHAR(100)"]

            assert "amount" in dim_by_name
            assert dim_by_name["amount"].expression == "amount"
            assert dim_by_name["amount"].data_type in ["NUMERIC", "REAL", "NUMERIC(10,2)"]

            assert "created_at" in dim_by_name
            assert dim_by_name["created_at"].expression == "created_at"
            assert dim_by_name["created_at"].data_type in [
                "TIMESTAMP",
                "TEXT",
                "DATETIME",
                "VARCHAR",
            ]  # SQLite stores timestamps as text

        finally:
            # Clean up temporary database file
            if os.path.exists(temp_db_path):
                os.unlink(temp_db_path)

    def test_extract_dimensions_with_type_inference(self):
        """Test dimension extraction with type inference from data when schema metadata is limited."""
        import tempfile
        import os

        # Use a temporary file for SQLite database
        temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        temp_db_path = temp_db.name
        temp_db.close()

        try:
            source = SqliteSource(name="test_source", type="sqlite", database=temp_db_path)

            # Create a table with various data types
            with source.connect() as conn:
                conn.execute(
                    text(
                        """
                    CREATE TABLE test_table (
                        id INTEGER,
                        active BOOLEAN,
                        price REAL,
                        created_date TEXT
                    )
                """
                    )
                )
                # Insert test data with different types
                conn.execute(
                    text(
                        """
                    INSERT INTO test_table (id, active, price, created_date) VALUES
                    (1, 1, 99.99, '2024-01-15'),
                    (2, 0, 150.50, '2024-01-16'),
                    (3, 1, 75.00, '2024-01-17')
                """
                    )
                )
                conn.commit()

            model = SqlModel(
                name="test_model", sql="SELECT * FROM test_table", source=source, dimensions=[]
            )

            from visivo.models.project import Project

            project = Project(name="test_project")
            dag = ProjectDag()
            dag.add_node(project)
            dag.add_node(source)
            dag.add_node(model)
            dag.add_edge(project, source)
            dag.add_edge(source, model)

            # Run the job with real database
            job = extract_dimensions_job(model=model, dag=dag)
            result = job.action()

            assert result.success
            assert hasattr(model, "_implicit_dimensions")

            # Check that types were properly inferred
            dim_by_name = {dim.name: dim for dim in model._implicit_dimensions}

            assert "id" in dim_by_name
            assert dim_by_name["id"].data_type in ["INTEGER", "INT"]

            assert "active" in dim_by_name
            # SQLite doesn't have a true BOOLEAN type, it uses INTEGER
            assert dim_by_name["active"].data_type in ["BOOLEAN", "INTEGER", "INT"]

            assert "price" in dim_by_name
            assert dim_by_name["price"].data_type in ["NUMERIC", "REAL", "FLOAT"]

            assert "created_date" in dim_by_name
            # SQLite stores dates as TEXT
            assert dim_by_name["created_date"].data_type in ["VARCHAR", "TEXT", "DATE"]

        finally:
            # Clean up temporary database file
            if os.path.exists(temp_db_path):
                os.unlink(temp_db_path)

    def test_skip_non_sql_model(self):
        """Test that non-SQL models are skipped."""
        # Create a non-SQL model type (using a base model that's not SQL-based)
        from visivo.models.base.parent_model import ParentModel

        class NonSqlModel(ParentModel):
            def __init__(self):
                self.name = "non_sql_model"

            def child_items(self):
                return []

        model = NonSqlModel()

        from visivo.models.project import Project

        project = Project(name="test_project")
        dag = ProjectDag()
        dag.add_node(project)
        dag.add_node(model)
        dag.add_edge(project, model)

        job = extract_dimensions_job(model=model, dag=dag)
        result = job.action()

        assert result.success
        assert "Skipping dimension extraction for non-SQL model" in result.message

    def test_handle_missing_source(self):
        """Test handling when source cannot be found."""
        model = SqlModel(
            name="test_model", sql="SELECT * FROM test", source=None, dimensions=[]  # No source
        )

        from visivo.models.project import Project

        project = Project(name="test_project")
        dag = ProjectDag()
        dag.add_node(project)
        dag.add_node(model)
        dag.add_edge(project, model)

        job = extract_dimensions_job(model=model, dag=dag)
        result = job.action()

        # We now skip gracefully when no source is found
        assert result.success
        assert "Skipped dimension extraction" in result.message
        assert "no source found" in result.message

    def test_preserve_explicit_dimensions(self):
        """Test that explicitly defined dimensions are not overwritten."""
        import tempfile
        import os

        # Use a temporary file for SQLite database
        temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        temp_db_path = temp_db.name
        temp_db.close()

        try:
            source = SqliteSource(name="test_source", type="sqlite", database=temp_db_path)

            # Create a real table with test data
            with source.connect() as conn:
                conn.execute(
                    text(
                        """
                    CREATE TABLE test (
                        id INTEGER,
                        name VARCHAR(50),
                        custom_field VARCHAR(100)
                    )
                """
                    )
                )
                conn.execute(
                    text(
                        """
                    INSERT INTO test (id, name, custom_field) VALUES
                    (1, 'Alice', 'Custom Value 1'),
                    (2, 'Bob', 'Custom Value 2')
                """
                    )
                )
                conn.commit()

            # Model with explicit dimensions
            model = SqlModel(
                name="test_model",
                sql="SELECT id, name, custom_field FROM test",
                source=source,
                dimensions=[
                    Dimension(name="id", expression="id * 100", data_type="INTEGER"),
                    Dimension(name="name_upper", expression="UPPER(name)", data_type="VARCHAR"),
                ],
            )

            from visivo.models.project import Project

            project = Project(name="test_project")
            dag = ProjectDag()
            dag.add_node(project)
            dag.add_node(source)
            dag.add_node(model)
            dag.add_edge(project, source)
            dag.add_edge(source, model)

            # Run the job with real database
            job = extract_dimensions_job(model=model, dag=dag)
            result = job.action()

            assert result.success

            # Original explicit dimensions should be unchanged
            assert len(model.dimensions) == 2
            assert model.dimensions[0].name == "id"
            assert model.dimensions[0].expression == "id * 100"  # Not overwritten
            assert model.dimensions[1].name == "name_upper"
            assert model.dimensions[1].expression == "UPPER(name)"

            # Implicit dimensions should only be created for non-explicit columns
            assert hasattr(model, "_implicit_dimensions")
            implicit_dims = model._implicit_dimensions
            dim_names = {dim.name for dim in implicit_dims}

            # Should have implicit dimensions for columns without explicit definitions
            assert "custom_field" in dim_names
            assert "name" in dim_names  # name_upper is different from name
            assert "id" not in dim_names  # id is explicitly defined with different expression

        finally:
            # Clean up temporary database file
            if os.path.exists(temp_db_path):
                os.unlink(temp_db_path)
