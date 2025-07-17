"""
Tests for Flask telemetry middleware.
"""

import os
import pytest
from unittest.mock import Mock, patch
from flask import Flask
from visivo.telemetry.middleware import init_telemetry_middleware
from visivo.telemetry.events import APIEvent
from visivo.telemetry.utils import hash_project_name


class TestTelemetryMiddleware:
    """Test telemetry middleware functionality."""

    @pytest.fixture
    def mock_project(self):
        """Create a mock project with telemetry enabled."""
        project = Mock()
        project.name = "test-project"
        project.defaults = Mock()
        project.defaults.telemetry_enabled = None  # Use default (enabled)
        return project

    @pytest.fixture
    def flask_app(self):
        """Create a test Flask app."""
        app = Flask(__name__)
        app.config["TESTING"] = True

        @app.route("/test")
        def test_endpoint():
            return {"status": "ok"}, 200

        @app.route("/api/project/<project_id>")
        def project_endpoint(project_id):
            return {"project_id": project_id}, 200

        return app

    @pytest.fixture
    def enable_telemetry(self, monkeypatch):
        """Temporarily enable telemetry for this test."""
        # Remove the environment variable that disables telemetry
        monkeypatch.delenv("VISIVO_TELEMETRY_DISABLED", raising=False)
        yield
        # Restore it after the test
        monkeypatch.setenv("VISIVO_TELEMETRY_DISABLED", "true")

    def test_middleware_initialization_with_telemetry_enabled(
        self, flask_app, mock_project, enable_telemetry
    ):
        """Test that middleware initializes correctly when telemetry is enabled."""
        # This should not raise an ImportError
        with patch("visivo.telemetry.middleware.get_telemetry_client") as mock_client:
            init_telemetry_middleware(flask_app, mock_project)

            # Verify client was created
            mock_client.assert_called_once_with(enabled=True)

    def test_middleware_does_not_initialize_when_disabled(self, flask_app, mock_project):
        """Test that middleware doesn't initialize when telemetry is disabled."""
        # Telemetry should be disabled by default in tests
        with patch("visivo.telemetry.middleware.get_telemetry_client") as mock_client:
            init_telemetry_middleware(flask_app, mock_project)

            # Client should not be created
            mock_client.assert_not_called()

    def test_project_hash_is_calculated(self, flask_app, mock_project, enable_telemetry):
        """Test that project name is hashed correctly."""
        with patch("visivo.telemetry.middleware.get_telemetry_client") as mock_get_client:
            mock_client = Mock()
            mock_get_client.return_value = mock_client

            # Initialize middleware
            init_telemetry_middleware(flask_app, mock_project)

            # Make a request to trigger middleware
            client = flask_app.test_client()
            response = client.get("/test")

            # Verify response is successful
            assert response.status_code == 200

            # Verify track was called
            mock_client.track.assert_called_once()
            event = mock_client.track.call_args[0][0]

            # Verify project hash was included
            expected_hash = hash_project_name("test-project")
            assert event.to_dict()["properties"]["project_hash"] == expected_hash

    def test_api_request_tracking(self, flask_app, mock_project, enable_telemetry):
        """Test that API requests are tracked correctly."""
        with patch("visivo.telemetry.middleware.get_telemetry_client") as mock_get_client:
            mock_client = Mock()
            mock_get_client.return_value = mock_client

            # Initialize middleware
            init_telemetry_middleware(flask_app, mock_project)

            # Make a request
            client = flask_app.test_client()
            response = client.get("/test")

            # Verify response
            assert response.status_code == 200

            # Verify tracking was called
            mock_client.track.assert_called_once()
            event = mock_client.track.call_args[0][0]

            # Verify event properties
            assert isinstance(event, APIEvent)
            event_dict = event.to_dict()
            assert event_dict["event_type"] == "api_request"
            assert event_dict["properties"]["endpoint"] == "test_endpoint"
            assert event_dict["properties"]["method"] == "GET"
            assert event_dict["properties"]["status_code"] == 200
            assert "duration_ms" in event_dict["properties"]

    def test_endpoint_sanitization(self, flask_app, mock_project, enable_telemetry):
        """Test that endpoints with IDs are sanitized."""
        with patch("visivo.telemetry.middleware.get_telemetry_client") as mock_get_client:
            mock_client = Mock()
            mock_get_client.return_value = mock_client

            # Initialize middleware
            init_telemetry_middleware(flask_app, mock_project)

            # Make requests with different ID formats
            client = flask_app.test_client()

            # Test UUID sanitization
            client.get("/api/project/550e8400-e29b-41d4-a716-446655440000")
            event1 = mock_client.track.call_args[0][0]
            assert "project_endpoint" in event1.to_dict()["properties"]["endpoint"]

            # Reset mock
            mock_client.reset_mock()

            # Test numeric ID sanitization
            client.get("/api/project/12345")
            event2 = mock_client.track.call_args[0][0]
            assert "project_endpoint" in event2.to_dict()["properties"]["endpoint"]

    def test_middleware_without_project(self, flask_app, enable_telemetry):
        """Test middleware works without a project object."""
        with patch("visivo.telemetry.middleware.get_telemetry_client") as mock_get_client:
            mock_client = Mock()
            mock_get_client.return_value = mock_client

            # Initialize without project
            init_telemetry_middleware(flask_app, None)

            # Make a request
            client = flask_app.test_client()
            response = client.get("/test")

            # Verify response
            assert response.status_code == 200

            # Verify tracking was called without project_hash
            mock_client.track.assert_called_once()
            event = mock_client.track.call_args[0][0]
            event_dict = event.to_dict()
            assert "project_hash" not in event_dict["properties"]

    def test_request_duration_tracking(self, flask_app, mock_project, enable_telemetry):
        """Test that request duration is tracked."""
        with patch("visivo.telemetry.middleware.get_telemetry_client") as mock_get_client:
            mock_client = Mock()
            mock_get_client.return_value = mock_client

            # Initialize middleware
            init_telemetry_middleware(flask_app, mock_project)

            # Make a request
            client = flask_app.test_client()
            response = client.get("/test")

            # Verify tracking was called
            mock_client.track.assert_called_once()
            event = mock_client.track.call_args[0][0]

            # Verify duration is tracked and reasonable
            duration_ms = event.to_dict()["properties"]["duration_ms"]
            assert isinstance(duration_ms, int)
            assert duration_ms >= 0
            assert duration_ms < 1000  # Should be less than 1 second for a simple test
