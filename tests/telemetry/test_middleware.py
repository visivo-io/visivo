"""
Tests for Flask telemetry middleware.
"""

import pytest
from unittest.mock import Mock, patch
from flask import Flask
from visivo.telemetry.middleware import (
    init_telemetry_middleware,
    is_tracked_path,
    sanitize_endpoint,
    RequestCoalescer,
)
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

        @app.route("/api/test")
        def test_endpoint():
            return {"status": "ok"}, 200

        @app.route("/api/project/<project_id>")
        def project_endpoint(project_id):
            return {"project_id": project_id}, 200

        @app.route("/api/telemetry/workspace-event/", methods=["POST"])
        def post_workspace_event():
            return "", 204

        @app.route("/data/<path:path>")
        def data_file(path):
            return "{}", 200

        @app.route("/assets/<path:path>")
        def viewer_asset(path):
            return "", 200

        return app

    @pytest.fixture
    def enable_telemetry(self, monkeypatch):
        """Temporarily enable telemetry for this test.

        pytest.ini sets CI=true, which the middleware treats as "no session
        telemetry", so the CI gate is patched off here and tested on its own.
        """
        monkeypatch.delenv("VISIVO_TELEMETRY_DISABLED", raising=False)
        with patch("visivo.telemetry.middleware.is_ci_environment", return_value=False):
            yield
        monkeypatch.setenv("VISIVO_TELEMETRY_DISABLED", "true")

    @pytest.fixture
    def tracked(self, flask_app, mock_project, enable_telemetry):
        """Middleware installed with a mock client; yields (test_client, mock_client)."""
        with patch("visivo.telemetry.middleware.get_telemetry_client") as mock_get_client:
            mock_client = Mock()
            mock_get_client.return_value = mock_client
            init_telemetry_middleware(flask_app, mock_project)
            yield flask_app.test_client(), mock_client

    def test_middleware_initialization_with_telemetry_enabled(
        self, flask_app, mock_project, enable_telemetry
    ):
        """Test that middleware initializes correctly when telemetry is enabled."""
        with patch("visivo.telemetry.middleware.get_telemetry_client") as mock_client:
            init_telemetry_middleware(flask_app, mock_project)
            mock_client.assert_called_once_with(enabled=True)

    def test_middleware_does_not_initialize_when_disabled(self, flask_app, mock_project):
        """Test that middleware doesn't initialize when telemetry is disabled."""
        # Telemetry should be disabled by default in tests
        with patch("visivo.telemetry.middleware.get_telemetry_client") as mock_client:
            init_telemetry_middleware(flask_app, mock_project)
            mock_client.assert_not_called()

    def test_middleware_does_not_initialize_in_ci(self, flask_app, mock_project, monkeypatch):
        """A `visivo serve` under CI is a smoke test: no api_request events at all."""
        monkeypatch.delenv("VISIVO_TELEMETRY_DISABLED", raising=False)
        with patch("visivo.telemetry.middleware.is_ci_environment", return_value=True):
            with patch("visivo.telemetry.middleware.get_telemetry_client") as mock_get_client:
                mock_client = Mock()
                mock_get_client.return_value = mock_client
                init_telemetry_middleware(flask_app, mock_project)
                flask_app.test_client().get("/api/test")
                mock_get_client.assert_not_called()
                mock_client.track.assert_not_called()

    def test_project_hash_is_calculated(self, tracked):
        """Test that project name is hashed correctly."""
        client, mock_client = tracked
        response = client.get("/api/test")
        assert response.status_code == 200

        mock_client.track.assert_called_once()
        event = mock_client.track.call_args[0][0]
        expected_hash = hash_project_name("test-project")
        assert event.to_dict()["properties"]["project_hash"] == expected_hash

    def test_api_request_tracking(self, tracked):
        """Test that API requests are tracked correctly."""
        client, mock_client = tracked
        response = client.get("/api/test")
        assert response.status_code == 200

        mock_client.track.assert_called_once()
        event = mock_client.track.call_args[0][0]
        assert isinstance(event, APIEvent)
        event_dict = event.to_dict()
        assert event_dict["event_type"] == "api_request"
        assert event_dict["properties"]["endpoint"] == "test_endpoint"
        assert event_dict["properties"]["method"] == "GET"
        assert event_dict["properties"]["status_code"] == 200
        assert event_dict["properties"]["request_count"] == 1
        assert "duration_ms" in event_dict["properties"]

    def test_endpoint_sanitization(self, tracked):
        """Test that endpoints with IDs are sanitized."""
        client, mock_client = tracked

        client.get("/api/project/550e8400-e29b-41d4-a716-446655440000")
        event1 = mock_client.track.call_args[0][0]
        assert "project_endpoint" in event1.to_dict()["properties"]["endpoint"]

        mock_client.reset_mock()

        # Same endpoint, same window: coalesced, so nothing new is tracked.
        client.get("/api/project/12345")
        mock_client.track.assert_not_called()

    def test_middleware_without_project(self, flask_app, enable_telemetry):
        """Test middleware works without a project object."""
        with patch("visivo.telemetry.middleware.get_telemetry_client") as mock_get_client:
            mock_client = Mock()
            mock_get_client.return_value = mock_client
            init_telemetry_middleware(flask_app, None)

            response = flask_app.test_client().get("/api/test")
            assert response.status_code == 200

            mock_client.track.assert_called_once()
            event = mock_client.track.call_args[0][0]
            assert "project_hash" not in event.to_dict()["properties"]

    def test_request_duration_tracking(self, tracked):
        """Test that request duration is tracked."""
        client, mock_client = tracked
        client.get("/api/test")

        mock_client.track.assert_called_once()
        event = mock_client.track.call_args[0][0]
        duration_ms = event.to_dict()["properties"]["duration_ms"]
        assert isinstance(duration_ms, int)
        assert 0 <= duration_ms < 1000

    def test_static_assets_and_data_files_are_not_tracked(self, tracked):
        """The viewer bundle and /data/ files are not product usage."""
        client, mock_client = tracked
        assert client.get("/data/project.json").status_code == 200
        assert client.get("/assets/index-abc123.js").status_code == 200
        mock_client.track.assert_not_called()

    def test_telemetry_relay_is_not_tracked(self, tracked):
        """Tracking the workspace-event relay would double-count every viewer event."""
        client, mock_client = tracked
        assert client.post("/api/telemetry/workspace-event/", json={}).status_code == 204
        mock_client.track.assert_not_called()

    def test_burst_to_one_endpoint_is_coalesced(self, tracked):
        """A burst to one endpoint produces one event, not one per request."""
        client, mock_client = tracked
        for _ in range(50):
            client.get("/api/test")
        assert mock_client.track.call_count == 1

    def test_distinct_endpoints_each_report(self, tracked):
        """Coalescing is per endpoint: different endpoints still each appear."""
        client, mock_client = tracked
        client.get("/api/test")
        client.get("/api/project/1")
        assert mock_client.track.call_count == 2
        endpoints = {
            c[0][0].to_dict()["properties"]["endpoint"] for c in mock_client.track.call_args_list
        }
        assert endpoints == {"test_endpoint", "project_endpoint"}

    def test_coalesced_count_rides_on_next_window(self, flask_app, mock_project, enable_telemetry):
        """Requests silenced in a window are reported as request_count on the next event."""
        clock = {"now": 0.0}
        coalescer = RequestCoalescer(window_seconds=60.0, clock=lambda: clock["now"])
        with patch("visivo.telemetry.middleware.RequestCoalescer", return_value=coalescer):
            with patch("visivo.telemetry.middleware.get_telemetry_client") as mock_get_client:
                mock_client = Mock()
                mock_get_client.return_value = mock_client
                init_telemetry_middleware(flask_app, mock_project)
                client = flask_app.test_client()

                for _ in range(10):
                    client.get("/api/test")
                assert mock_client.track.call_count == 1
                assert (
                    mock_client.track.call_args[0][0].to_dict()["properties"]["request_count"] == 1
                )

                clock["now"] = 61.0
                client.get("/api/test")
                assert mock_client.track.call_count == 2
                event = mock_client.track.call_args[0][0]
                # 9 silenced in the first window + this one
                assert event.to_dict()["properties"]["request_count"] == 10


class TestIsTrackedPath:
    def test_api_paths_are_tracked(self):
        assert is_tracked_path("/api/project/")
        assert is_tracked_path("/api/dimensions/")

    def test_non_api_paths_are_not_tracked(self):
        assert not is_tracked_path("/")
        assert not is_tracked_path("/data/project.json")
        assert not is_tracked_path("/assets/index-abc.js")
        assert not is_tracked_path("/favicon.ico")
        assert not is_tracked_path("")
        assert not is_tracked_path(None)

    def test_telemetry_relay_is_excluded(self):
        assert not is_tracked_path("/api/telemetry/workspace-event/")


class TestSanitizeEndpoint:
    def test_uuid_numeric_and_hash_ids_are_replaced(self):
        assert (
            sanitize_endpoint("/api/project/550e8400-e29b-41d4-a716-446655440000")
            == "/api/project/{id}"
        )
        assert sanitize_endpoint("/api/project/12345") == "/api/project/{id}"
        assert sanitize_endpoint("/api/file/" + "a" * 40) == "/api/file/{hash}"

    def test_endpoint_names_pass_through(self):
        assert sanitize_endpoint("list_all_dimensions") == "list_all_dimensions"


class TestRequestCoalescer:
    def test_first_request_in_window_is_admitted(self):
        clock = {"now": 0.0}
        c = RequestCoalescer(window_seconds=60.0, clock=lambda: clock["now"])
        assert c.admit(("a", "GET", 200)) == 1

    def test_requests_inside_window_are_silenced(self):
        clock = {"now": 0.0}
        c = RequestCoalescer(window_seconds=60.0, clock=lambda: clock["now"])
        c.admit(("a", "GET", 200))
        clock["now"] = 30.0
        assert c.admit(("a", "GET", 200)) == 0

    def test_silenced_count_is_returned_when_window_rolls(self):
        clock = {"now": 0.0}
        c = RequestCoalescer(window_seconds=60.0, clock=lambda: clock["now"])
        c.admit(("a", "GET", 200))
        for _ in range(4):
            c.admit(("a", "GET", 200))
        clock["now"] = 60.0
        assert c.admit(("a", "GET", 200)) == 5
        # The new window starts clean.
        clock["now"] = 120.0
        assert c.admit(("a", "GET", 200)) == 1

    def test_keys_are_independent(self):
        clock = {"now": 0.0}
        c = RequestCoalescer(window_seconds=60.0, clock=lambda: clock["now"])
        assert c.admit(("a", "GET", 200)) == 1
        assert c.admit(("a", "GET", 500)) == 1
        assert c.admit(("b", "GET", 200)) == 1
        assert c.admit(("a", "POST", 200)) == 1
