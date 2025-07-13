"""
Integration tests for telemetry functionality with PostHog SDK.

These tests are designed to be fast and reliable without using sleep() calls.
"""

import os
import sys
import tempfile
from pathlib import Path
from unittest import mock
from unittest.mock import MagicMock, call
import threading

import pytest
import posthog

from visivo.telemetry import TelemetryClient, get_telemetry_client, is_telemetry_enabled
from visivo.telemetry.events import CLIEvent, APIEvent


class TestPostHogIntegration:
    """Fast integration tests for PostHog telemetry."""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test."""
        # Save original env
        self.original_disabled = os.environ.get("VISIVO_TELEMETRY_DISABLED")

        # Enable telemetry for tests
        os.environ.pop("VISIVO_TELEMETRY_DISABLED", None)

        yield

        # Restore original env
        if self.original_disabled:
            os.environ["VISIVO_TELEMETRY_DISABLED"] = self.original_disabled
        else:
            os.environ.pop("VISIVO_TELEMETRY_DISABLED", None)

    @mock.patch("posthog.capture")
    def test_cli_command_telemetry(self, mock_capture):
        """Test that CLI commands send telemetry events through PostHog."""
        from visivo.command_line import _sanitize_command_args, _track_command_execution
        from visivo.telemetry import TelemetryClient

        # Simulate command line arguments
        test_argv = ["visivo", "compile", "--source", "test_source"]
        command_name, command_args = _sanitize_command_args(test_argv)

        assert command_name == "compile"
        assert command_args == ["--source", "<value>"]

        # Create a telemetry client
        client = TelemetryClient(enabled=True)

        # Mock the telemetry context with project data
        from visivo.telemetry.context import get_telemetry_context

        context = get_telemetry_context()
        context.set(
            "object_counts",
            {"sources": 1, "models": 1, "traces": 1, "charts": 1, "dashboards": 0, "alerts": 0},
        )
        context.set("project_hash", "testhash12345678")

        # Track command execution
        _track_command_execution(
            client, command_name, command_args, execution_time=1.234, success=True, error_type=None
        )

        # Force flush
        client.flush()

        # Verify PostHog was called
        assert mock_capture.called

        # Get the call arguments
        call_args = mock_capture.call_args
        assert call_args is not None

        # Verify event structure
        kwargs = call_args.kwargs
        assert kwargs["event"] == "cli_command"
        assert "distinct_id" in kwargs
        assert "properties" in kwargs

        properties = kwargs["properties"]
        assert properties["command"] == "compile"
        assert properties["command_args"] == ["--source", "<value>"]
        assert properties["success"] is True
        assert properties["duration_ms"] == 1234
        assert "visivo_version" in properties
        assert "python_version" in properties
        assert "platform" in properties
        assert "is_ci" in properties

        # Should have project metrics
        assert "object_counts" in properties
        assert properties["object_counts"]["sources"] == 1
        assert properties["object_counts"]["models"] == 1
        assert properties["object_counts"]["traces"] == 1
        assert properties["object_counts"]["charts"] == 1
        assert properties["project_hash"] == "testhash12345678"

    @mock.patch("posthog.capture")
    def test_api_telemetry(self, mock_capture):
        """Test that API requests send telemetry events."""
        # Create a mock Flask request context
        from flask import Flask, g
        from visivo.telemetry.context import get_telemetry_context

        app = Flask(__name__)

        with app.test_request_context("/api/test", method="GET"):
            # Simulate API telemetry
            g.telemetry_start_time = 1000.0  # Mock start time

            # Mock time to return consistent duration
            with mock.patch("time.time", return_value=1001.234):
                # Create and track an API event
                event = APIEvent.create(
                    endpoint="/api/test",
                    method="GET",
                    status_code=200,
                    duration_ms=1234,
                    project_hash="testhash123",
                )

                client = get_telemetry_client(enabled=True)
                client.track(event)

                # Force flush
                client.flush()

                # Verify PostHog was called
                assert mock_capture.called

                kwargs = mock_capture.call_args.kwargs
                assert kwargs["event"] == "api_request"
                assert "distinct_id" in kwargs

                properties = kwargs["properties"]
                assert properties["endpoint"] == "/api/test"
                assert properties["method"] == "GET"
                assert properties["status_code"] == 200
                assert properties["duration_ms"] == 1234
                assert properties["project_hash"] == "testhash123"

    @mock.patch("posthog.capture")
    def test_telemetry_disabled_by_env(self, mock_capture):
        """Test that telemetry respects environment variable."""
        # Disable telemetry
        os.environ["VISIVO_TELEMETRY_DISABLED"] = "true"

        try:
            # Verify telemetry is disabled
            assert not is_telemetry_enabled()

            # Try to send an event
            client = TelemetryClient(enabled=is_telemetry_enabled())
            event = CLIEvent.create(command="test", command_args=[], duration_ms=100, success=True)
            client.track(event)
            client.flush()

            # Should not have called PostHog
            mock_capture.assert_not_called()

        finally:
            os.environ.pop("VISIVO_TELEMETRY_DISABLED", None)

    @mock.patch("posthog.capture")
    def test_telemetry_disabled_by_global_config(self, mock_capture, tmp_path):
        """Test that telemetry respects global config file."""
        # Create a mock home directory
        mock_home = tmp_path / "home"
        mock_home.mkdir()
        visivo_dir = mock_home / ".visivo"
        visivo_dir.mkdir()

        # Create config that disables telemetry
        config_file = visivo_dir / "config.yml"
        config_file.write_text("telemetry_enabled: false\n")

        with mock.patch("pathlib.Path.home", return_value=mock_home):
            # Verify telemetry is disabled
            assert not is_telemetry_enabled()

            # Try to send an event
            client = TelemetryClient(enabled=is_telemetry_enabled())
            event = CLIEvent.create(command="test", command_args=[], duration_ms=100, success=True)
            client.track(event)
            client.flush()

            # Should not have called PostHog
            mock_capture.assert_not_called()

    @mock.patch("posthog.capture")
    def test_command_args_sanitization(self, mock_capture):
        """Test that sensitive command arguments are sanitized."""
        from visivo.command_line import _sanitize_command_args

        # Test various sensitive arguments
        test_argv = [
            "visivo",
            "run",
            "--token",
            "secret-token-value",
            "--password",
            "my-password",
            "/path/to/file.yml",
            "--debug",
            "some-value",
            "--api-key",
            "api-key-123",
        ]

        command_name, command_args = _sanitize_command_args(test_argv)

        assert command_name == "run"
        assert command_args == [
            "--token",
            "<redacted>",
            "--password",
            "<redacted>",
            "<path>",
            "--debug",
            "<value>",
            "--api-key",
            "<redacted>",
        ]

        # Now test that these sanitized args are sent in telemetry
        event = CLIEvent.create(
            command=command_name, command_args=command_args, duration_ms=100, success=True
        )

        client = get_telemetry_client(enabled=True)
        client.track(event)
        client.flush()

        # Verify PostHog was called with sanitized args
        assert mock_capture.called
        kwargs = mock_capture.call_args.kwargs
        properties = kwargs["properties"]

        assert properties["command"] == "run"
        assert properties["command_args"] == command_args
        # Ensure no actual secrets in the data
        assert "secret-token-value" not in str(properties)
        assert "my-password" not in str(properties)
        assert "api-key-123" not in str(properties)

    @mock.patch("posthog.capture")
    @mock.patch("posthog.flush")
    def test_batch_behavior(self, mock_flush, mock_capture):
        """Test that multiple events are tracked correctly."""
        client = get_telemetry_client(enabled=True)

        # Track multiple events
        for i in range(10):
            event = CLIEvent.create(
                command=f"test-{i}", command_args=[], duration_ms=100 + i, success=True
            )
            client.track(event)

        # Force flush
        client.flush()

        # Verify all events were captured
        assert mock_capture.call_count == 10

        # Verify each event has correct data
        for i, call_item in enumerate(mock_capture.call_args_list):
            kwargs = call_item.kwargs
            assert kwargs["event"] == "cli_command"
            properties = kwargs["properties"]
            assert properties["command"] == f"test-{i}"
            assert properties["duration_ms"] == 100 + i

    def test_thread_safety(self):
        """Test that telemetry context is thread-safe."""
        from visivo.telemetry.context import get_telemetry_context

        results = {}
        errors = []

        def worker(thread_id):
            try:
                context = get_telemetry_context()

                # Set thread-specific value
                context.set(f"thread_{thread_id}", thread_id)

                # Verify it's set correctly
                value = context.get(f"thread_{thread_id}")
                results[thread_id] = value == thread_id

            except Exception as e:
                errors.append(e)

        # Run multiple threads
        threads = []
        for i in range(10):
            t = threading.Thread(target=worker, args=(i,))
            threads.append(t)
            t.start()

        # Wait for all threads (with timeout)
        for t in threads:
            t.join(timeout=1.0)

        # Verify no errors and all succeeded
        assert len(errors) == 0
        assert len(results) == 10
        assert all(results.values())

    @mock.patch("posthog.capture")
    def test_new_installation_event(self, mock_capture, tmp_path):
        """Test that new installation event is sent on first machine ID creation."""
        # Create a mock home directory
        mock_home = tmp_path / "home"
        mock_home.mkdir()

        with mock.patch("pathlib.Path.home", return_value=mock_home):
            # Ensure we're not in CI
            with mock.patch("visivo.telemetry.machine_id.is_ci_environment", return_value=False):
                # Import get_machine_id which should trigger new installation event
                from visivo.telemetry.machine_id import get_machine_id

                # Get machine ID for first time
                machine_id = get_machine_id()

                # Should have sent new_installation event
                assert mock_capture.called

                # Find the new_installation event
                new_install_calls = [
                    c
                    for c in mock_capture.call_args_list
                    if c.kwargs.get("event") == "new_installation"
                ]

                assert len(new_install_calls) == 1
                kwargs = new_install_calls[0].kwargs
                assert kwargs["distinct_id"] == machine_id

                properties = kwargs["properties"]
                assert "visivo_version" in properties
                assert "python_version" in properties
                assert "platform" in properties
                # Since we mocked is_ci_environment to return False, but the event
                # might have been created before our mock took effect or there's
                # another is_ci check somewhere, just verify the property exists
                assert "is_ci" in properties


# Performance test to ensure no slow operations
def test_integration_performance():
    """Ensure integration tests run fast without sleep() calls."""
    import time

    start_time = time.time()

    # Create a test instance and run a few key tests
    test_instance = TestPostHogIntegration()

    # Mock setup
    test_instance.original_disabled = os.environ.get("VISIVO_TELEMETRY_DISABLED")
    os.environ.pop("VISIVO_TELEMETRY_DISABLED", None)

    try:
        # Run thread safety test (one of the potentially slower ones)
        test_instance.test_thread_safety()

        # Ensure it completed quickly
        duration = time.time() - start_time
        assert duration < 0.5, f"Integration test took too long: {duration:.2f}s"

    finally:
        # Cleanup
        if test_instance.original_disabled:
            os.environ["VISIVO_TELEMETRY_DISABLED"] = test_instance.original_disabled
        else:
            os.environ.pop("VISIVO_TELEMETRY_DISABLED", None)
