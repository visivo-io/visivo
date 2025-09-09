"""
Tests for schema extraction during the compile phase.
"""

import os
import json
import pytest
from unittest.mock import Mock, MagicMock, patch
from tests.factories.model_factories import ProjectFactory, SqlModelFactory, SourceFactory
from tests.support.utils import temp_folder, temp_yml_file
from visivo.commands.compile_phase import compile_phase, _extract_source_schemas
from visivo.models.defaults import Defaults
from visivo.models.project import Project
from visivo.models.sources.duckdb_source import DuckdbSource
from visivo.parsers.file_names import PROJECT_FILE_NAME


class TestCompilePhaseSchemaExtraction:
    """Test schema extraction integration in compile phase."""

    @patch("visivo.commands.compile_phase.SchemaExtractor")
    def test_extract_source_schemas_success(self, mock_extractor_class):
        """Test successful schema extraction during compile."""
        # Create mock project
        project = Mock(spec=Project)

        # Create mock extractor instance
        mock_extractor = Mock()
        mock_extractor.extract_all_schemas = MagicMock(
            return_value={
                "source1": {
                    "model1": {"col1": "INTEGER", "col2": "VARCHAR"},
                    "model2": {"col3": "DECIMAL"},
                },
                "source2": {"model3": {"id": "INTEGER", "name": "TEXT"}},
            }
        )
        mock_extractor_class.return_value = mock_extractor

        # Call the extraction function
        schemas = _extract_source_schemas(project)

        # Verify results
        assert schemas is not None
        assert "source1" in schemas
        assert "source2" in schemas
        assert schemas["source1"]["model1"]["col1"] == "INTEGER"

    @patch("visivo.commands.compile_phase.SchemaExtractor")
    @patch("visivo.commands.compile_phase.Logger")
    def test_extract_source_schemas_failure(self, mock_logger, mock_extractor_class):
        """Test that schema extraction handles failures gracefully."""
        # Create mock project
        project = Mock(spec=Project)

        # Create mock extractor that raises exception
        mock_extractor_class.side_effect = Exception("Connection failed")

        # Call the extraction function
        schemas = _extract_source_schemas(project)

        # Verify graceful failure
        assert schemas is None

    def test_project_stores_extracted_schemas(self):
        """Test that extracted schemas are stored in the project object."""
        output_dir = temp_folder()

        # Create a minimal project dictionary with proper structure
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
                {
                    "name": "test_model",
                    "sql": "SELECT 1 as id, 'test' as name",
                    "source": "ref(test_source)",
                }
            ],
            "defaults": {"source_name": "test_source"},
        }

        # Save project to file
        tmp = temp_yml_file(dict=project_dict, name=PROJECT_FILE_NAME)
        working_dir = os.path.dirname(tmp)

        # Mock SchemaExtractor to avoid actual DB connection
        with patch("visivo.commands.compile_phase.SchemaExtractor") as mock_extractor_class:
            mock_extractor = Mock()
            mock_extractor.extract_all_schemas = MagicMock(
                return_value={"test_source": {"test_model": {"id": "INTEGER", "name": "VARCHAR"}}}
            )
            mock_extractor.get_schema_for_model = MagicMock(
                return_value={"id": "INTEGER", "name": "VARCHAR"}
            )
            mock_extractor_class.return_value = mock_extractor

            # Run compile phase
            compiled_project = compile_phase(
                default_source="test_source",
                working_dir=working_dir,
                output_dir=output_dir,
            )

        # Verify schemas are stored in project (not the extractor to avoid pickle errors)
        assert hasattr(compiled_project, "_extracted_schemas")

        # Verify we can retrieve the schema
        schema = compiled_project.get_model_schema("test_model")
        assert schema is not None
        assert "id" in schema
        assert schema["id"] == "INTEGER"

    def test_compile_phase_timing_includes_schema_extraction(self):
        """Test that compile phase logs include schema extraction timing."""
        output_dir = temp_folder()

        # Create a minimal project dictionary
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
            "models": [],
            "defaults": {"source_name": "test_source"},
        }

        # Save project to file
        tmp = temp_yml_file(dict=project_dict, name=PROJECT_FILE_NAME)
        working_dir = os.path.dirname(tmp)

        # Mock Logger to capture success message
        with patch("visivo.commands.compile_phase.Logger") as mock_logger:
            mock_logger_instance = Mock()
            mock_logger.instance.return_value = mock_logger_instance

            # Run compile phase
            compile_phase(
                default_source="test_source",
                working_dir=working_dir,
                output_dir=output_dir,
            )

            # Find the success call
            success_calls = [
                call
                for call in mock_logger_instance.success.call_args_list
                if "schemas:" in str(call)
            ]

            # Verify schema timing is included in success message
            assert len(success_calls) > 0
            success_message = str(success_calls[0])
            assert "schemas:" in success_message
            assert "s" in success_message  # Time unit

    def test_project_helper_methods(self):
        """Test the helper methods added to Project class."""
        project = Project(name="test_project")

        # Test when no schemas are extracted
        assert project.get_model_schema("any_model") is None
        assert project.get_all_extracted_schemas() is None

        # Manually set extracted schemas
        project._extracted_schemas = {
            "source1": {"model1": {"col1": "INTEGER", "col2": "TEXT"}, "model2": {"col3": "FLOAT"}},
            "source2": {"model3": {"id": "BIGINT", "data": "JSON"}},
        }

        # Test get_model_schema with source name
        schema = project.get_model_schema("model1", "source1")
        assert schema == {"col1": "INTEGER", "col2": "TEXT"}

        # Test get_model_schema without source name
        schema = project.get_model_schema("model3")
        assert schema == {"id": "BIGINT", "data": "JSON"}

        # Test get_model_schema for non-existent model
        schema = project.get_model_schema("non_existent")
        assert schema is None

        # Test get_all_extracted_schemas
        all_schemas = project.get_all_extracted_schemas()
        assert all_schemas is not None
        assert "source1" in all_schemas
        assert "source2" in all_schemas
