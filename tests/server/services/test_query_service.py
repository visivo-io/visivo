"""Tests for query execution service."""

import pytest
from unittest.mock import Mock, MagicMock
from visivo.server.services.query_service import execute_query_on_source, MAX_ROWS
from visivo.models.project import Project


class TestExecuteQueryOnSource:
    """Tests for execute_query_on_source function."""

    @pytest.fixture
    def mock_source(self):
        """Create a mock source."""
        source = Mock()
        source.name = "test_source"
        source.read_sql = Mock()
        return source

    @pytest.fixture
    def mock_project(self, mock_source):
        """Create a mock project with sources."""
        project = Mock(spec=Project)
        project.sources = [mock_source]
        project.defaults = Mock()
        project.defaults.source_name = "test_source"
        return project

    def test_execute_query_returns_correct_data(self, mock_project, mock_source):
        """Test that query execution returns correct data format."""
        # Setup mock result
        mock_result = [
            {"col1": "value1", "col2": 1},
            {"col1": "value2", "col2": 2},
        ]
        mock_source.read_sql.return_value = mock_result

        # Execute query
        result = execute_query_on_source("SELECT * FROM table", "test_source", mock_project)

        # Verify
        assert result["columns"] == ["col1", "col2"]
        assert result["rows"] == mock_result
        assert result["is_truncated"] is False
        assert result["source_name"] == "test_source"
        assert "execution_time" in result
        assert isinstance(result["execution_time"], (int, float))

    def test_execute_query_truncates_at_max_rows(self, mock_project, mock_source):
        """Test that large results are truncated at MAX_ROWS."""
        # Create result larger than MAX_ROWS
        mock_result = [{"col": i} for i in range(MAX_ROWS + 1000)]
        mock_source.read_sql.return_value = mock_result

        # Execute query
        result = execute_query_on_source("SELECT * FROM table", "test_source", mock_project)

        # Verify truncation
        assert len(result["rows"]) == MAX_ROWS
        assert result["is_truncated"] is True
        assert result["columns"] == ["col"]

    def test_execute_query_handles_empty_results(self, mock_project, mock_source):
        """Test handling of empty query results."""
        mock_source.read_sql.return_value = []

        result = execute_query_on_source("SELECT * FROM table", "test_source", mock_project)

        assert result["columns"] == []
        assert result["rows"] == []
        assert result["is_truncated"] is False
        assert result["source_name"] == "test_source"

    def test_execute_query_handles_none_results(self, mock_project, mock_source):
        """Test handling of None query results."""
        mock_source.read_sql.return_value = None

        result = execute_query_on_source("SELECT * FROM table", "test_source", mock_project)

        assert result["columns"] == []
        assert result["rows"] == []
        assert result["is_truncated"] is False

    def test_execute_query_uses_specified_source(self, mock_project, mock_source):
        """Test that the specified source is used."""
        mock_result = [{"col": "value"}]
        mock_source.read_sql.return_value = mock_result

        result = execute_query_on_source("SELECT * FROM table", "test_source", mock_project)

        mock_source.read_sql.assert_called_once_with("SELECT * FROM table")
        assert result["rows"] == mock_result

    def test_execute_query_uses_default_source_if_none_specified(self, mock_project, mock_source):
        """Test that default source is used when none specified."""
        mock_result = [{"col": "value"}]
        mock_source.read_sql.return_value = mock_result

        result = execute_query_on_source("SELECT * FROM table", None, mock_project)

        mock_source.read_sql.assert_called_once_with("SELECT * FROM table")
        assert result["rows"] == mock_result

    def test_execute_query_uses_first_source_if_no_default(self, mock_project, mock_source):
        """Test that first source is used when no default is set."""
        mock_project.defaults.source_name = None
        mock_result = [{"col": "value"}]
        mock_source.read_sql.return_value = mock_result

        result = execute_query_on_source("SELECT * FROM table", None, mock_project)

        mock_source.read_sql.assert_called_once()
        assert result["rows"] == mock_result

    def test_execute_query_raises_error_if_no_sources(self):
        """Test that ValueError is raised when no sources are available."""
        project = Mock(spec=Project)
        project.sources = []
        project.defaults = None

        with pytest.raises(ValueError, match="No source configured"):
            execute_query_on_source("SELECT * FROM table", None, project)

    def test_execute_query_raises_error_if_source_not_found(self, mock_project, mock_source):
        """Test that ValueError is raised when specified source is not found."""
        # Create project with different source name
        other_source = Mock()
        other_source.name = "other_source"
        mock_project.sources = [other_source]
        mock_project.defaults.source_name = None

        # Requesting non-existent source should fall back to first available source
        mock_result = [{"col": "value"}]
        other_source.read_sql.return_value = mock_result

        result = execute_query_on_source("SELECT * FROM table", "non_existent", mock_project)

        # Should use the first (and only) available source
        assert result["rows"] == mock_result

    def test_execute_query_handles_sql_errors(self, mock_project, mock_source):
        """Test that SQL execution errors are propagated."""
        mock_source.read_sql.side_effect = Exception("SQL execution failed")

        with pytest.raises(Exception, match="SQL execution failed"):
            execute_query_on_source("INVALID SQL", "test_source", mock_project)

    def test_execute_query_measures_execution_time(self, mock_project, mock_source):
        """Test that execution time is measured and returned."""
        import time

        def slow_query(query):
            time.sleep(0.1)  # Simulate slow query
            return [{"col": "value"}]

        mock_source.read_sql.side_effect = slow_query

        result = execute_query_on_source("SELECT * FROM table", "test_source", mock_project)

        # Execution time should be at least 0.1 seconds
        assert result["execution_time"] >= 0.1
        assert result["execution_time"] < 1.0  # Should be less than 1 second
