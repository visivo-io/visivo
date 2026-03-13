import os
import pytest
from unittest.mock import Mock
from flask import Flask

from visivo.server.views.model_data_views import register_model_data_views
from visivo.models.base.named_model import alpha_hash


class TestModelDataViews:

    @pytest.fixture
    def output_dir(self, tmp_path):
        return str(tmp_path)

    @pytest.fixture
    def app(self, output_dir):
        app = Flask(__name__)
        app.config["TESTING"] = True
        flask_app = Mock()
        register_model_data_views(app, flask_app, output_dir)
        return app

    @pytest.fixture
    def client(self, app):
        return app.test_client()

    def test_returns_not_available_when_no_parquet(self, client):
        response = client.get("/api/models/nonexistent_model/data/")
        assert response.status_code == 200
        data = response.get_json()
        assert data["available"] is False

    def test_returns_data_when_parquet_exists(self, client, output_dir):
        import polars as pl

        model_name = "test_model"
        name_hash = alpha_hash(model_name)
        run_dir = os.path.join(output_dir, "main", "files")
        os.makedirs(run_dir, exist_ok=True)

        df = pl.DataFrame({"id": [1, 2, 3], "value": [10.0, 20.0, 30.0]})
        df.write_parquet(os.path.join(run_dir, f"{name_hash}.parquet"))

        response = client.get(f"/api/models/{model_name}/data/")
        assert response.status_code == 200
        data = response.get_json()
        assert data["available"] is True
        assert data["columns"] == ["id", "value"]
        assert len(data["rows"]) == 3
        assert data["row_count"] == 3
        assert data["truncated"] is False

    def test_returns_most_recent_run(self, client, output_dir):
        import polars as pl
        import time

        model_name = "multi_run_model"
        name_hash = alpha_hash(model_name)

        old_dir = os.path.join(output_dir, "old_run", "files")
        os.makedirs(old_dir, exist_ok=True)
        pl.DataFrame({"x": [1]}).write_parquet(os.path.join(old_dir, f"{name_hash}.parquet"))

        time.sleep(0.1)

        new_dir = os.path.join(output_dir, "new_run", "files")
        os.makedirs(new_dir, exist_ok=True)
        pl.DataFrame({"x": [1, 2, 3]}).write_parquet(os.path.join(new_dir, f"{name_hash}.parquet"))

        response = client.get(f"/api/models/{model_name}/data/")
        assert response.status_code == 200
        data = response.get_json()
        assert data["available"] is True
        assert data["row_count"] == 3
