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
        mock_test.assert_called_once_with(mock_source, "test_csv", None)


class TestSqliteConnectionTestDoesNotCreateFiles:
    def test_missing_sqlite_file_fails_and_creates_nothing(self, tmp_path):
        from visivo.server.source_metadata import validate_source_from_config

        target = tmp_path / "nested" / "missing.db"
        result = validate_source_from_config(
            {"name": "s", "type": "sqlite", "database": str(target)}
        )

        assert result["status"] == "connection_failed"
        assert result["error"] == f"File not found: {target}"
        assert not target.exists()
        assert not target.parent.exists()

    def test_memory_database_connects(self):
        from visivo.server.source_metadata import validate_source_from_config

        result = validate_source_from_config(
            {"name": "s", "type": "sqlite", "database": ":memory:"}
        )

        assert result["status"] == "connected"

    def test_existing_sqlite_file_connects(self, tmp_path):
        import sqlite3
        from visivo.server.source_metadata import validate_source_from_config

        db = tmp_path / "ok.db"
        sqlite3.connect(db).close()
        result = validate_source_from_config({"name": "s", "type": "sqlite", "database": str(db)})

        assert result["status"] == "connected"


class TestFileDatabaseConnectionTest:
    def _duckdb(self, database):
        return {"name": "d", "type": "duckdb", "database": database}

    def test_missing_duckdb_file_fails_and_creates_nothing(self, tmp_path):
        from visivo.server.source_metadata import validate_source_from_config

        target = tmp_path / "missing.duckdb"
        result = validate_source_from_config(self._duckdb(str(target)))

        assert result["status"] == "connection_failed"
        assert result["error"] == f"File not found: {target}"
        assert not target.exists()

    def test_a_relative_path_is_looked_for_in_the_project_folder(self, tmp_path, monkeypatch):
        import sqlite3
        from visivo.server.source_metadata import validate_source_from_config

        project_dir = tmp_path / "project"
        (project_dir / "data").mkdir(parents=True)
        sqlite3.connect(project_dir / "data" / "local.db").close()
        elsewhere = tmp_path / "elsewhere"
        elsewhere.mkdir()
        monkeypatch.chdir(elsewhere)
        config = {"name": "s", "type": "sqlite", "database": "data/local.db"}

        missing = validate_source_from_config(config, str(tmp_path / "other"))
        assert missing["error"] == f"File not found: {tmp_path / 'other' / 'data/local.db'}"

        monkeypatch.chdir(project_dir)
        assert validate_source_from_config(config, str(project_dir))["status"] == "connected"

    def test_the_source_manager_passes_its_project_folder(self, tmp_path):
        from visivo.server.managers.source_manager import SourceManager

        manager = SourceManager(project_dir=str(tmp_path))
        manager.save_from_config({"name": "s", "type": "duckdb", "database": "nope.duckdb"})

        result = manager.test_connection("s")

        assert result["status"] == "connection_failed"
        assert result["error"] == f"File not found: {tmp_path / 'nope.duckdb'}"
        assert not (tmp_path / "nope.duckdb").exists()


class TestConnectionTestFallbacks:
    def test_a_source_without_read_sql_is_tested_by_connecting(self):
        from visivo.server.source_metadata import _test_source_connection

        class ConnectOnly:
            connected = False

            def read_sql(self, _sql):
                raise AttributeError("read_sql")

            def connect(self):
                source = self

                class Connection:
                    def __enter__(self):
                        source.connected = True

                    def __exit__(self, *exc):
                        return False

                return Connection()

        source = ConnectOnly()
        assert _test_source_connection(source, "c") == {"source": "c", "status": "connected"}
        assert source.connected

    def test_a_config_that_is_not_a_mapping_fails_with_its_error(self):
        from visivo.server.source_metadata import validate_source_from_config

        result = validate_source_from_config(["not", "a", "dict"])

        assert result["status"] == "connection_failed"
        assert "get" in result["error"]

    def test_an_invalid_config_names_the_field(self):
        from visivo.server.source_metadata import validate_source_from_config

        result = validate_source_from_config({"name": "s", "type": "sqlite"})

        assert result["status"] == "connection_failed"
        assert result["error"].startswith("Invalid source configuration: ")
        assert "database" in result["error"]
