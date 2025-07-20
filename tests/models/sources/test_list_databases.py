"""Tests for list_databases method implementations across all source types."""

import pytest
from unittest.mock import patch, MagicMock, Mock
from typing import Literal
from visivo.models.sources.bigquery_source import BigQuerySource
from visivo.models.sources.sqlite_source import SqliteSource
from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from visivo.models.sources.duckdb_source import DuckdbSource
from visivo.models.sources.mysql_source import MysqlSource
from visivo.models.sources.postgresql_source import PostgresqlSource
from visivo.models.sources.snowflake_source import SnowflakeSource


class TestListDatabasesImplementations:
    """Test that all sources implement list_databases with proper connection testing."""

    def test_base_sqlalchemy_source_raises_not_implemented(self):
        """Test that base SqlalchemySource raises NotImplementedError."""

        # Create a concrete subclass for testing
        class TestSource(SqlalchemySource):
            type: Literal["test"] = "test"

            def get_dialect(self):
                return "test"

        source = TestSource(name="test", database="test_db")

        with pytest.raises(NotImplementedError) as exc_info:
            source.list_databases()

        assert "must implement list_databases() method" in str(exc_info.value)
        assert "TestSource" in str(exc_info.value)

    def test_bigquery_list_databases_queries_datasets(self):
        """Test BigQuery lists datasets from INFORMATION_SCHEMA."""
        source = BigQuerySource(
            name="bq_test", type="bigquery", project="test-project", database="test_dataset"
        )

        # Mock successful dataset query
        # Create a mock Polars DataFrame-like object
        mock_result = Mock()
        mock_result.height = 3
        mock_result.__getitem__ = Mock(
            return_value=Mock(to_list=Mock(return_value=["dataset1", "dataset2", "test_dataset"]))
        )

        with patch.object(BigQuerySource, "read_sql", return_value=mock_result) as mock_read_sql:
            databases = source.list_databases()

            # Verify it queries INFORMATION_SCHEMA.SCHEMATA
            mock_read_sql.assert_called_once()
            query = mock_read_sql.call_args[0][0]
            assert "INFORMATION_SCHEMA.SCHEMATA" in query
            assert "test-project" in query

            # Verify it returns the datasets
            assert databases == ["dataset1", "dataset2", "test_dataset"]

    def test_bigquery_list_databases_fallback_on_error(self):
        """Test BigQuery falls back to testing configured dataset on error."""
        source = BigQuerySource(
            name="bq_test", type="bigquery", project="test-project", database="test_dataset"
        )

        # Mock query failure then success on fallback
        with patch.object(BigQuerySource, "read_sql") as mock_read_sql:
            # Create an empty Polars DataFrame mock
            empty_df = Mock()
            empty_df.height = 0

            mock_read_sql.side_effect = [
                Exception("Can't list datasets"),  # First query fails
                empty_df,  # Second query succeeds (testing configured dataset)
            ]

            databases = source.list_databases()

            # Should have tried twice - list all, then test configured
            assert mock_read_sql.call_count == 2

            # Verify second query tests the configured dataset
            second_query = mock_read_sql.call_args_list[1][0][0]
            assert "test-project.test_dataset.INFORMATION_SCHEMA.TABLES" in second_query

            # Should return configured dataset on fallback success
            assert databases == ["test_dataset"]

    def test_bigquery_list_databases_raises_on_total_failure(self):
        """Test BigQuery raises exception when connection fails completely."""
        source = BigQuerySource(
            name="bq_test", type="bigquery", project="test-project", database="test_dataset"
        )

        # Mock all queries failing
        with patch.object(BigQuerySource, "read_sql", side_effect=Exception("Connection failed")):
            with pytest.raises(Exception) as exc_info:
                source.list_databases()

            assert "Connection failed" in str(exc_info.value)

    def test_sqlite_list_databases_tests_connection(self):
        """Test SQLite verifies database is accessible."""
        source = SqliteSource(name="sqlite_test", type="sqlite", database="/path/to/test.db")

        # Mock successful connection test
        mock_connection = MagicMock()
        mock_connection.__enter__ = MagicMock(return_value=mock_connection)
        mock_connection.__exit__ = MagicMock(return_value=None)

        with patch.object(SqliteSource, "get_connection", return_value=mock_connection):
            databases = source.list_databases()

            # Verify it tests connection with SELECT 1
            # The query is wrapped in text() for SQLAlchemy
            assert mock_connection.execute.called
            call_args = mock_connection.execute.call_args[0][0]
            assert hasattr(call_args, "text")  # It's a TextClause object
            assert str(call_args) == "SELECT 1"

            # SQLite always returns "main"
            assert databases == ["main"]

    def test_sqlite_list_databases_with_attachments(self):
        """Test SQLite includes attached databases."""
        attached_source = SqliteSource(
            name="attached", type="sqlite", database="/path/to/attached.db"
        )

        source = SqliteSource(
            name="sqlite_test",
            type="sqlite",
            database="/path/to/test.db",
            attach=[{"schema_name": "other_db", "source": attached_source}],
        )

        # Mock successful connection test
        mock_connection = MagicMock()
        mock_connection.__enter__ = MagicMock(return_value=mock_connection)
        mock_connection.__exit__ = MagicMock(return_value=None)

        with patch.object(SqliteSource, "get_connection", return_value=mock_connection):
            databases = source.list_databases()

            # Should include main and attached databases
            assert databases == ["main", "other_db"]

    def test_sqlite_list_databases_raises_on_failure(self):
        """Test SQLite raises exception when database is inaccessible."""
        source = SqliteSource(name="sqlite_test", type="sqlite", database="/path/to/nonexistent.db")

        # Mock connection failure
        with patch.object(
            SqliteSource, "get_connection", side_effect=Exception("Database not found")
        ):
            with pytest.raises(Exception) as exc_info:
                source.list_databases()

            assert "Database not found" in str(exc_info.value)

    def test_all_sources_have_list_databases_implementation(self):
        """Verify all source classes implement list_databases."""
        source_classes = [
            DuckdbSource,
            MysqlSource,
            PostgresqlSource,
            SnowflakeSource,
            BigQuerySource,
            SqliteSource,
        ]

        for source_class in source_classes:
            # Check that the class has its own list_databases method
            assert hasattr(source_class, "list_databases")

            # Verify it's not just inherited from SqlalchemySource
            assert source_class.list_databases != SqlalchemySource.list_databases

            # Get the method
            method = getattr(source_class, "list_databases")

            # Verify it's defined in the source class itself
            assert method.__qualname__.startswith(source_class.__name__)
