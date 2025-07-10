import pytest
import tempfile
import os
from visivo.models.sources.duckdb_source import DuckdbSource
import time
import threading


class TestDuckDBConnectionManagement:
    """Test DuckDB connection management to prevent hanging issues."""

    def test_read_only_connection_prevents_writes(self):
        """Test that read-only connections properly prevent write operations."""
        with tempfile.NamedTemporaryFile(suffix=".duckdb", delete=False) as f:
            db_path = f.name

        try:
            # Create empty database file first
            DuckdbSource.create_empty_database(db_path)
            
            source = DuckdbSource(
                name="test_source",
                database=db_path,
                type="duckdb"
            )

            # Create initial table with read-write connection
            with source.connect(read_only=False) as conn:
                conn.execute("CREATE TABLE test_table (id INTEGER, name TEXT)")
                conn.execute("INSERT INTO test_table VALUES (1, 'test')")

            # Verify read-only connection can read
            with source.connect(read_only=True) as conn:
                result = conn.execute("SELECT * FROM test_table").fetchall()
                assert len(result) == 1
                assert result[0] == (1, 'test')

            # Verify read-only connection prevents writes
            with source.connect(read_only=True) as conn:
                with pytest.raises(Exception):  # Should raise DuckDB read-only error
                    conn.execute("INSERT INTO test_table VALUES (2, 'should_fail')")

        finally:
            # Cleanup engines and file
            if 'source' in locals():
                source.dispose_engines()
            if os.path.exists(db_path):
                os.unlink(db_path)

    def test_concurrent_read_only_connections_work(self):
        """Test that multiple read-only connections don't hang."""
        with tempfile.NamedTemporaryFile(suffix=".duckdb", delete=False) as f:
            db_path = f.name

        try:
            # Create empty database file first
            DuckdbSource.create_empty_database(db_path)
            
            source = DuckdbSource(
                name="test_source",
                database=db_path,
                type="duckdb"
            )

            # Create test data
            with source.connect(read_only=False) as conn:
                conn.execute("CREATE TABLE test_table (id INTEGER)")
                conn.execute("INSERT INTO test_table VALUES (1), (2), (3)")

            # Test concurrent read-only access
            results = []
            exceptions = []

            def read_data():
                try:
                    with source.connect(read_only=True) as conn:
                        result = conn.execute("SELECT COUNT(*) FROM test_table").fetchone()
                        results.append(result[0])
                except Exception as e:
                    exceptions.append(e)

            # Run multiple concurrent reads
            threads = []
            for _ in range(5):
                thread = threading.Thread(target=read_data)
                threads.append(thread)
                thread.start()

            # Wait for all threads with timeout
            for thread in threads:
                thread.join(timeout=5.0)
                if thread.is_alive():
                    pytest.fail("Thread hanging - concurrent read access issue")

            # Verify all reads succeeded
            assert len(exceptions) == 0, f"Exceptions occurred: {exceptions}"
            assert len(results) == 5
            assert all(result == 3 for result in results)

        finally:
            source.dispose_engines()
            if os.path.exists(db_path):
                os.unlink(db_path)

    def test_write_read_sequence_no_hang(self):
        """Test write followed by read operations don't hang."""
        with tempfile.NamedTemporaryFile(suffix=".duckdb", delete=False) as f:
            db_path = f.name

        try:
            # Create empty database file first
            DuckdbSource.create_empty_database(db_path)
            
            source = DuckdbSource(
                name="test_source",
                database=db_path,
                type="duckdb"
            )

            # Perform write operation
            with source.connect(read_only=False) as conn:
                conn.execute("CREATE TABLE test_table (id INTEGER)")
                conn.execute("INSERT INTO test_table VALUES (1)")

            # Immediately perform read operation (this was hanging)
            with source.connect(read_only=True) as conn:
                result = conn.execute("SELECT COUNT(*) FROM test_table").fetchone()
                assert result[0] == 1

            # Perform another write
            with source.connect(read_only=False) as conn:
                conn.execute("INSERT INTO test_table VALUES (2)")

            # Another read
            with source.connect(read_only=True) as conn:
                result = conn.execute("SELECT COUNT(*) FROM test_table").fetchone()
                assert result[0] == 2

        finally:
            source.dispose_engines()
            if os.path.exists(db_path):
                os.unlink(db_path)

    def test_engine_cleanup_releases_resources(self):
        """Test that engine disposal properly releases database locks."""
        with tempfile.NamedTemporaryFile(suffix=".duckdb", delete=False) as f:
            db_path = f.name

        try:
            # Create empty database file first
            DuckdbSource.create_empty_database(db_path)
            
            source1 = DuckdbSource(
                name="test_source1",
                database=db_path,
                type="duckdb"
            )

            # Create data with first source
            with source1.connect(read_only=False) as conn:
                conn.execute("CREATE TABLE test_table (id INTEGER)")
                conn.execute("INSERT INTO test_table VALUES (1)")

            # Dispose engines to release locks
            source1.dispose_engines()

            # Create second source pointing to same file
            source2 = DuckdbSource(
                name="test_source2",
                database=db_path,
                type="duckdb"
            )

            # Should be able to access file without hanging
            with source2.connect(read_only=True) as conn:
                result = conn.execute("SELECT COUNT(*) FROM test_table").fetchone()
                assert result[0] == 1

            source2.dispose_engines()

        finally:
            if os.path.exists(db_path):
                os.unlink(db_path)

    def test_attachment_with_read_only_works(self):
        """Test that database attachments work with read-only connections."""
        with tempfile.NamedTemporaryFile(suffix=".duckdb", delete=False) as f1, \
             tempfile.NamedTemporaryFile(suffix=".duckdb", delete=False) as f2:
            db1_path = f1.name
            db2_path = f2.name

        try:
            # Create first database
            DuckdbSource.create_empty_database(db1_path)
            source1 = DuckdbSource(
                name="db1_source",
                database=db1_path,
                type="duckdb"
            )
            with source1.connect(read_only=False) as conn:
                conn.execute("CREATE TABLE table1 (id INTEGER)")
                conn.execute("INSERT INTO table1 VALUES (1)")

            # Create second database
            DuckdbSource.create_empty_database(db2_path)
            source2 = DuckdbSource(
                name="db2_source",
                database=db2_path,
                type="duckdb"
            )
            with source2.connect(read_only=False) as conn:
                conn.execute("CREATE TABLE table2 (id INTEGER)")
                conn.execute("INSERT INTO table2 VALUES (2)")

            # Create source with attachment
            from visivo.models.sources.duckdb_source import DuckdbAttachment
            attached_source = DuckdbSource(
                name="main_source",
                database=db1_path,
                type="duckdb",
                attach=[DuckdbAttachment(schema_name="db2", source=source2)]
            )

            # Test read-only access with attachment
            with attached_source.connect(read_only=True) as conn:
                # Should be able to query both databases
                result1 = conn.execute("SELECT id FROM table1").fetchone()
                result2 = conn.execute("SELECT id FROM db2.table2").fetchone()
                assert result1[0] == 1
                assert result2[0] == 2

        finally:
            if 'source1' in locals():
                source1.dispose_engines()
            if 'source2' in locals():
                source2.dispose_engines() 
            if 'attached_source' in locals():
                attached_source.dispose_engines()
            for path in [db1_path, db2_path]:
                if os.path.exists(path):
                    os.unlink(path)

    def test_introspection_with_read_only(self):
        """Test that introspection works with read-only connections."""
        with tempfile.NamedTemporaryFile(suffix=".duckdb", delete=False) as f:
            db_path = f.name

        try:
            # Create empty database file first
            DuckdbSource.create_empty_database(db_path)
            
            source = DuckdbSource(
                name="test_source",
                database=db_path,
                type="duckdb"
            )

            # Create test data
            with source.connect(read_only=False) as conn:
                conn.execute("CREATE TABLE test_table (id INTEGER, name TEXT)")
                conn.execute("INSERT INTO test_table VALUES (1, 'test')")

            # Test introspection (should use read-only connection)
            metadata = source.introspect()
            
            assert metadata["name"] == "test_source"
            assert metadata["type"] == "duckdb"
            assert len(metadata["databases"]) >= 1
            
            # Find the main database
            main_db = None
            for db in metadata["databases"]:
                if "test_table" in [table["name"] for table in db.get("tables", [])]:
                    main_db = db
                    break
            
            assert main_db is not None
            test_table = next(table for table in main_db["tables"] if table["name"] == "test_table")
            assert "id" in test_table["columns"]
            assert "name" in test_table["columns"]

        finally:
            source.dispose_engines()
            if os.path.exists(db_path):
                os.unlink(db_path)