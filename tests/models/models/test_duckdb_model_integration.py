import pytest
import tempfile
import os
import threading
import time
from visivo.models.sources.duckdb_source import DuckdbSource
from visivo.models.sources.seed import Seed
from visivo.jobs.run_source_schema_job import run_seeds


def seeded_source(temp_dir, name, seeds):
    return DuckdbSource(name=name, database=f"{temp_dir}/{name}.duckdb", type="duckdb", seeds=seeds)


class TestDuckDBModelIntegration:
    """Test seeded DuckDB sources for hanging issues."""

    def test_seed_write_operations(self):
        """Test that loading a seed properly uses read-write connections."""
        with tempfile.TemporaryDirectory() as temp_dir:
            source = seeded_source(
                temp_dir,
                "test_seed_source",
                [Seed(table_name="test_table", args=["echo", "id,name\n1,test\n2,example"])],
            )

            # This should not hang and should properly create the database
            run_seeds(source)

            with source.connect(read_only=True) as conn:
                result = conn.execute("SELECT COUNT(*) FROM test_table").fetchone()
                assert result[0] == 2

                data = conn.execute("SELECT * FROM test_table ORDER BY id").fetchall()
                assert data[0] == (1, "test")
                assert data[1] == (2, "example")

    def test_seeded_sources_concurrent_access(self):
        """Test that seeded sources don't hang with concurrent access."""
        with tempfile.TemporaryDirectory() as temp_dir:

            def create_csv_model(model_id):
                source = seeded_source(
                    temp_dir,
                    f"test_seed_source_{model_id}",
                    [
                        Seed(
                            table_name="test_table",
                            args=["echo", f"id,name\n{model_id},test{model_id}"],
                        )
                    ],
                )
                run_seeds(source)
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
                    pytest.fail("Thread hanging - seeded source concurrency issue")

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

    def test_mixed_read_write_operations_no_hang(self):
        """Test mixed read/write operations don't cause hanging."""
        with tempfile.TemporaryDirectory() as temp_dir:
            source = seeded_source(
                temp_dir,
                "test_csv",
                [Seed(table_name="csv_data", args=["echo", "id,value\n1,from_csv\n2,more_csv"])],
            )

            # Load the seed, then read immediately after the write
            run_seeds(source)

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

            # Create second source with same path
            source2 = DuckdbSource(name="source2", database=db_path, type="duckdb")

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

    def test_rapid_connection_cycling(self):
        """Test rapid opening/closing of connections doesn't cause resource leaks."""
        with tempfile.TemporaryDirectory() as temp_dir:
            source = DuckdbSource(
                name="rapid_test", database=f"{temp_dir}/rapid_test.duckdb", type="duckdb"
            )

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
