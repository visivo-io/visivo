"""
Tests for telemetry client.
"""

import os
import time
import threading
from unittest import mock
import urllib.request
import urllib.error

from visivo.telemetry.client import TelemetryClient, get_telemetry_client
from visivo.telemetry.events import CLIEvent


class TestTelemetryClient:
    """Test telemetry client functionality."""

    def setup_method(self):
        """Disable telemetry for all tests."""
        os.environ["VISIVO_TELEMETRY_DISABLED"] = "true"

    def test_client_disabled(self):
        """Test that disabled client doesn't start worker thread."""
        client = TelemetryClient(enabled=False)
        assert not client.enabled
        assert client._worker_thread is None

    def test_client_enabled(self):
        """Test that enabled client starts worker thread."""
        client = TelemetryClient(enabled=True)
        assert client.enabled
        assert client._worker_thread is not None
        assert client._worker_thread.is_alive()
        assert client._worker_thread.daemon

        # Clean up
        client.shutdown()

    def test_track_when_disabled(self):
        """Test that tracking does nothing when client is disabled."""
        client = TelemetryClient(enabled=False)
        event = CLIEvent.create("test", [], 100, True)

        # Should not raise any exceptions
        client.track(event)

        # Queue should remain empty
        assert client._event_queue.empty()

    def test_track_when_enabled(self):
        """Test that tracking adds events to queue when enabled."""
        client = TelemetryClient(enabled=True)
        event = CLIEvent.create("test", [], 100, True)

        client.track(event)

        # Event should be in queue
        assert not client._event_queue.empty()
        queued_event = client._event_queue.get_nowait()
        assert queued_event["event_type"] == "cli_command"

        # Clean up
        client.shutdown()

    @mock.patch("urllib.request.urlopen")
    def test_send_batch(self, mock_urlopen):
        """Test batch sending functionality."""
        client = TelemetryClient(enabled=True)

        # Create mock response
        mock_response = mock.MagicMock()
        mock_urlopen.return_value.__enter__.return_value = mock_response

        # Create test events
        events = [{"event_type": "test", "data": i} for i in range(3)]

        # Send batch
        client._send_batch(events)

        # Verify request was made
        mock_urlopen.assert_called_once()
        request = mock_urlopen.call_args[0][0]
        assert isinstance(request, urllib.request.Request)
        assert request.get_method() == "POST"
        assert request.get_header("Content-type") == "application/json"

        # Clean up
        client.shutdown()

    @mock.patch("urllib.request.urlopen")
    def test_send_batch_error_handling(self, mock_urlopen):
        """Test that send errors are silently ignored."""
        client = TelemetryClient(enabled=True)

        # Make urlopen raise an exception
        mock_urlopen.side_effect = urllib.error.URLError("Network error")

        # Should not raise exception
        client._send_batch([{"event_type": "test"}])

        # Clean up
        client.shutdown()

    def test_flush_when_disabled(self):
        """Test that flush does nothing when disabled."""
        client = TelemetryClient(enabled=False)
        # Should complete immediately without error
        client.flush(timeout=0.1)

    @mock.patch("urllib.request.urlopen")
    def test_flush_when_enabled(self, mock_urlopen):
        """Test that flush waits for queue to empty."""
        client = TelemetryClient(enabled=True)

        # Add an event
        event = CLIEvent.create("test", [], 100, True)
        client.track(event)

        # Flush should process the event
        client.flush(timeout=2.0)

        # Queue should be empty after flush
        assert client._event_queue.empty()

        # Clean up
        client.shutdown()

    def test_shutdown(self):
        """Test client shutdown."""
        client = TelemetryClient(enabled=True)
        assert client._worker_thread.is_alive()

        client.shutdown()

        # Worker thread should stop
        assert client._stop_event.is_set()
        # Give thread time to stop
        time.sleep(0.1)
        assert not client._worker_thread.is_alive()

    def test_global_client_singleton(self):
        """Test that get_telemetry_client returns singleton."""
        client1 = get_telemetry_client(enabled=False)
        client2 = get_telemetry_client(enabled=False)
        assert client1 is client2

        # Reset global client for other tests
        import visivo.telemetry.client

        visivo.telemetry.client._global_client = None

    @mock.patch("urllib.request.urlopen")
    def test_batching_by_size(self, mock_urlopen):
        """Test that client batches events by size (100 events)."""
        client = TelemetryClient(enabled=True)

        # Track 150 events (should trigger 1 batch of 100)
        for i in range(150):
            event = CLIEvent.create(f"test{i}", [], 100, True)
            client.track(event)

        # Give worker time to process
        time.sleep(0.5)

        # Should have made at least one call with 100 events
        assert mock_urlopen.call_count >= 1

        # Clean up
        client.shutdown()

    @mock.patch("urllib.request.urlopen")
    def test_no_blocking_on_full_queue(self, mock_urlopen):
        """Test that tracking doesn't block if queue is somehow full."""
        client = TelemetryClient(enabled=True)

        # Fill the queue (unlikely in practice)
        # This test ensures track() uses put_nowait
        event = CLIEvent.create("test", [], 100, True)

        # Track should complete quickly even with many events
        start_time = time.time()
        for _ in range(10000):
            client.track(event)
        elapsed = time.time() - start_time

        # Should complete quickly (less than 1 second)
        assert elapsed < 1.0

        # Clean up
        client.shutdown()
