"""Tests for the profiling service."""

import os
import sqlite3
import pytest
import tempfile
import time
from datetime import datetime, timedelta

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq

from tests.factories.model_factories import DuckdbSourceFactory, SourceFactory
from visivo.output_paths import model_data_file, run_dir


def _write_model(output_dir, name, table):
    """Write ``table`` where ``run_model_data_job`` would put model ``name``."""
    path = model_data_file(run_dir(output_dir), name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    pq.write_table(table, path)
    return path


from visivo.server.services.profiling_service import (
    MAX_PROFILE_COLUMNS,
    TOP_N_MAX_DISTINCT,
    ProfilingService,
    profiling_service_for,
)


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

        parquet_path = model_data_file(run_dir(temp_dir), "test_model")
        os.makedirs(os.path.dirname(parquet_path))
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
        profile = profiling_service.profile_model(sample_parquet)

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
        assert amount_col["std_dev"] is not None
        assert amount_col["median"] is not None

    def test_tier2_profile_nonexistent(self, profiling_service):
        """Test tier 2 profiling raises FileNotFoundError for non-existent file."""
        with pytest.raises(FileNotFoundError):
            profiling_service.profile_model("nonexistent_model")

    def test_tier2_caching(self, profiling_service, sample_parquet):
        """Test that tier 2 profiling caches results."""
        # First call should populate cache
        profile1 = profiling_service.profile_model(sample_parquet)

        # Second call should return cached result
        profile2 = profiling_service.profile_model(sample_parquet)

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
        profiling_service.profile_model(sample_parquet)
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

        parquet_path = _write_model(temp_dir, "large_model", table)

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
        profile = profiling_service.profile_model(large_parquet)

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
        parquet_path = _write_model(temp_dir, "empty_model", table)

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
        parquet_path = _write_model(temp_dir, "single_row", table)

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
        parquet_path = _write_model(temp_dir, "all_nulls", table)

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
        parquet_path = _write_model(temp_dir, "special_cols", table)

        profile = profiling_service.get_tier1_profile("special_cols")
        assert len(profile["columns"]) == 2

        # Histogram should work with special column names
        histogram = profiling_service.get_histogram("special_cols", "column with spaces", bins=10)
        assert histogram["total_count"] == 3


class TestItReadsWhatTheRunWrote:
    """VIS-1409: the service read `{output}/{model}.parquet` after runs had
    moved to `{output}/{run_id}/models/{model}.parquet`, so the endpoint
    always 404'd. The path comes from output_paths now, like the writer's."""

    def test_the_path_is_the_run_layout(self, tmp_path):
        service = ProfilingService(str(tmp_path))

        assert service.get_parquet_path("m") == f"{tmp_path}/main/models/m.parquet"

    def test_a_specific_run_can_be_profiled(self, tmp_path):
        service = ProfilingService(str(tmp_path), run_id="abc123")

        assert service.get_parquet_path("m") == f"{tmp_path}/abc123/models/m.parquet"

    def test_the_old_flat_path_is_not_consulted(self, tmp_path):
        table = pa.table({"x": pa.array([1, 2, 3])})
        pq.write_table(table, str(tmp_path / "m.parquet"))

        assert ProfilingService(str(tmp_path)).parquet_exists("m") is False

    def test_null_count_is_a_count_not_a_percentage(self, tmp_path):
        table = pa.table({"amount": pa.array([1.0, None, None, 4.0], type=pa.float64())})
        path = model_data_file(run_dir(str(tmp_path)), "m")
        os.makedirs(os.path.dirname(path))
        pq.write_table(table, path)

        column = ProfilingService(str(tmp_path)).profile_model("m")["columns"][0]

        assert column["null_count"] == 2
        assert column["null_percentage"] == 50.0


class TestStatisticsAcrossRowGroups:
    """Tier 1 merges min/max over every row group; a single-group fixture
    never exercised the merge."""

    def test_min_and_max_span_all_row_groups(self, tmp_path):
        table = pa.table(
            {
                "n": pa.array([5, 6, 7, 1, 2, 3, 9, 8, 4], type=pa.int64()),
                "s": pa.array(list("mnoabcxyz"), type=pa.string()),
            }
        )
        path = model_data_file(run_dir(str(tmp_path)), "groups")
        os.makedirs(os.path.dirname(path))
        pq.write_table(table, path, row_group_size=3)

        columns = {
            c["name"]: c
            for c in ProfilingService(str(tmp_path)).get_tier1_profile("groups")["columns"]
        }

        assert (columns["n"]["min"], columns["n"]["max"]) == (1, 9)
        assert (columns["s"]["min"], columns["s"]["max"]) == ("a", "z")


class TestValueConversion:
    def test_parquet_statistics_become_json_values(self, tmp_path):
        import datetime

        import numpy as np

        service = ProfilingService(str(tmp_path))

        assert service._convert_stat_value(None) is None
        assert service._convert_stat_value(b"abc") == "abc"
        assert service._convert_stat_value(b"\xff\xfe") is None
        assert service._convert_stat_value(datetime.date(2024, 1, 2)) == "2024-01-02"
        assert service._convert_stat_value(np.int64(3)) == 3
        assert service._convert_stat_value("plain") == "plain"

    def test_typed_bounds(self, tmp_path):
        service = ProfilingService(str(tmp_path))

        assert service._typed_bound("", True) is None
        assert service._typed_bound("12", True) == 12
        assert service._typed_bound("1.5e3", True) == 1500.0
        assert service._typed_bound("not a number", True) == "not a number"
        assert service._typed_bound("abc", False) == "abc"
        assert service._number("NULL") is None and service._number("x") is None


class TestTheUnifiedShape:
    """VIS-1412: one column shape for the viewer and the agent, numbers as
    numbers, plus the extras the shape-card classifier reads."""

    def _profile(self, tmp_path):
        import datetime

        table = pa.table(
            {
                "id": pa.array(range(1, 61), type=pa.int64()),
                "amount": pa.array([float(i % 7) for i in range(60)], type=pa.float64()),
                "category": pa.array([["A", "B", "C"][i % 3] for i in range(60)], type=pa.string()),
                "day": pa.array([datetime.date(2024, 1, 1 + i % 10) for i in range(60)]),
            }
        )
        _write_model(str(tmp_path), "shape", table)
        return ProfilingService(str(tmp_path)).profile_model("shape")

    def test_field_names_match_the_viewer(self, tmp_path):
        amount = next(c for c in self._profile(tmp_path)["columns"] if c["name"] == "amount")

        assert set(amount) >= {
            "name",
            "type",
            "null_count",
            "null_percentage",
            "distinct",
            "min",
            "max",
            "avg",
            "median",
            "std_dev",
            "q25",
            "q75",
            "p99",
            "zeros_pct",
            "avg_length",
            "top_values",
        }
        assert isinstance(amount["avg"], float) and isinstance(amount["std_dev"], float)
        assert amount["distinct"] == 7 and amount["null_count"] == 0
        assert amount["zeros_pct"] == pytest.approx(9 / 60)
        assert amount["p99"] is not None

    def test_text_columns_get_length_and_top_values_and_no_numeric_stats(self, tmp_path):
        category = next(c for c in self._profile(tmp_path)["columns"] if c["name"] == "category")

        assert category["avg_length"] == 1.0 and category["avg"] is None
        assert [t["value"] for t in category["top_values"]] == ["A", "B", "C"]
        assert category["top_values"][0]["count"] == 20

    def test_bounds_are_typed(self, tmp_path):
        columns = {c["name"]: c for c in self._profile(tmp_path)["columns"]}

        assert columns["id"]["min"] == 1 and columns["id"]["max"] == 60
        assert columns["amount"]["max"] == 6.0
        assert columns["category"]["min"] == "A"
        assert columns["day"]["min"] == "2024-01-01"

    def test_a_column_subset(self, tmp_path):
        self._profile(tmp_path)
        profile = ProfilingService(str(tmp_path)).profile_model("shape", columns=["amount"])

        assert [c["name"] for c in profile["columns"]] == ["amount"]

    def test_a_subset_naming_no_column_still_counts_rows(self, tmp_path):
        self._profile(tmp_path)
        profile = ProfilingService(str(tmp_path)).profile_model("shape", columns=["nope"])

        assert profile["columns"] == [] and profile["row_count"] == 60

    def test_wide_tables_are_capped_and_flagged(self, tmp_path):
        from visivo.server.services.profiling_service import MAX_PROFILE_COLUMNS

        wide = pa.table({f"c{i}": pa.array([1, 2, 3]) for i in range(MAX_PROFILE_COLUMNS + 5)})
        _write_model(str(tmp_path), "wide", wide)

        profile = ProfilingService(str(tmp_path)).profile_model("wide")

        assert (
            len(profile["columns"]) == MAX_PROFILE_COLUMNS and profile["columns_truncated"] is True
        )

    def test_shape_cards_come_from_the_same_profile(self, tmp_path):
        service = ProfilingService(str(tmp_path))
        cards = {c["column"]: c for c in service.shape_cards(self._profile(tmp_path))}

        assert cards["id"]["role"] == "identifier"
        assert cards["amount"]["role"] == "numeric_discrete"
        assert (
            cards["category"]["role"] == "categorical"
            and isinstance(cards["category"]["cardinality"], int)
            and "cardinality_bucket" not in cards["category"]
        )
        assert cards["day"]["role"] == "time" and cards["day"]["time_grain"] == "day"

    def test_the_cache_is_bypassed_for_custom_requests(self, tmp_path):
        service = ProfilingService(str(tmp_path))
        first = self._profile(tmp_path)
        service._cache["tier2_shape"] = first
        service._cache_timestamps["tier2_shape"] = time.time()

        assert service.profile_model("shape") is first
        assert (
            service.profile_model("shape", top_n=1)["columns"][2]["top_values"][:1]
            != first["columns"][2]["top_values"]
        )


class TestProfileQuery:
    """Any SQL on any source: a bounded sample into DuckDB, an exact count
    beside it, the same shape out."""

    def _source(self, integration_app):
        return integration_app.project.sources[0]

    def test_a_query_profiles_like_a_model(self, integration_app, tmp_path):
        profile = ProfilingService(str(tmp_path)).profile_query(
            self._source(integration_app), "SELECT x, y FROM test_table"
        )

        assert profile["row_count"] == 6 and profile["sampled"] is False
        x = next(c for c in profile["columns"] if c["name"] == "x")
        assert x["distinct"] == 6 and x["min"] == 1 and x["max"] == 6 and x["avg"] == 3.5

    def test_a_small_sample_is_flagged_and_the_count_is_still_exact(
        self, integration_app, tmp_path
    ):
        profile = ProfilingService(str(tmp_path)).profile_query(
            self._source(integration_app), "SELECT x FROM test_table", sample_rows=2
        )

        assert (
            profile["row_count"] == 6 and profile["sampled"] is True and profile["sample_rows"] == 2
        )

    def test_the_sample_is_bounded_in_the_sources_dialect(
        self, integration_app, tmp_path, monkeypatch
    ):
        from visivo.server.services import profiling_service as module

        seen = []

        def fake(source, sql, **kwargs):
            seen.append((sql, kwargs))
            return {
                "columns": ["x"],
                "rows": [{"x": 1}],
                "row_count": 1,
                "truncated": False,
                "execution_time_ms": 1,
            }

        monkeypatch.setattr(module, "execute_and_get_result", fake)
        profile = ProfilingService(str(tmp_path)).profile_query(
            self._source(integration_app), "SELECT x FROM test_table", sample_rows=5, timeout_s=3
        )

        sample_sql, kwargs = seen[0]
        assert "LIMIT 5" in sample_sql and kwargs == {"timeout_s": 3}
        assert len(seen) == 1 and profile["row_count"] == 1

    def test_a_full_sample_is_followed_by_a_count(self, integration_app, tmp_path, monkeypatch):
        from visivo.server.services import profiling_service as module

        seen = []

        def fake(source, sql, **kwargs):
            seen.append(sql)
            if "COUNT(*)" in sql:
                return {"columns": ["n"], "rows": [{"n": 9}]}
            return {"columns": ["x"], "rows": [{"x": 1}, {"x": 2}]}

        monkeypatch.setattr(module, "execute_and_get_result", fake)
        profile = ProfilingService(str(tmp_path)).profile_query(
            self._source(integration_app), "SELECT x FROM test_table", sample_rows=2
        )

        assert len(seen) == 2 and "COUNT(*)" in seen[1]
        assert profile["row_count"] == 9 and profile["sampled"] is True
        assert profile["sample_rows"] == 2

    def test_a_failed_count_falls_back_to_the_sample_size(
        self, integration_app, tmp_path, monkeypatch
    ):
        from visivo.server.services import profiling_service as module

        def flaky(source, sql, **kwargs):
            if "COUNT(*)" in sql:
                raise RuntimeError("count timed out")
            return {"columns": ["x"], "rows": [{"x": 1}, {"x": 2}]}

        monkeypatch.setattr(module, "execute_and_get_result", flaky)
        profile = ProfilingService(str(tmp_path)).profile_query(
            self._source(integration_app), "SELECT x FROM test_table", sample_rows=2
        )

        assert profile["row_count"] == 2 and profile["sampled"] is False

    def test_an_empty_result_profiles_to_zero_rows(self, integration_app, tmp_path):
        profile = ProfilingService(str(tmp_path)).profile_query(
            self._source(integration_app), "SELECT x FROM test_table WHERE x > 100"
        )

        assert profile["row_count"] == 0
        assert profile["columns"] == []
        assert profile["sampled"] is False


TRIPS = 20_000
START = datetime(2024, 1, 1)


def _trip_rows():
    for i in range(TRIPS):
        yield (
            str(START + timedelta(minutes=i)),
            "Queens" if i % 10 == 0 else "Manhattan",
            None if i % 5 == 0 else i,
        )


@pytest.fixture(params=["duckdb", "sqlite"])
def trips_source(request, tmp_path):
    """A time-ordered, skewed table: 90% Manhattan, 20% of tips missing."""
    if request.param == "duckdb":
        path = str(tmp_path / "trips.duckdb")
        conn = duckdb.connect(path)
        rows = pa.table(dict(zip(["picked_up_at", "borough", "tip"], zip(*_trip_rows()))))
        conn.execute(
            "CREATE TABLE trips AS"
            " SELECT * REPLACE (picked_up_at::TIMESTAMP AS picked_up_at) FROM rows"
        )
        conn.close()
        return DuckdbSourceFactory(database=path)
    path = str(tmp_path / "trips.sqlite")
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE trips (picked_up_at TEXT, borough TEXT, tip INTEGER)")
    conn.executemany("INSERT INTO trips VALUES (?, ?, ?)", _trip_rows())
    conn.commit()
    conn.close()
    return SourceFactory(database=path)


class TestSampledProfiles:
    SQL = "SELECT * FROM trips"

    def _cards(self, service, profile):
        return {c["column"]: c for c in service.shape_cards(profile)}

    def test_a_sample_reports_the_same_shares_as_the_whole_table(self, trips_source, tmp_path):
        service = ProfilingService(str(tmp_path))
        full = service.profile_query(trips_source, self.SQL)
        sampled = service.profile_query(trips_source, self.SQL, sample_rows=1000)

        assert full["sampled"] is False
        assert sampled["sampled"] is True and sampled["row_count"] == TRIPS
        full_cards, sample_cards = self._cards(service, full), self._cards(service, sampled)
        assert full_cards["borough"]["top_n"][0] == {"value": "Manhattan", "share": 0.9}
        assert sample_cards["borough"]["top_n"][0]["share"] == pytest.approx(0.9, abs=0.05)
        assert full_cards["tip"]["null_pct"] == 0.2
        assert sample_cards["tip"]["null_pct"] == pytest.approx(0.2, abs=0.05)

    def test_a_sample_spans_a_time_ordered_table(self, trips_source, tmp_path):
        profile = ProfilingService(str(tmp_path)).profile_query(
            trips_source, self.SQL, sample_rows=1000
        )

        picked_up = next(c for c in profile["columns"] if c["name"] == "picked_up_at")
        assert picked_up["min"] < str(START + timedelta(minutes=TRIPS // 20))
        assert picked_up["max"] > str(START + timedelta(minutes=TRIPS * 19 // 20))


class TestColumnSubset:
    def test_none_means_every_column(self):
        assert ProfilingService.column_subset(None) is None

    def test_duplicates_are_dropped_in_order(self):
        assert ProfilingService.column_subset(["b", "a", "b"]) == ["b", "a"]

    def test_bad_shapes_are_value_errors(self):
        for bad in ("x", ["a", 1], [""], ["  "], [None]):
            with pytest.raises(ValueError, match="list of column names"):
                ProfilingService.column_subset(bad)

    def test_the_cap_applies_after_deduplication(self):
        names = [f"c{i}" for i in range(MAX_PROFILE_COLUMNS)]

        assert len(ProfilingService.column_subset(names + names)) == MAX_PROFILE_COLUMNS
        with pytest.raises(ValueError, match=f"at most {MAX_PROFILE_COLUMNS}"):
            ProfilingService.column_subset(names + ["one_more"])

    def test_profiling_validates_its_columns_argument(self, tmp_path):
        service = ProfilingService(str(tmp_path))

        with pytest.raises(ValueError, match="columns"):
            service.profile_model("m", columns="amount")
        with pytest.raises(ValueError, match="columns"):
            service.profile_query(None, "select 1", columns=[1])


class TestSharedService:
    def test_one_instance_per_output_dir(self, tmp_path):
        a = profiling_service_for(str(tmp_path))

        assert a is profiling_service_for(str(tmp_path))
        assert isinstance(a, ProfilingService) and a.output_dir == str(tmp_path)
        assert a is not profiling_service_for(str(tmp_path / "other"))


class RecordingConnection:
    def __init__(self, conn):
        self._conn = conn
        self.statements = []

    def execute(self, sql, *args):
        self.statements.append(sql)
        return self._conn.execute(sql, *args)

    def __getattr__(self, name):
        return getattr(self._conn, name)


@pytest.fixture
def recorded_connections(monkeypatch):
    import types

    import duckdb

    from visivo.server.services import profiling_service as module

    connections = []

    def connect(*args, **kwargs):
        connections.append(RecordingConnection(duckdb.connect(*args, **kwargs)))
        return connections[-1]

    monkeypatch.setattr(
        module,
        "duckdb",
        types.SimpleNamespace(connect=connect, DuckDBPyConnection=duckdb.DuckDBPyConnection),
    )
    return connections


class TestScanCount:
    """A profile is three scans over a relation materialised once, not a
    query per column."""

    def test_a_model_profile_is_a_load_and_three_scans(self, tmp_path, recorded_connections):
        table = pa.table(
            {
                "n": pa.array([1, 2, 2, None], type=pa.int64()),
                "s": pa.array(["a", "b", "a", "c"], type=pa.string()),
                "d": pa.array([1.5, 0.0, 0.0, None], type=pa.float64()),
            }
        )
        _write_model(str(tmp_path), "scans", table)

        profile = ProfilingService(str(tmp_path)).profile_model("scans")

        statements = recorded_connections[0].statements
        assert len(statements) == 4
        assert statements[0].startswith("CREATE TEMP TABLE visivo_model")
        assert statements[1].startswith("SUMMARIZE")
        assert statements[2].count("COUNT(DISTINCT") == 3 and "quantile_cont" in statements[2]
        assert statements[3].count("histogram(") == 3
        assert "read_parquet" not in " ".join(statements[1:])
        columns = {c["name"]: c for c in profile["columns"]}
        assert profile["row_count"] == 4
        assert (columns["n"]["distinct"], columns["n"]["null_count"]) == (2, 1)
        assert columns["n"]["null_percentage"] == 25.0
        assert columns["d"]["zeros_pct"] == pytest.approx(2 / 3)
        assert columns["s"]["avg_length"] == 1.0 and columns["s"]["p99"] is None
        assert columns["n"]["avg_length"] is None

    def test_no_top_value_scan_when_nothing_qualifies(self, tmp_path, recorded_connections):
        _write_model(str(tmp_path), "nothing", pa.table({"n": pa.array([None, None])}))

        profile = ProfilingService(str(tmp_path)).profile_model("nothing")

        assert len(recorded_connections[0].statements) == 3
        assert profile["columns"][0]["distinct"] == 0 and profile["columns"][0]["top_values"] == []

    def test_an_exact_count_survives_rounding_of_the_summary(self, tmp_path):
        n = 20_003
        table = pa.table({"i": pa.array([None] + list(range(n - 1)), type=pa.int64())})
        _write_model(str(tmp_path), "rounding", table)

        column = ProfilingService(str(tmp_path)).profile_model("rounding")["columns"][0]

        assert column["null_count"] == 1 and column["distinct"] == n - 1


class TestTopValues:
    def _profile(self, tmp_path, name, table, **kwargs):
        _write_model(str(tmp_path), name, table)
        profile = ProfilingService(str(tmp_path)).profile_model(name, **kwargs)
        return {c["name"]: c for c in profile["columns"]}

    def test_most_frequent_first_then_by_value(self, tmp_path):
        columns = self._profile(
            tmp_path,
            "ties",
            pa.table(
                {"s": pa.array(["b", "a", "b", "c", "a", None]), "n": pa.array([3, 1, 3, 2, 2, 1])}
            ),
        )

        assert columns["s"]["top_values"] == [
            {"value": "a", "count": 2},
            {"value": "b", "count": 2},
            {"value": "c", "count": 1},
        ]
        assert [t["value"] for t in columns["n"]["top_values"]] == [1, 2, 3]

    def test_top_n_bounds_the_list(self, tmp_path):
        table = pa.table({"s": pa.array(list("abcde"))})

        assert len(self._profile(tmp_path, "bounded", table, top_n=2)["s"]["top_values"]) == 2
        assert self._profile(tmp_path, "bounded", table, top_n=0)["s"]["top_values"] == []

    def test_high_cardinality_columns_get_none(self, tmp_path):
        table = pa.table(
            {
                "wide": pa.array(range(TOP_N_MAX_DISTINCT + 1)),
                "narrow": pa.array([i % 2 for i in range(TOP_N_MAX_DISTINCT + 1)]),
            }
        )
        columns = self._profile(tmp_path, "cardinality", table)

        assert columns["wide"]["top_values"] == []
        assert [t["count"] for t in columns["narrow"]["top_values"]] == [501, 500]

    def test_values_are_json_and_nested_values_still_rank(self, tmp_path):
        import datetime

        table = pa.table(
            {
                "day": pa.array([datetime.date(2024, 1, 2), datetime.date(2024, 1, 2)]),
                "tags": pa.array([["x", "y"], ["z"]]),
                "rec": pa.array([{"a": 2}, {"a": 1}]),
            }
        )
        columns = self._profile(tmp_path, "nested", table)

        assert columns["day"]["top_values"] == [{"value": "2024-01-02", "count": 2}]
        assert [t["value"] for t in columns["tags"]["top_values"]] == [["x", "y"], ["z"]]
        assert [t["value"] for t in columns["rec"]["top_values"]] == [{"a": 1}, {"a": 2}]

    def test_quoted_column_names(self, tmp_path):
        columns = self._profile(
            tmp_path, "quoted", pa.table({'we "ird" name': pa.array([1, 1, 2])})
        )

        assert columns['we "ird" name']["top_values"][0] == {"value": 1, "count": 2}
