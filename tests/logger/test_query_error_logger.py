"""
Tests for visivo.logger.query_error_logger module.

This module tests the query error logging utility which:
- Writes failed queries to disk for debugging
- Extracts error location information from database error messages
- Formats error messages for display to users
"""

import pytest
import os
from visivo.logger.query_error_logger import log_failed_query, extract_error_location


class TestLogFailedQuery:
    """Tests for the log_failed_query function."""

    def test_creates_log_file(self, tmpdir):
        """Test that a log file is created with the query."""
        output_dir = str(tmpdir)
        query = "SELECT * FROM test_table WHERE invalid_column"
        error_msg = "Column 'invalid_column' not found"

        filepath = log_failed_query(
            output_dir=output_dir,
            item_name="test_insight",
            item_type="insight",
            query=query,
            error_msg=error_msg,
        )

        assert os.path.exists(filepath)
        assert filepath.endswith(".sql")

    def test_file_contains_query(self, tmpdir):
        """Test that the log file contains the original query."""
        output_dir = str(tmpdir)
        query = "SELECT a, b, c FROM my_table WHERE x > 10"
        error_msg = "Syntax error"

        filepath = log_failed_query(
            output_dir=output_dir,
            item_name="my_insight",
            item_type="insight",
            query=query,
            error_msg=error_msg,
        )

        with open(filepath, "r") as f:
            content = f.read()

        assert query in content

    def test_file_contains_error_message(self, tmpdir):
        """Test that the log file contains the error message as a comment."""
        output_dir = str(tmpdir)
        query = "SELECT * FROM test"
        error_msg = "Table 'test' does not exist"

        filepath = log_failed_query(
            output_dir=output_dir,
            item_name="test_insight",
            item_type="insight",
            query=query,
            error_msg=error_msg,
        )

        with open(filepath, "r") as f:
            content = f.read()

        assert error_msg in content
        assert "-- Error:" in content

    def test_file_contains_item_name(self, tmpdir):
        """Test that the log file contains the item name."""
        output_dir = str(tmpdir)
        query = "SELECT 1"
        item_name = "my_special_insight"

        filepath = log_failed_query(
            output_dir=output_dir,
            item_name=item_name,
            item_type="insight",
            query=query,
            error_msg="Error",
        )

        with open(filepath, "r") as f:
            content = f.read()

        assert item_name in content

    def test_file_contains_error_location(self, tmpdir):
        """Test that error location is included when provided."""
        output_dir = str(tmpdir)
        error_location = "line 7, column 45"

        filepath = log_failed_query(
            output_dir=output_dir,
            item_name="test",
            item_type="insight",
            query="SELECT 1",
            error_msg="Error",
            error_location=error_location,
        )

        with open(filepath, "r") as f:
            content = f.read()

        assert error_location in content
        assert "-- Location:" in content

    def test_creates_logs_directory_structure(self, tmpdir):
        """Test that the logs/failed_queries directory structure is created."""
        output_dir = str(tmpdir)

        filepath = log_failed_query(
            output_dir=output_dir,
            item_name="test",
            item_type="insight",
            query="SELECT 1",
            error_msg="Error",
        )

        logs_dir = os.path.join(output_dir, "logs", "failed_queries")
        assert os.path.isdir(logs_dir)

    def test_sanitizes_item_name_for_filename(self, tmpdir):
        """Test that special characters in item name are sanitized for filename."""
        output_dir = str(tmpdir)

        filepath = log_failed_query(
            output_dir=output_dir,
            item_name="my/insight with spaces & special@chars!",
            item_type="insight",
            query="SELECT 1",
            error_msg="Error",
        )

        # Filename should not contain problematic characters
        filename = os.path.basename(filepath)
        assert "/" not in filename
        assert " " not in filename
        assert "@" not in filename
        assert "!" not in filename

    def test_truncates_long_item_names(self, tmpdir):
        """Test that very long item names are truncated in filename."""
        output_dir = str(tmpdir)
        long_name = "a" * 200  # Very long name

        filepath = log_failed_query(
            output_dir=output_dir,
            item_name=long_name,
            item_type="insight",
            query="SELECT 1",
            error_msg="Error",
        )

        filename = os.path.basename(filepath)
        # Filename should be reasonable length
        assert len(filename) < 150

    def test_different_item_types(self, tmpdir):
        """Test that different item types are reflected in filename."""
        output_dir = str(tmpdir)

        insight_path = log_failed_query(
            output_dir=output_dir,
            item_name="test",
            item_type="insight",
            query="SELECT 1",
            error_msg="Error",
        )

        trace_path = log_failed_query(
            output_dir=output_dir,
            item_name="test",
            item_type="trace",
            query="SELECT 1",
            error_msg="Error",
        )

        assert "insight_" in insight_path
        assert "trace_" in trace_path


class TestExtractErrorLocation:
    """Tests for the extract_error_location function."""

    def test_extracts_bigquery_format(self):
        """Test extracting error location from BigQuery error format."""
        error_msg = "Syntax error: Unexpected string literal 'x' at [7:45]"

        result = extract_error_location(error_msg)

        assert result == "line 7, column 45"

    def test_extracts_bigquery_format_different_position(self):
        """Test extracting error location from BigQuery error with different position."""
        error_msg = "Syntax error at [15:123]"

        result = extract_error_location(error_msg)

        assert result == "line 15, column 123"

    def test_extracts_postgres_character_format(self):
        """Test extracting error location from PostgreSQL character position format."""
        error_msg = "syntax error at character 42"

        result = extract_error_location(error_msg)

        assert result == "character 42"

    def test_extracts_generic_line_column_format(self):
        """Test extracting error location from generic line/column format."""
        error_msg = "Error at line 5, column 10"

        result = extract_error_location(error_msg)

        assert result == "line 5, column 10"

    def test_extracts_line_only_format(self):
        """Test extracting error location when only line number is present."""
        error_msg = "Error on line 23"

        result = extract_error_location(error_msg)

        assert result == "line 23"

    def test_returns_none_for_no_location(self):
        """Test that None is returned when no location info is present."""
        error_msg = "Generic database error with no location info"

        result = extract_error_location(error_msg)

        assert result is None

    def test_returns_none_for_empty_string(self):
        """Test that None is returned for empty error message."""
        result = extract_error_location("")

        assert result is None

    def test_returns_none_for_none_input(self):
        """Test that None is returned for None input."""
        result = extract_error_location(None)

        assert result is None

    def test_case_insensitive_matching(self):
        """Test that pattern matching is case insensitive."""
        error_msg = "Error on LINE 10, COLUMN 20"

        result = extract_error_location(error_msg)

        assert result == "line 10, column 20"

    def test_complex_bigquery_error(self):
        """Test extraction from a realistic BigQuery error message."""
        error_msg = (
            "(google.cloud.bigquery.dbapi.exceptions.DatabaseError) 400 POST "
            "https://bigquery.googleapis.com/bigquery/v2/projects/myproject/queries?prettyPrint=false: "
            "Syntax error: Unexpected string literal 'x' at [7:45]"
        )

        result = extract_error_location(error_msg)

        assert result == "line 7, column 45"
