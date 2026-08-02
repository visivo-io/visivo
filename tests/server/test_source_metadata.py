import pytest
from unittest.mock import Mock, patch, MagicMock
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from visivo.server.source_metadata import validate_source_from_config


class TestSourceMetadata:
    """Test suite for source_metadata module functions."""

    def setup_method(self):
        """Set up test fixtures."""
        # Create mock SqlalchemySource
        self.mock_source = Mock()
        self.mock_source.name = "test_source"
        self.mock_source.type = "postgresql"
        self.mock_source.database = "test_db"

        # Patch isinstance to recognize our mocks as SqlalchemySource
        self.isinstance_patcher = patch("visivo.server.source_metadata.isinstance")
        self.mock_isinstance = self.isinstance_patcher.start()

        def isinstance_side_effect(obj, cls):
            from visivo.models.sources.sqlalchemy_source import SqlalchemySource
            from visivo.models.sources.source import Source
            import builtins

            # Mock our test sources as both Source and SqlalchemySource
            if (
                (cls == SqlalchemySource or cls == Source)
                and hasattr(obj, "name")
                and hasattr(obj, "type")
            ):
                return True
            return builtins.isinstance(obj, cls)

        self.mock_isinstance.side_effect = isinstance_side_effect

    def teardown_method(self):
        """Clean up patches."""
        self.isinstance_patcher.stop()

    def test_validate_source_from_config_sqlite(self):
        """Test validate_source_from_config with SQLite source."""
        # Setup
        source_config = {"name": "test_sqlite", "type": "sqlite", "database": ":memory:"}

        # Execute
        with patch("visivo.server.source_metadata.TypeAdapter") as mock_adapter_class:
            with patch("visivo.server.source_metadata._test_source_connection") as mock_test:
                mock_test.return_value = {"source": "test_sqlite", "status": "connected"}
                mock_adapter = Mock()
                mock_adapter_class.return_value = mock_adapter
                mock_source = Mock()
                mock_adapter.validate_python.return_value = mock_source

                from visivo.models.sources.source import Source

                with patch("visivo.server.source_metadata.isinstance") as mock_isinstance:
                    mock_isinstance.return_value = True

                    result = validate_source_from_config(source_config)

        # Assert
        assert result["status"] == "connected"
        assert result["source"] == "test_sqlite"
        mock_adapter.validate_python.assert_called_once_with(source_config)
        mock_test.assert_called_once()

    def test_validate_source_from_config_invalid_type(self):
        """Test validate_source_from_config with invalid source type."""
        # Setup
        source_config = {"name": "test_invalid", "type": "invalid_type", "database": "test_db"}

        # Execute
        with patch("visivo.server.source_metadata.TypeAdapter") as mock_adapter_class:
            from pydantic import ValidationError

            mock_adapter = Mock()
            mock_adapter_class.return_value = mock_adapter

            # Simulate a ValidationError - use a generic Exception that will be caught
            mock_adapter.validate_python.side_effect = Exception("validation error")

            with patch("visivo.server.source_metadata.Logger"):
                result = validate_source_from_config(source_config)

        # Assert
        assert result["status"] == "connection_failed"
        assert result["error"]  # Just verify some error is returned

    def test_validate_source_from_config_csv(self):
        """Test validate_source_from_config with CSV source."""
        # Setup
        source_config = {"name": "test_csv", "type": "csv", "file": "/path/to/test.csv"}

        # Execute
        with patch("visivo.server.source_metadata.TypeAdapter") as mock_adapter_class:
            with patch("visivo.server.source_metadata._test_source_connection") as mock_test:
                mock_test.return_value = {"source": "test_csv", "status": "connected"}
                mock_adapter = Mock()
                mock_adapter_class.return_value = mock_adapter

                # Create a mock CSV source that has read_sql method
                mock_source = Mock()
                mock_source.read_sql = Mock(return_value=[{"test": 1}])
                mock_adapter.validate_python.return_value = mock_source

                from visivo.models.sources.source import Source

                with patch("visivo.server.source_metadata.isinstance") as mock_isinstance:
                    mock_isinstance.return_value = True

                    result = validate_source_from_config(source_config)

        # Assert
        assert result["status"] == "connected"
        assert result["source"] == "test_csv"
        mock_test.assert_called_once_with(mock_source, "test_csv")
