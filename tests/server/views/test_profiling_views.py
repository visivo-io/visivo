"""Tests for profiling API endpoints."""

import os
import pytest
import tempfile
import pyarrow as pa
import pyarrow.parquet as pq

from visivo.output_paths import model_data_file, run_dir


def _write_model(output_dir, name, table):
    """Write ``table`` where ``run_model_data_job`` would put model ``name``."""
    path = model_data_file(run_dir(output_dir), name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    pq.write_table(table, path)
    return path


from flask import Flask

from visivo.server.views.profiling_views import register_profiling_views
from tests.server.conftest import integration_app, integration_client, output_dir  # noqa: F401


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

        parquet_path = model_data_file(run_dir(temp_dir), "test_model")
        os.makedirs(os.path.dirname(parquet_path))
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
        assert amount_col["avg"] == 27.75
        assert amount_col["std_dev"] is not None

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
        _write_model(temp_dir, "empty", table)

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
        _write_model(temp_dir, "spaces", table)

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
        _write_model(temp_dir, "my_model_v2", table)

        response = client.get("/api/models/my_model_v2/profile/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["model_name"] == "my_model_v2"


class TestProfilesEndpoint:
    """POST /api/profiles/ (VIS-1413): the one profile the Explorer and the
    agent share, through the real managers so a draft source resolves."""

    def _source_name(self, integration_app):
        return integration_app.project.sources[0].name

    def test_a_query_profile_carries_shape_cards(self, integration_client, integration_app):
        resp = integration_client.post(
            "/api/profiles/",
            json={
                "source_name": self._source_name(integration_app),
                "sql": "SELECT x, y FROM test_table",
            },
        )

        assert resp.status_code == 200
        body = resp.get_json()
        assert body["profile"]["row_count"] == 6
        assert {c["column"]: c["role"] for c in body["shape_cards"]} == {
            "x": "numeric_discrete",
            "y": "numeric_discrete",
        }

    def test_a_model_profile(self, integration_client, integration_app):
        table = pa.table({"amount": pa.array([1.0, 2.0, None]), "kind": pa.array(["a", "b", "a"])})
        _write_model(integration_app.output_dir, "built", table)

        body = integration_client.post("/api/profiles/", json={"model_name": "built"}).get_json()

        assert body["profile"]["model_name"] == "built" and body["profile"]["row_count"] == 3
        assert [c["role"] for c in body["shape_cards"]] == ["numeric_discrete", "categorical"]

    def test_a_column_subset_and_sample_size_are_honoured(
        self, integration_client, integration_app
    ):
        body = integration_client.post(
            "/api/profiles/",
            json={
                "source_name": self._source_name(integration_app),
                "sql": "SELECT x, y FROM test_table",
                "columns": ["y"],
                "sample_rows": 2,
            },
        ).get_json()

        assert [c["name"] for c in body["profile"]["columns"]] == ["y"]
        assert body["profile"]["sampled"] is True and body["profile"]["row_count"] == 6

    def test_missing_arguments_are_a_400(self, integration_client):
        assert integration_client.post("/api/profiles/", json={}).status_code == 400
        assert (
            integration_client.post("/api/profiles/", json={"sql": "select 1"}).status_code == 400
        )

    def test_a_bad_column_list_is_a_400(self, integration_client, integration_app):
        resp = integration_client.post(
            "/api/profiles/",
            json={
                "source_name": self._source_name(integration_app),
                "sql": "select 1",
                "columns": "x",
            },
        )

        assert resp.status_code == 400 and "columns" in resp.get_json()["error"]

    def test_an_unknown_source_is_a_404(self, integration_client):
        resp = integration_client.post(
            "/api/profiles/", json={"source_name": "nope", "sql": "select 1"}
        )

        assert resp.status_code == 404

    def test_an_unbuilt_model_is_a_404(self, integration_client):
        resp = integration_client.post("/api/profiles/", json={"model_name": "never_built"})

        assert resp.status_code == 404

    def test_a_timeout_is_a_504_with_its_type(
        self, integration_client, integration_app, monkeypatch
    ):
        from visivo.jobs.run_model_data_job import QueryTimeout
        from visivo.server.services.profiling_service import ProfilingService

        def slow(self, *args, **kwargs):
            raise QueryTimeout("Query did not return within 30s.")

        monkeypatch.setattr(ProfilingService, "profile_query", slow)
        resp = integration_client.post(
            "/api/profiles/",
            json={"source_name": self._source_name(integration_app), "sql": "select 1"},
        )

        assert resp.status_code == 504 and resp.get_json()["error_type"] == "timeout"

    def test_a_broken_query_is_a_500_with_the_driver_message(
        self, integration_client, integration_app
    ):
        resp = integration_client.post(
            "/api/profiles/",
            json={
                "source_name": self._source_name(integration_app),
                "sql": "SELECT nope FROM test_table",
            },
        )

        assert resp.status_code == 500 and "nope" in resp.get_json()["error"]


class TestProfilesEndpointEdges:
    def test_too_many_columns_is_a_400(self, integration_client, integration_app):
        resp = integration_client.post(
            "/api/profiles/",
            json={
                "source_name": integration_app.project.sources[0].name,
                "sql": "select 1",
                "columns": [f"c{i}" for i in range(41)],
            },
        )

        assert resp.status_code == 400 and "at most 40" in resp.get_json()["error"]


class TestHistogramEdges:
    @pytest.fixture
    def temp_dir(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir

    @pytest.fixture
    def parquet_model(self, temp_dir):
        table = pa.table({"amount": pa.array([1.0, 2.0, 3.0]), "kind": pa.array(["a", "b", "a"])})
        _write_model(temp_dir, "edge_model", table)
        return "edge_model"

    @pytest.fixture
    def client(self, temp_dir):
        app = Flask(__name__)
        app.config["TESTING"] = True
        register_profiling_views(app, None, temp_dir)
        return app.test_client()

    def test_an_unknown_column_is_a_404(self, client, parquet_model):
        resp = client.get(f"/api/models/{parquet_model}/histogram/nope/")

        assert resp.status_code == 404 and "nope" in resp.get_json()["error"]

    def test_an_unexpected_failure_is_a_500(self, client, parquet_model, monkeypatch):
        from visivo.server.services.profiling_service import ProfilingService

        def boom(self, *args, **kwargs):
            raise RuntimeError("duckdb fell over")

        monkeypatch.setattr(ProfilingService, "get_histogram", boom)
        monkeypatch.setattr(ProfilingService, "get_tier2_profile", boom)
        monkeypatch.setattr(ProfilingService, "invalidate_cache", boom)

        assert client.get(f"/api/models/{parquet_model}/histogram/amount/").status_code == 500
        assert client.get(f"/api/models/{parquet_model}/profile/").status_code == 500
        assert client.post(f"/api/models/{parquet_model}/profile/invalidate/").status_code == 500
