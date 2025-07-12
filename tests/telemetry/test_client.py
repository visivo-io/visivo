"""
Tests for telemetry client with PostHog SDK.
"""

import os
from unittest import mock
import posthog

from visivo.telemetry.client import TelemetryClient, get_telemetry_client
from visivo.telemetry.events import CLIEvent


class TestTelemetryClient:
    """Test telemetry client functionality with PostHog."""

    def setup_method(self):
        """Disable telemetry for all tests."""
        os.environ["VISIVO_TELEMETRY_DISABLED"] = "true"
        # Reset PostHog state
        posthog.disabled = True
        posthog.project_api_key = None

    def test_client_disabled(self):
        """Test that disabled client doesn't initialize PostHog."""
        client = TelemetryClient(enabled=False)
        assert not client.enabled
        assert not client._initialized

    def test_client_enabled(self):
        """Test that enabled client initializes PostHog."""
        # Mock PostHog to avoid actual initialization
        with mock.patch("posthog.project_api_key", None):
            client = TelemetryClient(enabled=True)
            assert client.enabled
            assert client._initialized
            # PostHog should be configured
            assert posthog.disabled is False

    def test_track_when_disabled(self):
        """Test that tracking does nothing when client is disabled."""
        client = TelemetryClient(enabled=False)
        event = CLIEvent.create("test", [], 100, True)

        # Should not raise any exceptions
        client.track(event)

    def test_track_when_enabled(self):
        """Test that tracking calls PostHog when enabled."""
        with mock.patch("posthog.capture") as mock_capture:
            client = TelemetryClient(enabled=True)
            event = CLIEvent.create("test", ["--flag"], 100, True)

            client.track(event)

            # Verify PostHog capture was called
            mock_capture.assert_called_once()
            call_args = mock_capture.call_args

            # Check the arguments
            assert call_args[1]["event"] == "cli_command"
            assert (
                "machine_id" in call_args[1]["distinct_id"]
                or call_args[1]["distinct_id"] == event.machine_id
            )
            assert call_args[1]["properties"]["command"] == "test"
            assert call_args[1]["properties"]["success"] is True

    def test_flush_when_disabled(self):
        """Test that flush does nothing when disabled."""
        client = TelemetryClient(enabled=False)
        # Should not raise any exceptions
        client.flush()

    def test_flush_when_enabled(self):
        """Test that flush calls PostHog flush."""
        with mock.patch("posthog.flush") as mock_flush:
            client = TelemetryClient(enabled=True)
            client.flush()
            mock_flush.assert_called_once()

    def test_shutdown(self):
        """Test that shutdown calls PostHog shutdown."""
        with mock.patch("posthog.shutdown") as mock_shutdown:
            client = TelemetryClient(enabled=True)
            client.shutdown()
            mock_shutdown.assert_called_once()

    def test_global_client_singleton(self):
        """Test that get_telemetry_client returns singleton."""
        # Clear global client
        import visivo.telemetry.client

        visivo.telemetry.client._global_client = None

        client1 = get_telemetry_client(enabled=False)
        client2 = get_telemetry_client(enabled=False)

        assert client1 is client2

    def test_error_handling(self):
        """Test that errors in PostHog are silently ignored."""
        with mock.patch("posthog.capture", side_effect=Exception("Test error")):
            client = TelemetryClient(enabled=True)
            event = CLIEvent.create("test", [], 100, True)

            # Should not raise exception
            client.track(event)

        with mock.patch("posthog.flush", side_effect=Exception("Test error")):
            # Should not raise exception
            client.flush()

        with mock.patch("posthog.shutdown", side_effect=Exception("Test error")):
            # Should not raise exception
            client.shutdown()

    def test_posthog_configuration(self):
        """Test that PostHog is configured correctly."""
        # Set test configuration
        os.environ["VISIVO_POSTHOG_API_KEY"] = "test_key"
        os.environ["VISIVO_POSTHOG_HOST"] = "https://test.posthog.com"

        # Reload modules to pick up new env vars
        import importlib
        import visivo.telemetry.config
        import visivo.telemetry.client

        importlib.reload(visivo.telemetry.config)
        importlib.reload(visivo.telemetry.client)

        # Import the reloaded TelemetryClient
        from visivo.telemetry.client import TelemetryClient

        # Create client
        client = TelemetryClient(enabled=True)

        # Check PostHog configuration
        assert posthog.project_api_key == "test_key"
        assert posthog.host == "https://test.posthog.com"

        # Clean up
        del os.environ["VISIVO_POSTHOG_API_KEY"]
        del os.environ["VISIVO_POSTHOG_HOST"]
        importlib.reload(visivo.telemetry.config)
        importlib.reload(visivo.telemetry.client)
