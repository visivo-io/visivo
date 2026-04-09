import time
import pytest
from unittest.mock import Mock, MagicMock
from flask import Flask
from pydantic import ValidationError

from visivo.server.views.explorer_views import register_explorer_views


class TestExplorerDiffViews:
    """Test suite for the explorer diff endpoint."""

    @pytest.fixture
    def app(self):
        """Create a test Flask app with explorer views."""
        app = Flask(__name__)
        app.config["TESTING"] = True

        flask_app = Mock()

        # Create mock managers with get_object and validate methods
        for attr in [
            "model_manager",
            "insight_manager",
            "chart_manager",
            "metric_manager",
            "dimension_manager",
        ]:
            manager = Mock()
            manager.published_objects = {}
            manager.get = Mock(return_value=None)
            manager.validate_object = Mock(side_effect=lambda config: Mock(
                model_dump=Mock(return_value=config)
            ))
            manager.objects_equal = Mock(return_value=True)
            setattr(flask_app, attr, manager)

        register_explorer_views(app, flask_app, "/tmp/output")
        app.flask_app = flask_app
        return app

    @pytest.fixture
    def client(self, app):
        return app.test_client()

    def test_empty_request_returns_400(self, client):
        response = client.post("/api/explorer/diff/")
        assert response.status_code == 400

    def test_empty_body_returns_empty_result(self, client):
        response = client.post(
            "/api/explorer/diff/",
            json={},
            content_type="application/json",
        )
        assert response.status_code == 200
        assert response.get_json() == {}

    def test_new_model_returns_new_status(self, client, app):
        """Model not in published_objects → status is 'new'."""
        # published_objects is empty, so any model is new
        response = client.post(
            "/api/explorer/diff/",
            json={"models": {"new_model": {"sql": "SELECT 1"}}},
            content_type="application/json",
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["models"]["new_model"] == "new"

    def test_unchanged_model_returns_null(self, client, app):
        """Model in published_objects with matching config → status is null."""
        published_model = Mock()
        published_model.model_dump = Mock(
            return_value={"name": "my_model", "sql": "SELECT 1"}
        )
        app.flask_app.model_manager.get = Mock(return_value=published_model)

        # validate_object returns the same dump as published
        app.flask_app.model_manager.validate_object = Mock(
            return_value=Mock(
                model_dump=Mock(
                    return_value={"name": "my_model", "sql": "SELECT 1"}
                )
            )
        )

        response = client.post(
            "/api/explorer/diff/",
            json={"models": {"my_model": {"sql": "SELECT 1"}}},
            content_type="application/json",
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["models"]["my_model"] is None

    def test_modified_model_returns_modified(self, client, app):
        """Model in published_objects with different config → status is 'modified'."""
        published_model = Mock()
        published_model.model_dump = Mock(
            return_value={"name": "my_model", "sql": "SELECT 1"}
        )
        app.flask_app.model_manager.get = Mock(return_value=published_model)

        app.flask_app.model_manager.validate_object = Mock(
            return_value=Mock(
                model_dump=Mock(
                    return_value={"name": "my_model", "sql": "SELECT 2"}
                )
            )
        )

        response = client.post(
            "/api/explorer/diff/",
            json={"models": {"my_model": {"sql": "SELECT 2"}}},
            content_type="application/json",
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["models"]["my_model"] == "modified"

    def test_new_insight_returns_new(self, client, app):
        response = client.post(
            "/api/explorer/diff/",
            json={"insights": {"new_insight": {"props": {"type": "scatter"}}}},
            content_type="application/json",
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["insights"]["new_insight"] == "new"

    def test_new_chart_returns_new(self, client, app):
        response = client.post(
            "/api/explorer/diff/",
            json={"chart": {"name": "new_chart", "insights": [], "layout": {}}},
            content_type="application/json",
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["chart"] == "new"

    def test_batch_diff_multiple_types(self, client, app):
        """Batch request with models, insights, and chart."""
        response = client.post(
            "/api/explorer/diff/",
            json={
                "models": {"m1": {"sql": "SELECT 1"}},
                "insights": {"i1": {"props": {"type": "bar"}}},
                "chart": {"name": "c1", "insights": [], "layout": {}},
            },
            content_type="application/json",
        )
        assert response.status_code == 200
        data = response.get_json()
        assert "models" in data
        assert "insights" in data
        assert "chart" in data

    def test_validation_failure_returns_modified(self, client, app):
        """If Pydantic validation fails, treat as modified (something changed)."""
        app.flask_app.model_manager.validate_object = Mock(
            side_effect=ValidationError.from_exception_data(
                title="test", line_errors=[]
            )
        )

        response = client.post(
            "/api/explorer/diff/",
            json={"models": {"bad_model": {"sql": "invalid"}}},
            content_type="application/json",
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["models"]["bad_model"] == "modified"

    def test_only_compares_sent_fields(self, client, app):
        """Extra fields on published object don't affect comparison."""
        published_model = Mock()
        # Published has extra fields (metrics, dimensions)
        published_model.model_dump = Mock(
            return_value={
                "name": "m",
                "sql": "SELECT 1",
                "metrics": [{"name": "x_sum"}],
                "dimensions": [],
            }
        )
        app.flask_app.model_manager.get = Mock(return_value=published_model)

        # Context only sends sql
        app.flask_app.model_manager.validate_object = Mock(
            return_value=Mock(
                model_dump=Mock(
                    return_value={"name": "m", "sql": "SELECT 1", "metrics": [], "dimensions": []}
                )
            )
        )

        response = client.post(
            "/api/explorer/diff/",
            json={"models": {"m": {"sql": "SELECT 1"}}},
            content_type="application/json",
        )
        assert response.status_code == 200
        data = response.get_json()
        # Should be unchanged because only "sql" was in the request, and it matches
        assert data["models"]["m"] is None

    def test_performance_under_70ms(self, client, app):
        """Diff endpoint responds in under 70ms for a typical batch."""
        start = time.time()
        response = client.post(
            "/api/explorer/diff/",
            json={
                "models": {"m1": {"sql": "SELECT 1"}, "m2": {"sql": "SELECT 2"}},
                "insights": {"i1": {"props": {"type": "scatter"}}, "i2": {"props": {"type": "bar"}}},
                "chart": {"name": "c1", "insights": [], "layout": {}},
                "metrics": {"met1": {"expression": "SUM(x)"}},
                "dimensions": {"dim1": {"expression": "x"}},
            },
            content_type="application/json",
        )
        elapsed_ms = (time.time() - start) * 1000
        assert response.status_code == 200
        assert elapsed_ms < 70, f"Diff took {elapsed_ms:.1f}ms, expected < 70ms"
