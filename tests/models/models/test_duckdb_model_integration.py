import pytest
import tempfile
import os
import threading
import time
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.sources.duckdb_source import DuckdbSource


class TestDuckDBModelIntegration:
    """Test CSV script and local merge models for hanging issues."""

    def test_csv_script_model_write_operations(self):
        """Test that CSV script model properly uses read-write connections."""
        with tempfile.TemporaryDirectory() as temp_dir:
            csv_model = CsvScriptModel(
                name="test_csv_model",
                table_name="test_table",
                args=["echo", "id,name\n1,test\n2,example"],
                allow_empty=False,
            )

            # This should not hang and should properly create the database
            csv_model.insert_csv_to_duckdb(output_dir=temp_dir)

            # Verify the data was created
            source = csv_model.get_duckdb_source(output_dir=temp_dir)
            try:
                with source.connect(read_only=True) as conn:
                    result = conn.execute("SELECT COUNT(*) FROM test_table").fetchone()
                    assert result[0] == 2

                    data = conn.execute("SELECT * FROM test_table ORDER BY id").fetchall()
                    assert data[0] == (1, "test")
                    assert data[1] == (2, "example")
            finally:
                source.dispose_engines()

    def test_csv_script_model_concurrent_access(self):
        """Test that CSV script models don't hang with concurrent access."""
        with tempfile.TemporaryDirectory() as temp_dir:

            def create_csv_model(model_id):
                csv_model = CsvScriptModel(
                    name=f"test_csv_model_{model_id}",
                    table_name="test_table",
                    args=["echo", f"id,name\n{model_id},test{model_id}"],
                    allow_empty=False,
                )
                csv_model.insert_csv_to_duckdb(output_dir=temp_dir)
                return model_id

            results = []
            exceptions = []

            def worker(model_id):
                try:
                    result = create_csv_model(model_id)
                    results.append(result)
                except Exception as e:
                    exceptions.append(e)

            # Run multiple concurrent CSV script operations
            threads = []
            for i in range(3):
                thread = threading.Thread(target=worker, args=(i,))
                threads.append(thread)
                thread.start()

            # Wait for all threads with timeout
            for thread in threads:
                thread.join(timeout=10.0)
                if thread.is_alive():
                    pytest.fail("Thread hanging - CSV script model concurrency issue")

            # Verify all operations succeeded
            assert len(exceptions) == 0, f"Exceptions occurred: {exceptions}"
            assert len(results) == 3
            assert set(results) == {0, 1, 2}

    def test_duckdb_source_write_read_operations(self):
        """Test that DuckDB sources properly handle write/read operations without hanging."""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create a DuckDB source
            source = DuckdbSource(
                name="test_source", database=f"{temp_dir}/test_source.duckdb", type="duckdb"
            )

            try:
                # Test write operations
                with source.connect(read_only=False) as conn:
                    conn.execute("CREATE TABLE test_data (id INTEGER, value TEXT)")
                    conn.execute("INSERT INTO test_data VALUES (1, 'data1'), (2, 'data2')")

                # Test read operations immediately after write
                with source.connect(read_only=True) as conn:
                    result = conn.execute("SELECT COUNT(*) FROM test_data").fetchone()
                    assert result[0] == 2

                    data = conn.execute("SELECT * FROM test_data ORDER BY id").fetchall()
                    assert data[0] == (1, "data1")
                    assert data[1] == (2, "data2")

                # Test additional write operations
                with source.connect(read_only=False) as conn:
                    conn.execute("INSERT INTO test_data VALUES (3, 'data3')")

                # Test read after additional write
                with source.connect(read_only=True) as conn:
                    result = conn.execute("SELECT COUNT(*) FROM test_data").fetchone()
                    assert result[0] == 3

            finally:
                source.dispose_engines()

    def test_mixed_read_write_operations_no_hang(self):
        """Test mixed read/write operations don't cause hanging."""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create CSV model
            csv_model = CsvScriptModel(
                name="test_csv",
                table_name="csv_data",
                args=["echo", "id,value\n1,from_csv\n2,more_csv"],
                allow_empty=False,
            )

            # Create the CSV data
            csv_model.insert_csv_to_duckdb(output_dir=temp_dir)

            # Get the source and test read operations immediately after write
            source = csv_model.get_duckdb_source(output_dir=temp_dir)

            try:
                # Multiple read operations should not hang
                for i in range(5):
                    with source.connect(read_only=True) as conn:
                        result = conn.execute("SELECT COUNT(*) FROM csv_data").fetchone()
                        assert result[0] == 2

                # Write operation followed by reads
                with source.connect(read_only=False) as conn:
                    conn.execute("INSERT INTO csv_data VALUES (3, 'additional')")

                # Immediate read should work
                with source.connect(read_only=True) as conn:
                    result = conn.execute("SELECT COUNT(*) FROM csv_data").fetchone()
                    assert result[0] == 3

            finally:
                source.dispose_engines()

    def test_database_file_cleanup_and_reuse(self):
        """Test that database files can be cleaned up and reused without hanging."""
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = f"{temp_dir}/reuse_test.duckdb"

            # Create first source
            source1 = DuckdbSource(name="source1", database=db_path, type="duckdb")

            with source1.connect(read_only=False) as conn:
                conn.execute("CREATE TABLE test_data (id INTEGER)")
                conn.execute("INSERT INTO test_data VALUES (1)")

            # Dispose engines to release locks
            source1.dispose_engines()

            # Create second source with same path
            source2 = DuckdbSource(name="source2", database=db_path, type="duckdb")

            try:
                # Should be able to read existing data
                with source2.connect(read_only=True) as conn:
                    result = conn.execute("SELECT COUNT(*) FROM test_data").fetchone()
                    assert result[0] == 1

                # Should be able to write additional data
                with source2.connect(read_only=False) as conn:
                    conn.execute("INSERT INTO test_data VALUES (2)")

                # Verify both records exist
                with source2.connect(read_only=True) as conn:
                    result = conn.execute("SELECT COUNT(*) FROM test_data").fetchone()
                    assert result[0] == 2

            finally:
                source2.dispose_engines()

    def test_rapid_connection_cycling(self):
        """Test rapid opening/closing of connections doesn't cause resource leaks."""
        with tempfile.TemporaryDirectory() as temp_dir:
            source = DuckdbSource(
                name="rapid_test", database=f"{temp_dir}/rapid_test.duckdb", type="duckdb"
            )

            try:
                # Create initial data
                with source.connect(read_only=False) as conn:
                    conn.execute("CREATE TABLE rapid_data (id INTEGER)")
                    conn.execute("INSERT INTO rapid_data VALUES (1)")

                # Rapidly cycle through connections
                for i in range(20):
                    # Read operation
                    with source.connect(read_only=True) as conn:
                        result = conn.execute("SELECT COUNT(*) FROM rapid_data").fetchone()
                        assert result[0] >= 1

                    # Write operation every few iterations
                    if i % 5 == 0:
                        with source.connect(read_only=False) as conn:
                            conn.execute(f"INSERT INTO rapid_data VALUES ({i + 2})")

                # Final verification
                with source.connect(read_only=True) as conn:
                    result = conn.execute("SELECT COUNT(*) FROM rapid_data").fetchone()
                    assert result[0] >= 5  # At least original + 4 more

            finally:
                source.dispose_engines()
