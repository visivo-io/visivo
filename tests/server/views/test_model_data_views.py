"""Tests for model data views."""

import os
import pytest
import tempfile
import polars as pl
from unittest.mock import Mock, patch
from flask import Flask

from visivo.server.views.model_data_views import register_model_data_views


class TestModelDataViews:
    """Test suite for model data API endpoints."""

    @pytest.fixture
    def temp_dir(self):
        """Create a temporary directory for parquet files."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir

    @pytest.fixture
    def parquet_model(self, temp_dir):
        """Create test parquet file."""
        df = pl.DataFrame({"id": list(range(50)), "name": [f"item_{i}" for i in range(50)]})
        path = os.path.join(temp_dir, "test_model.parquet")
        df.write_parquet(path)
        return "test_model"

    @pytest.fixture
    def app(self, temp_dir):
        """Create a test Flask app with model data views."""
        app = Flask(__name__)
        app.config["TESTING"] = True

        # Create mock flask_app with managers
        flask_app = Mock()
        flask_app.model_manager = Mock()
        flask_app.source_manager = Mock()

        register_model_data_views(app, flask_app, temp_dir)

        # Store for access in tests
        app.flask_app = flask_app
        app.temp_dir = temp_dir

        return app

    @pytest.fixture
    def client(self, app):
        """Create a test client."""
        return app.test_client()

    def test_get_data_from_parquet(self, client, app, parquet_model):
        """Should return model data from parquet."""
        # Create parquet file in temp_dir
        df = pl.DataFrame({"id": list(range(50)), "name": [f"item_{i}" for i in range(50)]})
        path = os.path.join(app.temp_dir, "test_model.parquet")
        df.write_parquet(path)

        response = client.get("/api/models/test_model/data/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["source"] == "parquet"
        assert data["cached"] is True
        assert len(data["rows"]) <= 100
        assert data["total_count"] == 50

    def test_get_data_pagination(self, client, app):
        """Should paginate results correctly."""
        # Create parquet file
        df = pl.DataFrame({"id": list(range(50)), "name": [f"item_{i}" for i in range(50)]})
        path = os.path.join(app.temp_dir, "test_model.parquet")
        df.write_parquet(path)

        response = client.get("/api/models/test_model/data/?limit=10&offset=20")

        assert response.status_code == 200
        data = response.get_json()
        assert len(data["rows"]) == 10
        assert data["offset"] == 20
        assert data["limit"] == 10

    def test_get_data_limit_bounds(self, client, app):
        """Should enforce limit bounds."""
        # Create parquet file
        df = pl.DataFrame({"id": list(range(50))})
        path = os.path.join(app.temp_dir, "test_model.parquet")
        df.write_parquet(path)

        # Test max limit
        response = client.get("/api/models/test_model/data/?limit=20000")
        assert response.status_code == 200
        data = response.get_json()
        assert data["limit"] <= 10000

        # Test min limit
        response = client.get("/api/models/test_model/data/?limit=-5")
        assert response.status_code == 200
        data = response.get_json()
        assert data["limit"] >= 1

    def test_get_data_on_demand_execution(self, client, app):
        """Should execute model on-demand when parquet missing."""
        # Setup mock model and source
        mock_model = Mock()
        mock_model.name = "new_model"
        mock_model.sql = "SELECT 1 as col"
        mock_model.source = "ref(test_source)"
        app.flask_app.model_manager.get.return_value = mock_model

        mock_source = Mock()
        mock_source.read_sql.return_value = [{"col": 1}, {"col": 2}]
        app.flask_app.source_manager.get.return_value = mock_source

        response = client.get("/api/models/new_model/data/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["source"] == "query"
        assert data["cached"] is True
        assert "execution_time_ms" in data

    def test_get_data_model_not_found(self, client, app):
        """Should return 404 for missing model."""
        app.flask_app.model_manager.get.return_value = None

        response = client.get("/api/models/nonexistent/data/")

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data

    def test_run_model_success(self, client, app):
        """Should run model and return result."""
        mock_model = Mock()
        mock_model.name = "test_model"
        mock_model.sql = "SELECT * FROM table"
        mock_model.source = "ref(test_source)"
        app.flask_app.model_manager.get.return_value = mock_model

        mock_source = Mock()
        mock_source.read_sql.return_value = [{"a": 1}, {"a": 2}]
        app.flask_app.source_manager.get.return_value = mock_source

        response = client.post("/api/models/test_model/run/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["status"] == "success"
        assert data["row_count"] == 2
        assert data["profile_invalidated"] is True

    def test_run_model_with_custom_sql(self, client, app):
        """Should run model with custom SQL."""
        mock_model = Mock()
        mock_model.name = "test_model"
        mock_model.sql = "SELECT * FROM table"
        mock_model.source = "ref(test_source)"
        mock_model.model_dump.return_value = {"name": "test_model", "sql": "SELECT * FROM table"}
        app.flask_app.model_manager.get.return_value = mock_model
        app.flask_app.model_manager.save_from_config.return_value = mock_model

        mock_source = Mock()
        mock_source.read_sql.return_value = [{"a": 1}]
        app.flask_app.source_manager.get.return_value = mock_source

        custom_sql = "SELECT * FROM table WHERE id > 10"
        response = client.post(
            "/api/models/test_model/run/",
            json={"sql": custom_sql},
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["sql_modified"] is True
        mock_source.read_sql.assert_called_once_with(custom_sql)

    def test_run_model_not_found(self, client, app):
        """Should return 404 when model not found."""
        app.flask_app.model_manager.get.return_value = None

        response = client.post("/api/models/nonexistent/run/")

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data

    def test_run_model_execution_error(self, client, app):
        """Should return 500 on execution error."""
        mock_model = Mock()
        mock_model.name = "test_model"
        mock_model.sql = "INVALID SQL"
        mock_model.source = "ref(test_source)"
        app.flask_app.model_manager.get.return_value = mock_model

        mock_source = Mock()
        mock_source.read_sql.side_effect = Exception("SQL execution failed")
        app.flask_app.source_manager.get.return_value = mock_source

        response = client.post("/api/models/test_model/run/")

        assert response.status_code == 500
        data = response.get_json()
        assert "error" in data

    def test_get_status_with_data(self, client, app):
        """Should return status with data info."""
        # Create parquet file
        df = pl.DataFrame({"id": [1, 2, 3]})
        path = os.path.join(app.temp_dir, "test_model.parquet")
        df.write_parquet(path)

        mock_model = Mock()
        app.flask_app.model_manager.get.return_value = mock_model

        response = client.get("/api/models/test_model/status/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["exists"] is True
        assert data["has_data"] is True
        assert data["status"] == "ready"
        assert data["row_count"] == 3

    def test_get_status_without_data(self, client, app):
        """Should return not_run status when no parquet."""
        mock_model = Mock()
        app.flask_app.model_manager.get.return_value = mock_model

        response = client.get("/api/models/no_data/status/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["exists"] is True
        assert data["has_data"] is False
        assert data["status"] == "not_run"

    def test_get_status_model_not_found(self, client, app):
        """Should return 404 when model not found."""
        app.flask_app.model_manager.get.return_value = None

        response = client.get("/api/models/nonexistent/status/")

        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data

    def test_get_data_empty_request_body(self, client, app):
        """Should handle empty request body for run."""
        mock_model = Mock()
        mock_model.name = "test_model"
        mock_model.sql = "SELECT 1"
        mock_model.source = "ref(test_source)"
        app.flask_app.model_manager.get.return_value = mock_model

        mock_source = Mock()
        mock_source.read_sql.return_value = [{"col": 1}]
        app.flask_app.source_manager.get.return_value = mock_source

        response = client.post("/api/models/test_model/run/")

        assert response.status_code == 200
        data = response.get_json()
        assert data["status"] == "success"

    def test_get_data_negative_offset(self, client, app):
        """Should handle negative offset by setting to 0."""
        df = pl.DataFrame({"id": [1, 2, 3]})
        path = os.path.join(app.temp_dir, "test_model.parquet")
        df.write_parquet(path)

        response = client.get("/api/models/test_model/data/?offset=-10")

        assert response.status_code == 200
        data = response.get_json()
        assert data["offset"] == 0
