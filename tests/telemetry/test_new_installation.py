"""
Test the new installation event functionality.
"""

import os
import tempfile
import shutil
from unittest import TestCase
from unittest.mock import patch, MagicMock
from pathlib import Path

from visivo.telemetry.config import get_machine_id
from visivo.telemetry.events import NewInstallationEvent


class TestNewInstallationEvent(TestCase):
    """Test the new installation event that fires when machine ID is created."""

    def setUp(self):
        """Set up test environment."""
        # Create a temporary home directory for testing
        self.temp_home = tempfile.mkdtemp()
        self.original_home = os.environ.get("HOME")
        os.environ["HOME"] = self.temp_home

        # Ensure telemetry is enabled for tests
        os.environ.pop("VISIVO_TELEMETRY_DISABLED", None)

    def tearDown(self):
        """Clean up test environment."""
        # Restore original home
        if self.original_home:
            os.environ["HOME"] = self.original_home
        else:
            os.environ.pop("HOME", None)

        # Clean up temp directory
        shutil.rmtree(self.temp_home, ignore_errors=True)

        # Re-disable telemetry for other tests
        os.environ["VISIVO_TELEMETRY_DISABLED"] = "true"

    @patch("visivo.telemetry.config.is_ci_environment")
    @patch("visivo.telemetry.client.get_telemetry_client")
    def test_new_installation_event_fires_on_first_machine_id(self, mock_get_client, mock_is_ci):
        """Test that NewInstallationEvent fires when creating a new machine ID."""
        # Setup mocks
        mock_is_ci.return_value = False
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        # Ensure no existing machine ID
        visivo_dir = Path(self.temp_home) / ".visivo"
        machine_id_path = visivo_dir / "machine_id"
        self.assertFalse(machine_id_path.exists())

        # Get machine ID for the first time - should trigger event
        machine_id = get_machine_id()

        # Verify machine ID was created
        self.assertTrue(machine_id_path.exists())
        self.assertTrue(len(machine_id) > 0)

        # Verify NewInstallationEvent was sent
        mock_client.track.assert_called_once()
        event = mock_client.track.call_args[0][0]
        self.assertIsInstance(event, NewInstallationEvent)
        self.assertEqual(event.event_type, "new_installation")
        self.assertEqual(event.machine_id, machine_id)

    @patch("visivo.telemetry.config.is_ci_environment")
    @patch("visivo.telemetry.client.get_telemetry_client")
    def test_no_event_on_existing_machine_id(self, mock_get_client, mock_is_ci):
        """Test that no event fires when machine ID already exists."""
        # Setup mocks
        mock_is_ci.return_value = False
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        # Create existing machine ID
        visivo_dir = Path(self.temp_home) / ".visivo"
        visivo_dir.mkdir(exist_ok=True)
        machine_id_path = visivo_dir / "machine_id"
        existing_id = "12345678-1234-5678-1234-567812345678"  # Valid UUID format
        machine_id_path.write_text(existing_id)

        # Get machine ID - should not trigger event
        machine_id = get_machine_id()

        # Verify existing ID was returned
        self.assertEqual(machine_id, existing_id)

        # Verify no event was sent
        mock_client.track.assert_not_called()

    @patch("visivo.telemetry.config.is_ci_environment")
    @patch("visivo.telemetry.client.get_telemetry_client")
    def test_no_event_in_ci_environment(self, mock_get_client, mock_is_ci):
        """Test that no installation event fires in CI environments."""
        # Setup mocks
        mock_is_ci.return_value = True
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        # Get machine ID in CI - should not trigger event
        machine_id = get_machine_id()

        # Verify CI machine ID format
        self.assertTrue(machine_id.startswith("ci-"))

        # Verify no event was sent
        mock_client.track.assert_not_called()

    def test_new_installation_event_properties(self):
        """Test that NewInstallationEvent has correct properties."""
        test_machine_id = "test-machine-123"
        event = NewInstallationEvent.create(test_machine_id)

        # Check event structure
        self.assertEqual(event.event_type, "new_installation")
        self.assertEqual(event.machine_id, test_machine_id)
        self.assertIsNotNone(event.timestamp)
        self.assertIsNotNone(event.session_id)

        # Check properties
        self.assertIn("visivo_version", event.properties)
        self.assertIn("python_version", event.properties)
        self.assertIn("platform", event.properties)
        self.assertIn("platform_version", event.properties)
        self.assertIn("architecture", event.properties)
        self.assertIn("is_ci", event.properties)
