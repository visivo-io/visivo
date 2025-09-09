"""
Tests for the schema extraction functionality during compile phase.
"""

import pytest
from unittest.mock import Mock, MagicMock, patch
from visivo.query.schema_extractor import SchemaExtractor
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.duckdb_source import DuckdbSource
from visivo.models.defaults import Defaults


class TestSchemaExtractor:
    """Test suite for SchemaExtractor class."""

    def test_schema_extractor_initialization(self):
        """Test that SchemaExtractor initializes correctly with a project."""
        project = Mock(spec=Project)
        project.sources = []
        project.models = []

        extractor = SchemaExtractor(project)

        assert extractor.project == project
        assert extractor._schema_cache == {}
        assert extractor._source_map == {}

    def test_build_source_map(self):
        """Test that source map is built correctly from project sources."""
        # Create mock sources
        source1 = Mock()
        source1.name = "source1"
        source2 = Mock()
        source2.name = "source2"

        project = Mock(spec=Project)
        project.sources = [source1, source2]
        project.models = []

        extractor = SchemaExtractor(project)

        assert len(extractor._source_map) == 2
        assert extractor._source_map["source1"] == source1
        assert extractor._source_map["source2"] == source2

    def test_get_used_sources_with_sql_models(self):
        """Test that used sources are correctly identified from SQL models."""
        # Create a mock source
        source = Mock()
        source.name = "test_source"

        # Create SQL models with different source configurations
        model1 = Mock(spec=SqlModel)
        model1.source = "ref(test_source)"
        model1.name = "model1"

        model2 = Mock(spec=SqlModel)
        model2.source = "test_source"
        model2.name = "model2"

        model3 = Mock(spec=SqlModel)
        model3.source = None  # Uses default
        model3.name = "model3"

        # Create project with models and sources
        project = Mock(spec=Project)
        project.sources = [source]
        project.models = [model1, model2, model3]
        project.defaults = Defaults(source_name="default_source")

        extractor = SchemaExtractor(project)
        used_sources = extractor._get_used_sources()

        assert "test_source" in used_sources
        assert "default_source" in used_sources
        assert len(used_sources) == 2

    def test_extract_source_name_from_ref(self):
        """Test extraction of source name from ref() syntax."""
        project = Mock(spec=Project)
        project.sources = []
        project.models = []

        extractor = SchemaExtractor(project)

        # Test ref() syntax
        assert extractor._extract_source_name("ref(my_source)") == "my_source"

        # Test direct source name
        assert extractor._extract_source_name("direct_source") == "direct_source"

        # Test source object with name attribute
        source_obj = Mock()
        source_obj.name = "object_source"
        assert extractor._extract_source_name(source_obj) == "object_source"

        # Test None case
        assert extractor._extract_source_name(None) is None

    @patch("visivo.query.schema_extractor.Logger")
    def test_extract_model_schema_success(self, mock_logger):
        """Test successful schema extraction for a model."""
        # Create mock source with get_model_schema method
        source = Mock()
        source.name = "test_source"
        source.get_model_schema = MagicMock(
            return_value={"id": "INTEGER", "name": "VARCHAR", "amount": "DECIMAL"}
        )

        # Create SQL model
        model = Mock(spec=SqlModel)
        model.name = "test_model"
        model.sql = "SELECT * FROM test_table"

        project = Mock(spec=Project)
        project.sources = []
        project.models = []

        extractor = SchemaExtractor(project)

        # Extract schema
        schema = extractor._extract_model_schema(source, model)

        assert schema is not None
        assert "id" in schema
        assert schema["id"] == "INTEGER"
        assert schema["name"] == "VARCHAR"
        assert schema["amount"] == "DECIMAL"

        # Verify get_model_schema was called with correct args
        source.get_model_schema.assert_called_once_with(model_sql="SELECT * FROM test_table")

    @patch("visivo.query.schema_extractor.Logger")
    def test_extract_model_schema_failure(self, mock_logger):
        """Test schema extraction handles failures gracefully."""
        # Create mock source that raises exception
        source = Mock()
        source.name = "test_source"
        source.get_model_schema = MagicMock(side_effect=Exception("Database connection failed"))

        # Create SQL model
        model = Mock(spec=SqlModel)
        model.name = "test_model"
        model.sql = "SELECT * FROM test_table"

        project = Mock(spec=Project)
        project.sources = []
        project.models = []

        extractor = SchemaExtractor(project)

        # Extract schema - should return None on failure
        schema = extractor._extract_model_schema(source, model)

        assert schema is None

    @patch("visivo.query.schema_extractor.Logger")
    def test_extract_all_schemas_integration(self, mock_logger):
        """Test full extraction of schemas for all models."""
        # Create mock source
        source = Mock()
        source.name = "main_source"
        source.get_model_schema = MagicMock(
            side_effect=[
                {"col1": "INTEGER", "col2": "TEXT"},  # For model1
                {"col3": "DECIMAL", "col4": "TIMESTAMP"},  # For model2
            ]
        )

        # Create SQL models
        model1 = Mock(spec=SqlModel)
        model1.name = "model1"
        model1.sql = "SELECT col1, col2 FROM table1"
        model1.source = "ref(main_source)"

        model2 = Mock(spec=SqlModel)
        model2.name = "model2"
        model2.sql = "SELECT col3, col4 FROM table2"
        model2.source = "main_source"

        # Create project
        project = Mock(spec=Project)
        project.sources = [source]
        project.models = [model1, model2]
        project.defaults = None

        extractor = SchemaExtractor(project)
        schemas = extractor.extract_all_schemas()

        # Verify structure
        assert "main_source" in schemas
        assert "model1" in schemas["main_source"]
        assert "model2" in schemas["main_source"]

        # Verify model1 schema
        assert schemas["main_source"]["model1"]["col1"] == "INTEGER"
        assert schemas["main_source"]["model1"]["col2"] == "TEXT"

        # Verify model2 schema
        assert schemas["main_source"]["model2"]["col3"] == "DECIMAL"
        assert schemas["main_source"]["model2"]["col4"] == "TIMESTAMP"

    def test_schema_caching(self):
        """Test that schemas are cached after first extraction."""
        # Create mock source
        source = Mock()
        source.name = "cached_source"
        source.get_model_schema = MagicMock(return_value={"id": "INTEGER", "value": "FLOAT"})

        # Create SQL model
        model = Mock(spec=SqlModel)
        model.name = "cached_model"
        model.sql = "SELECT * FROM cached_table"
        model.source = "cached_source"

        # Create project
        project = Mock(spec=Project)
        project.sources = [source]
        project.models = [model]
        project.defaults = None

        extractor = SchemaExtractor(project)

        # First extraction
        schemas1 = extractor.extract_all_schemas()

        # Second extraction - should use cache
        schemas2 = extractor.extract_all_schemas()

        # Verify get_model_schema was called only once due to caching
        assert source.get_model_schema.call_count == 1

        # Verify both results are the same
        assert schemas1 == schemas2

    def test_get_schema_for_model(self):
        """Test retrieving schema for a specific model."""
        project = Mock(spec=Project)
        project.sources = []
        project.models = []

        extractor = SchemaExtractor(project)

        # Manually populate cache
        extractor._schema_cache = {
            "source1:model1": {"col1": "INTEGER", "col2": "TEXT"},
            "source2:model2": {"col3": "DECIMAL", "col4": "DATE"},
        }

        # Test with source name
        schema = extractor.get_schema_for_model("model1", "source1")
        assert schema == {"col1": "INTEGER", "col2": "TEXT"}

        # Test without source name
        schema = extractor.get_schema_for_model("model2")
        assert schema == {"col3": "DECIMAL", "col4": "DATE"}

        # Test non-existent model
        schema = extractor.get_schema_for_model("non_existent")
        assert schema is None
