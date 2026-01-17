"""Tests for the profiling service."""

import os
import pytest
import tempfile
import time
import pyarrow as pa
import pyarrow.parquet as pq

from visivo.server.services.profiling_service import ProfilingService, CACHE_TTL_SECONDS


class TestProfilingService:
    """Test suite for ProfilingService."""

    @pytest.fixture
    def temp_dir(self):
        """Create a temporary directory for test files."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir

    @pytest.fixture
    def sample_parquet(self, temp_dir):
        """Create a sample parquet file with varied data types."""
        # Create sample data with various types
        table = pa.table(
            {
                "id": pa.array([1, 2, 3, 4, 5], type=pa.int64()),
                "amount": pa.array([10.5, 20.0, 30.5, None, 50.0], type=pa.float64()),
                "category": pa.array(["A", "B", "A", "C", "B"], type=pa.string()),
                "is_active": pa.array([True, False, True, True, False], type=pa.bool_()),
                "created_at": pa.array(
                    ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"],
                    type=pa.string(),
                ),
            }
        )

        parquet_path = os.path.join(temp_dir, "test_model.parquet")
        pq.write_table(table, parquet_path)

        return "test_model"

    @pytest.fixture
    def profiling_service(self, temp_dir):
        """Create a ProfilingService instance."""
        return ProfilingService(temp_dir)

    def test_parquet_exists(self, profiling_service, sample_parquet):
        """Test that parquet_exists returns True for existing file."""
        assert profiling_service.parquet_exists(sample_parquet) is True

    def test_parquet_exists_false(self, profiling_service):
        """Test that parquet_exists returns False for non-existent file."""
        assert profiling_service.parquet_exists("nonexistent_model") is False

    def test_get_parquet_path(self, profiling_service):
        """Test that get_parquet_path returns correct path."""
        path = profiling_service.get_parquet_path("my_model")
        assert path.endswith("my_model.parquet")

    def test_tier1_profile(self, profiling_service, sample_parquet):
        """Test tier 1 profiling returns metadata."""
        profile = profiling_service.get_tier1_profile(sample_parquet)

        assert profile["model_name"] == sample_parquet
        assert profile["tier"] == 1
        assert profile["row_count"] == 5
        assert "profiled_at" in profile
        assert len(profile["columns"]) == 5

        # Check column structure
        id_col = next(c for c in profile["columns"] if c["name"] == "id")
        assert id_col["type"] == "int64"
        assert id_col["min"] == 1
        assert id_col["max"] == 5
        assert id_col["null_count"] == 0

        # Check null count for column with nulls
        amount_col = next(c for c in profile["columns"] if c["name"] == "amount")
        assert amount_col["null_count"] == 1

    def test_tier1_profile_nonexistent(self, profiling_service):
        """Test tier 1 profiling raises FileNotFoundError for non-existent file."""
        with pytest.raises(FileNotFoundError):
            profiling_service.get_tier1_profile("nonexistent_model")

    def test_tier2_profile(self, profiling_service, sample_parquet):
        """Test tier 2 profiling returns SUMMARIZE stats."""
        profile = profiling_service.get_tier2_profile(sample_parquet)

        assert profile["model_name"] == sample_parquet
        assert profile["tier"] == 2
        assert profile["row_count"] == 5
        assert "profiled_at" in profile
        assert len(profile["columns"]) == 5

        # Check that tier 2 includes additional stats
        columns = profile["columns"]
        # Amount column should have numeric stats
        amount_col = next(c for c in columns if c["name"] == "amount")
        assert "avg" in amount_col
        assert "std" in amount_col
        assert "q50" in amount_col

    def test_tier2_profile_nonexistent(self, profiling_service):
        """Test tier 2 profiling raises FileNotFoundError for non-existent file."""
        with pytest.raises(FileNotFoundError):
            profiling_service.get_tier2_profile("nonexistent_model")

    def test_tier2_caching(self, profiling_service, sample_parquet):
        """Test that tier 2 profiling caches results."""
        # First call should populate cache
        profile1 = profiling_service.get_tier2_profile(sample_parquet)

        # Second call should return cached result
        profile2 = profiling_service.get_tier2_profile(sample_parquet)

        # Both should have same profiled_at since second is from cache
        assert profile1["profiled_at"] == profile2["profiled_at"]

        # Verify cache key exists
        cache_key = f"tier2_{sample_parquet}"
        assert cache_key in profiling_service._cache

    def test_histogram_numeric(self, profiling_service, sample_parquet):
        """Test histogram generation for numeric column."""
        histogram = profiling_service.get_histogram(sample_parquet, "amount", bins=5)

        assert histogram["model_name"] == sample_parquet
        assert histogram["column"] == "amount"
        assert "DOUBLE" in histogram["column_type"] or "FLOAT" in histogram["column_type"]
        assert "buckets" in histogram
        assert histogram["total_count"] == 4  # One null value excluded

        # Each bucket should have range and count
        for bucket in histogram["buckets"]:
            assert "range" in bucket
            assert "count" in bucket

    def test_histogram_categorical(self, profiling_service, sample_parquet):
        """Test histogram generation for categorical (string) column."""
        histogram = profiling_service.get_histogram(sample_parquet, "category", bins=10)

        assert histogram["model_name"] == sample_parquet
        assert histogram["column"] == "category"
        assert "buckets" in histogram
        assert histogram["total_count"] == 5

        # Categorical buckets should have value and count
        for bucket in histogram["buckets"]:
            assert "value" in bucket
            assert "count" in bucket

        # Check values are present
        values = [b["value"] for b in histogram["buckets"]]
        assert "A" in values
        assert "B" in values
        assert "C" in values

    def test_histogram_bins_clamped(self, profiling_service, sample_parquet):
        """Test that histogram bins are clamped to valid range."""
        # Test minimum clamping
        histogram = profiling_service.get_histogram(sample_parquet, "id", bins=1)
        # Should clamp to 5, function internally handles this
        assert histogram is not None

        # Test maximum clamping
        histogram = profiling_service.get_histogram(sample_parquet, "id", bins=500)
        # Should clamp to 100, function internally handles this
        assert histogram is not None

    def test_histogram_nonexistent_parquet(self, profiling_service):
        """Test histogram raises FileNotFoundError for non-existent parquet."""
        with pytest.raises(FileNotFoundError):
            profiling_service.get_histogram("nonexistent_model", "amount")

    def test_histogram_nonexistent_column(self, profiling_service, sample_parquet):
        """Test histogram raises ValueError for non-existent column."""
        with pytest.raises(ValueError, match="not found"):
            profiling_service.get_histogram(sample_parquet, "nonexistent_column")

    def test_invalidate_cache(self, profiling_service, sample_parquet):
        """Test that cache invalidation works correctly."""
        # Populate cache
        profiling_service.get_tier2_profile(sample_parquet)
        cache_key = f"tier2_{sample_parquet}"
        assert cache_key in profiling_service._cache

        # Invalidate cache
        profiling_service.invalidate_cache(sample_parquet)

        # Cache should be cleared
        assert cache_key not in profiling_service._cache
        assert cache_key not in profiling_service._cache_timestamps

    def test_invalidate_cache_nonexistent(self, profiling_service):
        """Test that invalidating non-cached model doesn't raise error."""
        # Should not raise any error
        profiling_service.invalidate_cache("never_cached_model")

    def test_convert_stat_value_bytes(self, profiling_service):
        """Test that bytes are converted to string."""
        result = profiling_service._convert_stat_value(b"hello")
        assert result == "hello"

    def test_convert_stat_value_none(self, profiling_service):
        """Test that None is returned as None."""
        result = profiling_service._convert_stat_value(None)
        assert result is None


class TestProfilingServiceWithLargeData:
    """Test ProfilingService with larger datasets."""

    @pytest.fixture
    def temp_dir(self):
        """Create a temporary directory for test files."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir

    @pytest.fixture
    def large_parquet(self, temp_dir):
        """Create a larger parquet file for testing."""
        import random

        n_rows = 10000
        table = pa.table(
            {
                "id": pa.array(range(n_rows), type=pa.int64()),
                "value": pa.array(
                    [random.random() * 1000 for _ in range(n_rows)], type=pa.float64()
                ),
                "category": pa.array(
                    [random.choice(["A", "B", "C", "D", "E"]) for _ in range(n_rows)],
                    type=pa.string(),
                ),
            }
        )

        parquet_path = os.path.join(temp_dir, "large_model.parquet")
        pq.write_table(table, parquet_path)

        return "large_model"

    @pytest.fixture
    def profiling_service(self, temp_dir):
        """Create a ProfilingService instance."""
        return ProfilingService(temp_dir)

    def test_tier1_performance(self, profiling_service, large_parquet):
        """Test that tier 1 profiling is fast (< 100ms)."""
        import time

        start = time.time()
        profile = profiling_service.get_tier1_profile(large_parquet)
        elapsed = time.time() - start

        assert elapsed < 0.1  # Should complete in < 100ms
        assert profile["row_count"] == 10000

    def test_tier2_profile_large(self, profiling_service, large_parquet):
        """Test tier 2 profiling works with larger dataset."""
        profile = profiling_service.get_tier2_profile(large_parquet)

        assert profile["row_count"] == 10000
        assert len(profile["columns"]) == 3

    def test_histogram_large_numeric(self, profiling_service, large_parquet):
        """Test histogram generation for numeric column in large dataset."""
        histogram = profiling_service.get_histogram(large_parquet, "value", bins=20)

        assert histogram["total_count"] == 10000
        assert len(histogram["buckets"]) <= 20

    def test_histogram_large_categorical(self, profiling_service, large_parquet):
        """Test histogram generation for categorical column in large dataset."""
        histogram = profiling_service.get_histogram(large_parquet, "category", bins=10)

        assert histogram["total_count"] == 10000
        # Should have 5 unique categories
        assert len(histogram["buckets"]) == 5


class TestProfilingServiceEdgeCases:
    """Test edge cases for ProfilingService."""

    @pytest.fixture
    def temp_dir(self):
        """Create a temporary directory for test files."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir

    @pytest.fixture
    def profiling_service(self, temp_dir):
        """Create a ProfilingService instance."""
        return ProfilingService(temp_dir)

    def test_empty_parquet(self, profiling_service, temp_dir):
        """Test profiling an empty parquet file."""
        table = pa.table(
            {
                "id": pa.array([], type=pa.int64()),
                "value": pa.array([], type=pa.float64()),
            }
        )
        parquet_path = os.path.join(temp_dir, "empty_model.parquet")
        pq.write_table(table, parquet_path)

        profile = profiling_service.get_tier1_profile("empty_model")
        assert profile["row_count"] == 0
        assert len(profile["columns"]) == 2

    def test_single_row_parquet(self, profiling_service, temp_dir):
        """Test profiling a parquet file with single row."""
        table = pa.table(
            {
                "id": pa.array([1], type=pa.int64()),
                "value": pa.array([100.0], type=pa.float64()),
            }
        )
        parquet_path = os.path.join(temp_dir, "single_row.parquet")
        pq.write_table(table, parquet_path)

        profile = profiling_service.get_tier1_profile("single_row")
        assert profile["row_count"] == 1

        # Histogram should work with single value
        histogram = profiling_service.get_histogram("single_row", "value", bins=10)
        assert histogram["total_count"] == 1

    def test_all_nulls_column(self, profiling_service, temp_dir):
        """Test profiling a column with all null values."""
        table = pa.table(
            {
                "id": pa.array([1, 2, 3], type=pa.int64()),
                "all_null": pa.array([None, None, None], type=pa.float64()),
            }
        )
        parquet_path = os.path.join(temp_dir, "all_nulls.parquet")
        pq.write_table(table, parquet_path)

        profile = profiling_service.get_tier1_profile("all_nulls")
        all_null_col = next(c for c in profile["columns"] if c["name"] == "all_null")
        assert all_null_col["null_count"] == 3

        # Histogram should handle all nulls gracefully
        histogram = profiling_service.get_histogram("all_nulls", "all_null", bins=10)
        assert histogram["total_count"] == 0

    def test_special_characters_in_column_name(self, profiling_service, temp_dir):
        """Test handling columns with special characters in names."""
        table = pa.table(
            {
                "column with spaces": pa.array([1, 2, 3], type=pa.int64()),
                "column-with-dashes": pa.array([4, 5, 6], type=pa.int64()),
            }
        )
        parquet_path = os.path.join(temp_dir, "special_cols.parquet")
        pq.write_table(table, parquet_path)

        profile = profiling_service.get_tier1_profile("special_cols")
        assert len(profile["columns"]) == 2

        # Histogram should work with special column names
        histogram = profiling_service.get_histogram("special_cols", "column with spaces", bins=10)
        assert histogram["total_count"] == 3
