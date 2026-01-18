"""Tests for ModelDataService."""

import os
import pytest
import tempfile
import polars as pl
from unittest.mock import Mock, MagicMock

from visivo.server.services.model_data_service import ModelDataService


class TestModelDataService:
    """Test suite for ModelDataService."""

    @pytest.fixture
    def temp_dir(self):
        """Create a temporary directory for parquet files."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir

    @pytest.fixture
    def sample_parquet(self, temp_dir):
        """Create sample parquet file."""
        df = pl.DataFrame({"id": list(range(1, 101)), "value": [i * 1.5 for i in range(100)]})
        path = os.path.join(temp_dir, "existing_model.parquet")
        df.write_parquet(path)
        return temp_dir

    @pytest.fixture
    def mock_managers(self):
        """Create mock model and source managers."""
        model_manager = Mock()
        source_manager = Mock()
        return model_manager, source_manager

    def test_get_parquet_path(self, temp_dir, mock_managers):
        """Should return correct parquet path."""
        model_manager, source_manager = mock_managers
        service = ModelDataService(temp_dir, model_manager, source_manager)

        path = service.get_parquet_path("test_model")

        assert path == os.path.join(temp_dir, "test_model.parquet")

    def test_parquet_exists_true(self, sample_parquet, mock_managers):
        """Should detect existing parquet file."""
        model_manager, source_manager = mock_managers
        service = ModelDataService(sample_parquet, model_manager, source_manager)

        assert service.parquet_exists("existing_model") is True

    def test_parquet_exists_false(self, temp_dir, mock_managers):
        """Should detect missing parquet file."""
        model_manager, source_manager = mock_managers
        service = ModelDataService(temp_dir, model_manager, source_manager)

        assert service.parquet_exists("nonexistent") is False

    def test_get_data_from_parquet(self, sample_parquet, mock_managers):
        """Should read data from existing parquet."""
        model_manager, source_manager = mock_managers
        service = ModelDataService(sample_parquet, model_manager, source_manager)

        data = service.get_model_data("existing_model", limit=10, offset=0)

        assert data["source"] == "parquet"
        assert data["cached"] is True
        assert len(data["rows"]) == 10
        assert data["total_count"] == 100
        assert data["model_name"] == "existing_model"
        assert "id" in data["columns"]
        assert "value" in data["columns"]

    def test_get_data_pagination_first_page(self, sample_parquet, mock_managers):
        """Should paginate correctly for first page."""
        model_manager, source_manager = mock_managers
        service = ModelDataService(sample_parquet, model_manager, source_manager)

        page1 = service.get_model_data("existing_model", limit=10, offset=0)

        assert page1["rows"][0]["id"] == 1
        assert page1["limit"] == 10
        assert page1["offset"] == 0

    def test_get_data_pagination_second_page(self, sample_parquet, mock_managers):
        """Should paginate correctly for second page."""
        model_manager, source_manager = mock_managers
        service = ModelDataService(sample_parquet, model_manager, source_manager)

        page2 = service.get_model_data("existing_model", limit=10, offset=10)

        assert page2["rows"][0]["id"] == 11
        assert page2["offset"] == 10

    def test_get_data_on_demand_execution(self, temp_dir, mock_managers):
        """Should execute model when parquet doesn't exist."""
        model_manager, source_manager = mock_managers

        # Setup mocks
        mock_model = Mock()
        mock_model.name = "new_model"
        mock_model.sql = "SELECT 1 as col"
        mock_model.source = "ref(test_source)"
        model_manager.get.return_value = mock_model

        mock_source = Mock()
        mock_source.read_sql.return_value = [{"col": 1}, {"col": 2}, {"col": 3}]
        source_manager.get.return_value = mock_source

        service = ModelDataService(temp_dir, model_manager, source_manager)

        data = service.get_model_data("new_model", limit=100, offset=0)

        assert data["source"] == "query"
        assert data["cached"] is True
        assert "execution_time_ms" in data
        assert len(data["rows"]) == 3

        # Verify parquet was created
        assert os.path.exists(os.path.join(temp_dir, "new_model.parquet"))

    def test_get_data_on_demand_with_source_object(self, temp_dir, mock_managers):
        """Should handle inline source object."""
        model_manager, source_manager = mock_managers

        # Setup mocks - source is inline object
        mock_source = Mock()
        mock_source.name = "inline_source"
        mock_source.read_sql.return_value = [{"a": 1}]

        mock_model = Mock()
        mock_model.name = "model_with_inline"
        mock_model.sql = "SELECT 1 as a"
        mock_model.source = mock_source
        model_manager.get.return_value = mock_model

        service = ModelDataService(temp_dir, model_manager, source_manager)

        data = service.get_model_data("model_with_inline", limit=100, offset=0)

        assert data["source"] == "query"
        mock_source.read_sql.assert_called_once_with("SELECT 1 as a")

    def test_get_data_model_not_found(self, temp_dir, mock_managers):
        """Should raise ValueError when model not found."""
        model_manager, source_manager = mock_managers
        model_manager.get.return_value = None

        service = ModelDataService(temp_dir, model_manager, source_manager)

        with pytest.raises(ValueError, match="Model 'nonexistent' not found"):
            service.get_model_data("nonexistent", limit=100, offset=0)

    def test_get_data_source_not_found(self, temp_dir, mock_managers):
        """Should raise ValueError when source not found."""
        model_manager, source_manager = mock_managers

        mock_model = Mock()
        mock_model.name = "test_model"
        mock_model.sql = "SELECT 1"
        mock_model.source = "ref(missing_source)"
        model_manager.get.return_value = mock_model
        source_manager.get.return_value = None

        service = ModelDataService(temp_dir, model_manager, source_manager)

        with pytest.raises(ValueError, match="Source 'missing_source' not found"):
            service.get_model_data("test_model", limit=100, offset=0)

    def test_run_model(self, temp_dir, mock_managers):
        """Should run model and cache result."""
        model_manager, source_manager = mock_managers

        # Setup mocks
        mock_model = Mock()
        mock_model.name = "test_model"
        mock_model.sql = "SELECT * FROM table"
        mock_model.source = "ref(test_source)"
        model_manager.get.return_value = mock_model

        mock_source = Mock()
        mock_source.read_sql.return_value = [{"a": 1, "b": "x"}, {"a": 2, "b": "y"}]
        source_manager.get.return_value = mock_source

        service = ModelDataService(temp_dir, model_manager, source_manager)

        result = service.run_model("test_model")

        assert result["status"] == "success"
        assert result["row_count"] == 2
        assert result["columns"] == ["a", "b"]
        assert result["profile_invalidated"] is True
        assert result["sql_modified"] is False

        # Verify parquet was created
        assert os.path.exists(os.path.join(temp_dir, "test_model.parquet"))

    def test_run_model_with_custom_sql(self, temp_dir, mock_managers):
        """Should run with custom SQL and update model cache."""
        model_manager, source_manager = mock_managers

        # Setup mocks
        mock_model = Mock()
        mock_model.name = "test_model"
        mock_model.sql = "SELECT * FROM table"
        mock_model.source = "ref(test_source)"
        mock_model.model_dump.return_value = {"name": "test_model", "sql": "SELECT * FROM table"}
        model_manager.get.return_value = mock_model
        model_manager.save_from_config.return_value = mock_model

        mock_source = Mock()
        mock_source.read_sql.return_value = [{"a": 1}]
        source_manager.get.return_value = mock_source

        service = ModelDataService(temp_dir, model_manager, source_manager)

        custom_sql = "SELECT * FROM table WHERE id > 10"
        result = service.run_model("test_model", sql=custom_sql)

        assert result["sql_modified"] is True
        mock_source.read_sql.assert_called_once_with(custom_sql)
        model_manager.save_from_config.assert_called_once()

    def test_run_model_same_sql_not_modified(self, temp_dir, mock_managers):
        """Should not mark as modified when SQL is the same."""
        model_manager, source_manager = mock_managers

        # Setup mocks
        original_sql = "SELECT * FROM table"
        mock_model = Mock()
        mock_model.name = "test_model"
        mock_model.sql = original_sql
        mock_model.source = "ref(test_source)"
        model_manager.get.return_value = mock_model

        mock_source = Mock()
        mock_source.read_sql.return_value = [{"a": 1}]
        source_manager.get.return_value = mock_source

        service = ModelDataService(temp_dir, model_manager, source_manager)

        result = service.run_model("test_model", sql=original_sql)

        assert result["sql_modified"] is False
        model_manager.save_from_config.assert_not_called()

    def test_run_model_not_found(self, temp_dir, mock_managers):
        """Should raise ValueError when model not found."""
        model_manager, source_manager = mock_managers
        model_manager.get.return_value = None

        service = ModelDataService(temp_dir, model_manager, source_manager)

        with pytest.raises(ValueError, match="Model 'missing' not found"):
            service.run_model("missing")

    def test_run_model_empty_result(self, temp_dir, mock_managers):
        """Should handle empty query result."""
        model_manager, source_manager = mock_managers

        mock_model = Mock()
        mock_model.name = "empty_model"
        mock_model.sql = "SELECT * FROM empty_table"
        mock_model.source = "ref(test_source)"
        model_manager.get.return_value = mock_model

        mock_source = Mock()
        mock_source.read_sql.return_value = []
        source_manager.get.return_value = mock_source

        service = ModelDataService(temp_dir, model_manager, source_manager)

        result = service.run_model("empty_model")

        assert result["status"] == "success"
        assert result["row_count"] == 0
        assert result["columns"] == []

    def test_get_model_status_with_data(self, sample_parquet, mock_managers):
        """Should return status with data info."""
        model_manager, source_manager = mock_managers

        mock_model = Mock()
        mock_model.sql = "SELECT 1"
        model_manager.get.return_value = mock_model

        service = ModelDataService(sample_parquet, model_manager, source_manager)

        status = service.get_model_status("existing_model")

        assert status["exists"] is True
        assert status["has_data"] is True
        assert status["status"] == "ready"
        assert status["row_count"] == 100
        assert "data_updated_at" in status

    def test_get_model_status_without_data(self, temp_dir, mock_managers):
        """Should return not_run status when no parquet."""
        model_manager, source_manager = mock_managers

        mock_model = Mock()
        model_manager.get.return_value = mock_model

        service = ModelDataService(temp_dir, model_manager, source_manager)

        status = service.get_model_status("no_data_model")

        assert status["exists"] is True
        assert status["has_data"] is False
        assert status["status"] == "not_run"

    def test_get_model_status_not_found(self, temp_dir, mock_managers):
        """Should return exists=False when model not found."""
        model_manager, source_manager = mock_managers
        model_manager.get.return_value = None

        service = ModelDataService(temp_dir, model_manager, source_manager)

        status = service.get_model_status("nonexistent")

        assert status["exists"] is False

    def test_resolve_source_with_ref_string(self, temp_dir, mock_managers):
        """Should resolve source from ref() string."""
        model_manager, source_manager = mock_managers

        mock_model = Mock()
        mock_model.name = "test_model"
        mock_model.source = "ref(my_source)"

        mock_source = Mock()
        mock_source.name = "my_source"
        source_manager.get.return_value = mock_source

        service = ModelDataService(temp_dir, model_manager, source_manager)

        resolved = service._resolve_source(mock_model)

        assert resolved == mock_source
        source_manager.get.assert_called_once_with("my_source")

    def test_resolve_source_with_name_attribute(self, temp_dir, mock_managers):
        """Should resolve source from object with name attribute (ContextString ref)."""
        model_manager, source_manager = mock_managers

        # Use spec=[] to create a Mock without auto-created methods like read_sql
        # This simulates a ContextString object that wraps a ref
        source_ref = Mock(spec=[])
        source_ref.name = "named_source"

        mock_model = Mock()
        mock_model.name = "test_model"
        mock_model.source = source_ref

        mock_source = Mock()
        source_manager.get.return_value = mock_source

        service = ModelDataService(temp_dir, model_manager, source_manager)

        resolved = service._resolve_source(mock_model)

        assert resolved == mock_source
        source_manager.get.assert_called_once_with("named_source")

    def test_resolve_source_inline_object(self, temp_dir, mock_managers):
        """Should return inline source object directly."""
        model_manager, source_manager = mock_managers

        # Mock inline source with read_sql method (like a real Source object)
        inline_source = Mock()
        inline_source.read_sql.return_value = [{"a": 1}]

        mock_model = Mock()
        mock_model.name = "test_model"
        mock_model.source = inline_source

        service = ModelDataService(temp_dir, model_manager, source_manager)

        resolved = service._resolve_source(mock_model)

        assert resolved == inline_source
        source_manager.get.assert_not_called()

    def test_resolve_source_no_source(self, temp_dir, mock_managers):
        """Should raise ValueError when model has no source."""
        model_manager, source_manager = mock_managers

        mock_model = Mock()
        mock_model.name = "test_model"
        mock_model.source = None

        service = ModelDataService(temp_dir, model_manager, source_manager)

        with pytest.raises(ValueError, match="has no source configured"):
            service._resolve_source(mock_model)

    def test_get_data_handles_none_result(self, temp_dir, mock_managers):
        """Should handle None result from read_sql."""
        model_manager, source_manager = mock_managers

        mock_model = Mock()
        mock_model.name = "null_result_model"
        mock_model.sql = "SELECT 1"
        mock_model.source = "ref(test_source)"
        model_manager.get.return_value = mock_model

        mock_source = Mock()
        mock_source.read_sql.return_value = None
        source_manager.get.return_value = mock_source

        service = ModelDataService(temp_dir, model_manager, source_manager)

        data = service.get_model_data("null_result_model", limit=100, offset=0)

        assert data["rows"] == []
        assert data["columns"] == []
        assert data["total_count"] == 0
