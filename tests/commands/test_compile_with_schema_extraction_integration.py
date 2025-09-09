"""
Integration tests for schema extraction in the compile phase.
"""

import os
import json
import pytest
from unittest.mock import Mock, MagicMock, patch
from tests.factories.model_factories import (
    ProjectFactory,
    SqlModelFactory,
    CsvScriptModelFactory,
    SourceFactory,
    MetricFactory,
    DimensionFactory,
)
from tests.support.utils import temp_folder, temp_yml_file
from visivo.commands.compile_phase import compile_phase
from visivo.commands.utils import create_file_database
from visivo.models.defaults import Defaults
from visivo.parsers.file_names import PROJECT_FILE_NAME


class TestSchemaExtractionIntegration:
    """Test that schema extraction integrates correctly with compile phase."""

    def test_compile_with_models_and_metrics(self):
        """Test compile phase with schema extraction for CSV script models."""
        output_dir = temp_folder()

        # Create a project - start with empty sources
        project = ProjectFactory()
        project.sources = []

        # Use CsvScriptModel which has the get_duckdb_source method
        model = CsvScriptModelFactory(
            name="sales_model", args=["echo", "product_id,amount\n1,100\n2,200\n1,150\n3,300"]
        )

        # Add the model to the project's dashboard/chart/trace
        project.dashboards[0].rows[0].items[0].chart.traces[0].model = model

        # Create a DuckDB database for the model
        create_file_database(url=model.get_duckdb_source(output_dir).url(), output_dir=output_dir)

        # Save project to file
        tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
        working_dir = os.path.dirname(tmp)

        # Mock SchemaExtractor to avoid actual DB connection
        with patch("visivo.commands.compile_phase.SchemaExtractor") as mock_extractor_class:
            mock_extractor = Mock()
            mock_extractor.extract_all_schemas = MagicMock(
                return_value={
                    "test_source": {
                        "sales_model": {"product_id": "VARCHAR", "total_sales": "DECIMAL"}
                    }
                }
            )
            mock_extractor.get_schema_for_model = MagicMock(
                return_value={"product_id": "VARCHAR", "total_sales": "DECIMAL"}
            )
            mock_extractor_class.return_value = mock_extractor

            # Run compile phase
            compiled_project = compile_phase(
                default_source="test_source",
                working_dir=working_dir,
                output_dir=output_dir,
            )

        # Verify compilation succeeded
        assert os.path.exists(f"{output_dir}/project.json")
        assert os.path.exists(f"{output_dir}/explorer.json")
        assert os.path.exists(f"{output_dir}/error.json")

        # Verify schemas are attached to project
        assert hasattr(compiled_project, "_extracted_schemas")
        assert compiled_project._extracted_schemas is not None

        # Verify we can retrieve the schema
        schema = compiled_project.get_model_schema("sales_model")
        assert schema is not None
        assert "product_id" in schema
        assert "total_sales" in schema

    def test_compile_with_multiple_sources(self):
        """Test compile phase with models using different sources."""
        output_dir = temp_folder()

        # Create project dictionary with multiple sources
        project_dict = {
            "name": "multi_source_project",
            "sources": [
                {
                    "name": "source1",
                    "database": "db1",
                    "type": "snowflake",
                    "username": "user1",
                    "password": "pass1",
                    "host": "host1.snowflake.com",
                    "port": 443,
                },
                {
                    "name": "source2",
                    "database": "db2",
                    "type": "snowflake",
                    "username": "user2",
                    "password": "pass2",
                    "host": "host2.snowflake.com",
                    "port": 443,
                },
            ],
            "models": [
                {"name": "model1", "sql": "SELECT id, name FROM table1", "source": "ref(source1)"},
                {"name": "model2", "sql": "SELECT id, value FROM table2", "source": "ref(source2)"},
            ],
            "defaults": {"source_name": "source1"},
        }

        # Save project to file
        tmp = temp_yml_file(dict=project_dict, name=PROJECT_FILE_NAME)
        working_dir = os.path.dirname(tmp)

        # Mock SchemaExtractor to simulate multiple sources
        with patch("visivo.commands.compile_phase.SchemaExtractor") as mock_extractor_class:
            mock_extractor = Mock()
            mock_extractor.extract_all_schemas = MagicMock(
                return_value={
                    "source1": {"model1": {"id": "INTEGER", "name": "VARCHAR"}},
                    "source2": {"model2": {"id": "INTEGER", "value": "DECIMAL"}},
                }
            )

            def get_schema_side_effect(model_name, source_name=None):
                if model_name == "model1":
                    return {"id": "INTEGER", "name": "VARCHAR"}
                elif model_name == "model2":
                    return {"id": "INTEGER", "value": "DECIMAL"}
                return None

            mock_extractor.get_schema_for_model = MagicMock(side_effect=get_schema_side_effect)
            mock_extractor_class.return_value = mock_extractor

            # Run compile phase
            compiled_project = compile_phase(
                default_source="source1",
                working_dir=working_dir,
                output_dir=output_dir,
            )

        # Verify both sources had schemas extracted
        all_schemas = compiled_project.get_all_extracted_schemas()
        assert all_schemas is not None
        assert "source1" in all_schemas
        assert "source2" in all_schemas
        assert "model1" in all_schemas["source1"]
        assert "model2" in all_schemas["source2"]

    def test_compile_continues_when_schema_extraction_fails(self):
        """Test that compile phase continues even if schema extraction fails."""
        output_dir = temp_folder()

        # Create a minimal project
        project_dict = {
            "name": "test_project",
            "sources": [
                {
                    "name": "test_source",
                    "database": "test_db",
                    "type": "snowflake",
                    "username": "test_user",
                    "password": "test_pass",
                    "host": "test.snowflake.com",
                    "port": 443,
                }
            ],
            "models": [
                {"name": "test_model", "sql": "SELECT 1 as id", "source": "ref(test_source)"}
            ],
            "defaults": {"source_name": "test_source"},
        }

        # Save project to file
        tmp = temp_yml_file(dict=project_dict, name=PROJECT_FILE_NAME)
        working_dir = os.path.dirname(tmp)

        # Mock SchemaExtractor to fail
        with patch("visivo.commands.compile_phase.SchemaExtractor") as mock_extractor_class:
            mock_extractor_class.side_effect = Exception("Connection failed")

            # Run compile phase - should not raise
            compiled_project = compile_phase(
                default_source="test_source",
                working_dir=working_dir,
                output_dir=output_dir,
            )

        # Verify compilation still succeeded
        assert os.path.exists(f"{output_dir}/project.json")
        assert os.path.exists(f"{output_dir}/explorer.json")

        # Verify no schemas were stored
        assert compiled_project.get_model_schema("test_model") is None
        assert compiled_project.get_all_extracted_schemas() is None

    def xtest_compile_with_context_strings_in_models(self):
        """Test compile phase with models using context strings."""
        output_dir = temp_folder()

        # Create project with context strings
        project_dict = {
            "name": "context_project",
            "sources": [
                {
                    "name": "main_source",
                    "database": "main_db",
                    "type": "snowflake",
                    "username": "user",
                    "password": "pass",
                    "host": "host.snowflake.com",
                    "port": 443,
                }
            ],
            "models": [
                {
                    "name": "base_model",
                    "sql": "SELECT id, value FROM base_table",
                    "source": "ref(main_source)",
                },
                {
                    "name": "derived_model",
                    "sql": "SELECT id, value * 2 as double_value FROM ${ref(base_model)}",
                    "source": "ref(main_source)",
                },
            ],
            "metrics": [
                {"name": "total_value", "expression": "SUM(${ref(derived_model).double_value})"}
            ],
            "defaults": {"source_name": "main_source"},
        }

        # Save project to file
        tmp = temp_yml_file(dict=project_dict, name=PROJECT_FILE_NAME)
        working_dir = os.path.dirname(tmp)

        # Mock SchemaExtractor
        with patch("visivo.commands.compile_phase.SchemaExtractor") as mock_extractor_class:
            mock_extractor = Mock()
            mock_extractor.extract_all_schemas = MagicMock(
                return_value={
                    "main_source": {
                        "base_model": {"id": "INTEGER", "value": "DECIMAL"},
                        "derived_model": {"id": "INTEGER", "double_value": "DECIMAL"},
                    }
                }
            )

            def get_schema_side_effect(model_name, source_name=None):
                if model_name == "base_model":
                    return {"id": "INTEGER", "value": "DECIMAL"}
                elif model_name == "derived_model":
                    return {"id": "INTEGER", "double_value": "DECIMAL"}
                return None

            mock_extractor.get_schema_for_model = MagicMock(side_effect=get_schema_side_effect)
            mock_extractor_class.return_value = mock_extractor

            # Run compile phase
            compiled_project = compile_phase(
                default_source="main_source",
                working_dir=working_dir,
                output_dir=output_dir,
            )

        # Verify compilation succeeded
        assert os.path.exists(f"{output_dir}/project.json")

        # Verify schemas were extracted for both models
        base_schema = compiled_project.get_model_schema("base_model")
        assert base_schema is not None
        assert "id" in base_schema
        assert "value" in base_schema

        derived_schema = compiled_project.get_model_schema("derived_model")
        assert derived_schema is not None
        assert "double_value" in derived_schema
