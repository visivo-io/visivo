"""Tests for profiling API endpoints."""

import os
import pytest
import tempfile
import pyarrow as pa
import pyarrow.parquet as pq
from flask import Flask

from visivo.server.views.profiling_views import register_profiling_views


class TestProfilingViews:
    """Test suite for profiling API endpoints."""

    @pytest.fixture
    def temp_dir(self):
        """Create a temporary directory for test files."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir

    @pytest.fixture
    def parquet_model(self, temp_dir):
        """Create a test parquet file in output_dir."""
        table = pa.table(
            {
                "id": pa.array([1, 2, 3, 4, 5], type=pa.int64()),
                "amount": pa.array([10.5, 20.0, 30.5, None, 50.0], type=pa.float64()),
                "category": pa.array(["A", "B", "A", "C", "B"], type=pa.string()),
            }
        )

        parquet_path = os.path.join(temp_dir, "test_model.parquet")
        pq.write_table(table, parquet_path)

        return "test_model"

    @pytest.fixture
    def app(self, temp_dir):
        """Create a test Flask app with profiling views."""
        app = Flask(__name__)
        app.config["TESTING"] = True

        # flask_app is not used by profiling views but required for signature
        flask_app = None

        register_profiling_views(app, flask_app, temp_dir)

        return app

    @pytest.fixture
    def client(self, app):
        """Create a test client."""
        return app.test_client()

    # Profile endpoint tests

    def test_get_profile_tier1(self, client, parquet_model):
        """Test GET returns tier 1 profile."""
        response = client.get(f"/api/models/{parquet_model}/profile/?tier=1")

        assert response.status_code == 200
        data = response.get_json()
        assert data["model_name"] == parquet_model
        assert data["tier"] == 1
        assert data["row_count"] == 5
        assert "columns" in data
        assert len(data["columns"]) == 3
        assert "profiled_at" in data

    def test_get_profile_tier2(self, client, parquet_model):
        """Test GET returns tier 2 profile (default)."""
        response = client.get(f"/api/models/{parquet_model}/profile/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["model_name"] == parquet_model
        assert data["tier"] == 2
        assert data["row_count"] == 5
        assert "columns" in data

        # Tier 2 should have additional stats
        amount_col = next(c for c in data["columns"] if c["name"] == "amount")
        assert "avg" in amount_col
        assert "std" in amount_col

    def test_get_profile_tier2_explicit(self, client, parquet_model):
        """Test GET with explicit tier=2 returns tier 2 profile."""
        response = client.get(f"/api/models/{parquet_model}/profile/?tier=2")

        assert response.status_code == 200
        data = response.get_json()
        assert data["tier"] == 2

    def test_get_profile_invalid_tier(self, client, parquet_model):
        """Test GET with invalid tier defaults to tier 2."""
        response = client.get(f"/api/models/{parquet_model}/profile/?tier=invalid")

        assert response.status_code == 200
        data = response.get_json()
        assert data["tier"] == 2

    def test_get_profile_tier_out_of_range(self, client, parquet_model):
        """Test GET with out-of-range tier defaults to tier 2."""
        response = client.get(f"/api/models/{parquet_model}/profile/?tier=5")

        assert response.status_code == 200
        data = response.get_json()
        assert data["tier"] == 2

    def test_get_profile_missing_model(self, client):
        """Test GET returns 404 for missing model."""
        response = client.get("/api/models/nonexistent_model/profile/")

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data

    # Histogram endpoint tests

    def test_get_histogram(self, client, parquet_model):
        """Test GET returns histogram data."""
        response = client.get(f"/api/models/{parquet_model}/histogram/amount/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["model_name"] == parquet_model
        assert data["column"] == "amount"
        assert "buckets" in data
        assert "total_count" in data

    def test_get_histogram_custom_bins(self, client, parquet_model):
        """Test GET histogram respects bins parameter."""
        response = client.get(f"/api/models/{parquet_model}/histogram/id/?bins=5")

        assert response.status_code == 200
        data = response.get_json()
        assert "buckets" in data
        # With 5 unique values and 5 bins, we should have at most 5 buckets
        assert len(data["buckets"]) <= 5

    def test_get_histogram_bins_clamped_min(self, client, parquet_model):
        """Test GET histogram clamps bins to minimum of 5."""
        response = client.get(f"/api/models/{parquet_model}/histogram/id/?bins=1")

        assert response.status_code == 200
        data = response.get_json()
        assert "buckets" in data

    def test_get_histogram_bins_clamped_max(self, client, parquet_model):
        """Test GET histogram clamps bins to maximum of 100."""
        response = client.get(f"/api/models/{parquet_model}/histogram/id/?bins=500")

        assert response.status_code == 200
        data = response.get_json()
        assert "buckets" in data

    def test_get_histogram_invalid_bins(self, client, parquet_model):
        """Test GET histogram with invalid bins defaults to 20."""
        response = client.get(f"/api/models/{parquet_model}/histogram/id/?bins=invalid")

        assert response.status_code == 200
        data = response.get_json()
        assert "buckets" in data

    def test_get_histogram_categorical(self, client, parquet_model):
        """Test GET histogram for categorical column."""
        response = client.get(f"/api/models/{parquet_model}/histogram/category/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["column"] == "category"
        assert "buckets" in data

        # Categorical buckets should have value and count
        for bucket in data["buckets"]:
            assert "value" in bucket
            assert "count" in bucket

    def test_get_histogram_missing_model(self, client):
        """Test GET histogram returns 404 for missing model."""
        response = client.get("/api/models/nonexistent_model/histogram/amount/")

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data

    def test_get_histogram_missing_column(self, client, parquet_model):
        """Test GET histogram returns 404 for missing column."""
        response = client.get(f"/api/models/{parquet_model}/histogram/nonexistent_column/")

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data

    # Cache invalidation endpoint tests

    def test_invalidate_cache(self, client, parquet_model):
        """Test POST invalidates cache."""
        # First, populate the cache by getting a tier 2 profile
        client.get(f"/api/models/{parquet_model}/profile/?tier=2")

        # Then invalidate
        response = client.post(f"/api/models/{parquet_model}/profile/invalidate/")

        assert response.status_code == 200
        data = response.get_json()
        assert "message" in data
        assert parquet_model in data["message"]

    def test_invalidate_cache_nonexistent_model(self, client):
        """Test POST invalidate for non-cached model succeeds."""
        response = client.post("/api/models/nonexistent_model/profile/invalidate/")

        assert response.status_code == 200
        data = response.get_json()
        assert "message" in data


class TestProfilingViewsWithSpecialCases:
    """Test profiling views with special cases."""

    @pytest.fixture
    def temp_dir(self):
        """Create a temporary directory for test files."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir

    @pytest.fixture
    def app(self, temp_dir):
        """Create a test Flask app with profiling views."""
        app = Flask(__name__)
        app.config["TESTING"] = True

        register_profiling_views(app, None, temp_dir)

        return app

    @pytest.fixture
    def client(self, app):
        """Create a test client."""
        return app.test_client()

    def test_profile_empty_parquet(self, client, temp_dir):
        """Test profiling an empty parquet file."""
        table = pa.table(
            {
                "id": pa.array([], type=pa.int64()),
            }
        )
        pq.write_table(table, os.path.join(temp_dir, "empty.parquet"))

        response = client.get("/api/models/empty/profile/?tier=1")

        assert response.status_code == 200
        data = response.get_json()
        assert data["row_count"] == 0

    def test_histogram_column_with_spaces(self, client, temp_dir):
        """Test histogram for column with spaces in name."""
        table = pa.table(
            {
                "column name": pa.array([1, 2, 3], type=pa.int64()),
            }
        )
        pq.write_table(table, os.path.join(temp_dir, "spaces.parquet"))

        response = client.get("/api/models/spaces/histogram/column name/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["column"] == "column name"

    def test_model_name_with_special_characters(self, client, temp_dir):
        """Test model names work correctly (parquet file names)."""
        table = pa.table(
            {
                "id": pa.array([1, 2, 3], type=pa.int64()),
            }
        )
        pq.write_table(table, os.path.join(temp_dir, "my_model_v2.parquet"))

        response = client.get("/api/models/my_model_v2/profile/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["model_name"] == "my_model_v2"
