"""
Integration tests for telemetry functionality.

DEPRECATED: These tests were for the old custom telemetry implementation.
See test_integration_posthog.py for the new PostHog-based integration tests.
"""

import os
import json
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from unittest import mock
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest
from visivo.telemetry import TelemetryClient, is_telemetry_enabled
from visivo.telemetry.config import TELEMETRY_ENDPOINT


class MockTelemetryServer:
    """Mock telemetry server for testing."""

    def __init__(self, port=0):
        self.events = []
        self.server = None
        self.thread = None
        self.port = port
        self._lock = threading.Lock()

    def start(self):
        """Start the mock server."""

        class Handler(BaseHTTPRequestHandler):
            def do_POST(handler):
                if handler.path == "/v1/events":
                    content_length = int(handler.headers["Content-Length"])
                    post_data = handler.rfile.read(content_length)

                    try:
                        data = json.loads(post_data)
                        with self._lock:
                            self.events.extend(data.get("events", []))

                        handler.send_response(200)
                        handler.send_header("Content-Type", "application/json")
                        handler.end_headers()
                        handler.wfile.write(b'{"status": "ok"}')
                    except Exception:
                        handler.send_response(400)
                        handler.end_headers()
                else:
                    handler.send_response(404)
                    handler.end_headers()

            def log_message(self, format, *args):
                # Suppress server logs during tests
                pass

        self.server = HTTPServer(("localhost", self.port), Handler)
        self.port = self.server.server_port  # Get actual port if 0 was specified

        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.daemon = True
        self.thread.start()

        # Give server time to start
        time.sleep(0.1)

        return f"http://localhost:{self.port}/v1/events"

    def stop(self):
        """Stop the mock server."""
        if self.server:
            self.server.shutdown()
        if self.thread:
            self.thread.join(timeout=2)

    def get_events(self):
        """Get all received events."""
        with self._lock:
            return self.events.copy()

    def clear_events(self):
        """Clear all events."""
        with self._lock:
            self.events.clear()


import pytest


@pytest.mark.skip(reason="Integration tests need to be rewritten for PostHog SDK")
class TestTelemetryIntegration:
    """Integration tests for telemetry."""

    @pytest.fixture
    def mock_server(self, monkeypatch):
        """Create and start a mock telemetry server."""
        server = MockTelemetryServer()
        endpoint = server.start()

        # Patch the telemetry endpoint at module level before it's imported
        monkeypatch.setenv("VISIVO_TELEMETRY_ENDPOINT", endpoint)

        # Also patch the already-imported constants
        import visivo.telemetry.config
        import visivo.telemetry.client

        monkeypatch.setattr(visivo.telemetry.config, "TELEMETRY_ENDPOINT", endpoint)
        monkeypatch.setattr(visivo.telemetry.client, "TELEMETRY_ENDPOINT", endpoint)

        yield server

        server.stop()

    def test_cli_command_telemetry(self, mock_server, tmp_path):
        """Test that CLI commands send telemetry events."""
        # Create a minimal project
        project_file = tmp_path / "project.visivo.yml"
        project_file.write_text(
            """
name: integration-test-project
defaults:
  source_name: test_source
sources:
  - name: test_source
    type: duckdb
    database: ":memory:"
models:
  - name: test_model
    sql: SELECT 1 as x, 2 as y
traces:
  - name: test_trace
    model: ref(test_model)
    props:
      type: scatter
    columns:
      x: x
      y: y
charts:
  - name: test_chart
    traces:
      - ref(test_trace)
"""
        )

        # Run visivo compile with telemetry enabled
        env = os.environ.copy()
        env.pop("VISIVO_TELEMETRY_DISABLED", None)  # Enable telemetry
        env["VISIVO_TELEMETRY_ENDPOINT"] = f"http://localhost:{mock_server.port}/v1/events"

        result = subprocess.run(
            [sys.executable, "-m", "visivo.command_line", "compile"],
            cwd=str(tmp_path),
            env=env,
            capture_output=True,
            text=True,
        )

        # Wait for events to be sent
        time.sleep(1)

        # Check that we received events
        events = mock_server.get_events()
        assert len(events) > 0

        # Find the CLI event
        cli_events = [e for e in events if e.get("event_type") == "cli_command"]
        assert len(cli_events) == 1

        event = cli_events[0]
        assert event["properties"]["command"] == "compile"

        # Check the result - if it failed, print the output
        if not event["properties"]["success"]:
            print(f"Command stdout: {result.stdout}")
            print(f"Command stderr: {result.stderr}")
            print(f"Error type: {event['properties'].get('error_type')}")

        assert event["properties"]["success"] is True
        assert "visivo_version" in event["properties"]
        assert "python_version" in event["properties"]
        assert "platform" in event["properties"]
        assert "object_counts" in event["properties"]

        # Check machine_id is present and valid
        assert "machine_id" in event
        import uuid

        # Machine ID might have "ci-" prefix in CI environments
        machine_id = event["machine_id"]
        if machine_id.startswith("ci-"):
            # Validate the UUID part after the prefix
            uuid.UUID(machine_id[3:])
        else:
            # Regular UUID
            uuid.UUID(machine_id)

        # Check object counts
        counts = event["properties"]["object_counts"]
        assert counts["models"] == 1
        assert counts["traces"] == 1
        assert counts["charts"] == 1

        # Check project hash is present
        assert "project_hash" in event["properties"]
        project_hash = event["properties"]["project_hash"]
        assert len(project_hash) == 16  # Should be 16 characters
        assert project_hash.isalnum()  # Should be alphanumeric

        # Verify it's consistent with the hash function
        from visivo.telemetry.config import hash_project_name

        expected_hash = hash_project_name("integration-test-project")
        assert project_hash == expected_hash

    def test_api_telemetry(self, mock_server):
        """Test that API events can be tracked."""
        # Test API event tracking directly without Flask complexity
        from visivo.telemetry import TelemetryClient
        from visivo.telemetry.events import APIEvent

        # Create a client with telemetry enabled
        client = TelemetryClient(enabled=True)

        # Track API events and check they are all sent
        # We'll track 100+ events to force a batch send
        for i in range(102):  # More than batch size of 100
            event = APIEvent.create(
                endpoint=f"/api/endpoint/{i}",
                method="GET" if i % 2 == 0 else "POST",
                status_code=200 + (i % 3),
                duration_ms=50 + i,
            )
            client.track(event)

        # Give time for batch to be sent
        time.sleep(2)

        # Force shutdown to send any remaining
        client.shutdown()
        time.sleep(1)

        # Check events
        events = mock_server.get_events()
        api_events = [e for e in events if e.get("event_type") == "api_request"]

        # Should have all 102 events (100 in first batch, 2 on shutdown)
        assert len(api_events) == 102

        # Verify first and last event have correct properties
        for event in [api_events[0], api_events[-1]]:
            assert "endpoint" in event["properties"]
            assert "method" in event["properties"]
            assert "status_code" in event["properties"]
            assert "duration_ms" in event["properties"]
            assert "visivo_version" in event["properties"]

            # Check machine_id is present and valid
            assert "machine_id" in event
            import uuid

            # Machine ID might have "ci-" prefix in CI environments
            machine_id = event["machine_id"]
            if machine_id.startswith("ci-"):
                # Validate the UUID part after the prefix
                uuid.UUID(machine_id[3:])
            else:
                # Regular UUID
                uuid.UUID(machine_id)

    def test_telemetry_disabled_by_env(self, mock_server, tmp_path):
        """Test that telemetry is disabled when env var is set."""
        # Create a minimal project
        project_file = tmp_path / "project.visivo.yml"
        project_file.write_text("name: test-project")

        # Run with telemetry disabled
        env = os.environ.copy()
        env["VISIVO_TELEMETRY_DISABLED"] = "true"

        result = subprocess.run(
            [sys.executable, "-m", "visivo.command_line", "compile"],
            cwd=str(tmp_path),
            env=env,
            capture_output=True,
            text=True,
        )

        # Wait a bit
        time.sleep(1)

        # Should receive no events
        events = mock_server.get_events()
        assert len(events) == 0

    def test_telemetry_disabled_by_global_config(self, mock_server, tmp_path):
        """Test that telemetry is disabled by global config."""
        # Create global config with telemetry disabled
        config_dir = tmp_path / ".visivo"
        config_dir.mkdir()
        config_file = config_dir / "config.yml"
        config_file.write_text("telemetry_enabled: false\n")

        # Create a minimal project
        project_file = tmp_path / "project" / "project.visivo.yml"
        project_file.parent.mkdir()
        project_file.write_text(
            """
name: test-project
defaults:
  source_name: test_source
sources:
  - name: test_source
    type: duckdb
    database: ":memory:"
"""
        )

        # Run with telemetry enabled in env but disabled in global config
        env = os.environ.copy()
        env.pop("VISIVO_TELEMETRY_DISABLED", None)
        env["VISIVO_TELEMETRY_ENDPOINT"] = f"http://localhost:{mock_server.port}/v1/events"
        env["HOME"] = str(tmp_path)  # Set HOME to use our test config

        result = subprocess.run(
            [sys.executable, "-m", "visivo.command_line", "compile"],
            cwd=str(project_file.parent),
            env=env,
            capture_output=True,
            text=True,
        )

        # Wait a bit
        time.sleep(1)

        # Should receive no events
        events = mock_server.get_events()
        # Filter out any sentinel values
        real_events = [e for e in events if not e.get("_sentinel")]
        assert len(real_events) == 0

    def test_command_args_sanitization(self, mock_server, tmp_path):
        """Test that command arguments are properly sanitized."""
        project_file = tmp_path / "project.visivo.yml"
        project_file.write_text(
            """
name: test-project
defaults:
  source_name: test_source
sources:
  - name: test_source
    type: duckdb
    database: ":memory:"
"""
        )

        # Run with various arguments
        env = os.environ.copy()
        env.pop("VISIVO_TELEMETRY_DISABLED", None)
        env["VISIVO_TELEMETRY_ENDPOINT"] = f"http://localhost:{mock_server.port}/v1/events"

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "visivo.command_line",
                "run",
                "--dag-filter",
                "+chart1+",
                "--threads",
                "4",
                "--output-dir",
                str(tmp_path / "output"),
                "--token",
                "secret-token-value",
            ],
            cwd=str(tmp_path),
            env=env,
            capture_output=True,
            text=True,
        )

        # Wait for events
        time.sleep(1)

        events = mock_server.get_events()
        cli_events = [e for e in events if e.get("event_type") == "cli_command"]

        assert len(cli_events) > 0
        event = cli_events[0]

        # Check sanitized args
        args = event["properties"]["command_args"]
        assert args == [
            "--dag-filter",
            "<value>",
            "--threads",
            "<value>",
            "--output-dir",
            "<path>",
            "--token",
            "<redacted>",
        ]

    def test_batch_sending(self, mock_server):
        """Test that events are batched properly."""
        # Create a client with custom batching
        with mock.patch("visivo.telemetry.config.is_telemetry_enabled", return_value=True):
            from visivo.telemetry.client import TelemetryClient
            from visivo.telemetry.events import CLIEvent

            client = TelemetryClient(enabled=True)

            # Send many events quickly
            for i in range(150):
                event = CLIEvent.create(
                    command=f"test{i}", command_args=[], duration_ms=100, success=True
                )
                client.track(event)

            # Wait for batch to be sent
            time.sleep(1)

            # Should have received at least 100 events (first batch)
            events = mock_server.get_events()
            assert len(events) >= 100

            # Clean up
            client.shutdown()


class TestTelemetryRealEndpoint:
    """Test telemetry with real endpoint (only run manually)."""

    @pytest.mark.skip(reason="Only run manually to test real endpoint")
    def test_real_endpoint_connectivity(self):
        """Test that we can connect to the real telemetry endpoint."""
        from visivo.telemetry.client import TelemetryClient
        from visivo.telemetry.events import CLIEvent

        # This test requires the real endpoint to be available
        client = TelemetryClient(enabled=True)

        event = CLIEvent.create(
            command="test", command_args=["--test"], duration_ms=100, success=True
        )

        client.track(event)
        client.flush(timeout=5)
        client.shutdown()

        # If this completes without error, the endpoint is reachable


# Utility function for manual testing
def capture_telemetry_locally(port=8888):
    """
    Run a local telemetry server to capture events.
    Useful for manual testing and debugging.

    Usage:
        python -m tests.telemetry.test_integration
    """
    print(f"Starting telemetry capture server on port {port}...")
    print(f"Set VISIVO_TELEMETRY_ENDPOINT=http://localhost:{port}/v1/events")
    print("Press Ctrl+C to stop\n")

    server = MockTelemetryServer(port=port)
    endpoint = server.start()

    print(f"Server running at: {endpoint}")
    print("Waiting for events...\n")

    try:
        while True:
            time.sleep(1)
            events = server.get_events()
            if events:
                print(f"\n{'='*60}")
                print(f"Received {len(events)} events:")
                for event in events:
                    print(json.dumps(event, indent=2))
                print(f"{'='*60}\n")
                server.clear_events()
    except KeyboardInterrupt:
        print("\nStopping server...")
        server.stop()


if __name__ == "__main__":
    # Run local capture server for manual testing
    capture_telemetry_locally()
