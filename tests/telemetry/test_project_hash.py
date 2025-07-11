"""
Tests for project name hashing functionality.
"""

import pytest
from visivo.telemetry.config import hash_project_name
from visivo.telemetry.events import CLIEvent, APIEvent


class TestProjectHash:
    """Test project name hashing."""

    def test_hash_project_name(self):
        """Test basic project name hashing."""
        # Test normal project name
        hash1 = hash_project_name("my-project")
        assert hash1 is not None
        assert len(hash1) == 16  # We take first 16 chars
        assert hash1.isalnum()  # Should be alphanumeric hex

    def test_hash_consistency(self):
        """Test that same project name produces same hash."""
        project_name = "test-project"
        hash1 = hash_project_name(project_name)
        hash2 = hash_project_name(project_name)
        assert hash1 == hash2

    def test_hash_uniqueness(self):
        """Test that different project names produce different hashes."""
        hash1 = hash_project_name("project-1")
        hash2 = hash_project_name("project-2")
        assert hash1 != hash2

    def test_hash_none_project(self):
        """Test that None project name returns None."""
        assert hash_project_name(None) is None

    def test_hash_empty_project(self):
        """Test that empty project name returns None."""
        assert hash_project_name("") is None

    def test_cli_event_with_project_hash(self):
        """Test that CLI events can include project hash."""
        event = CLIEvent.create(
            command="compile",
            command_args=[],
            duration_ms=100,
            success=True,
            project_hash="abc123def456",
        )

        event_dict = event.to_dict()
        assert event_dict["properties"]["project_hash"] == "abc123def456"

    def test_cli_event_without_project_hash(self):
        """Test that CLI events work without project hash."""
        event = CLIEvent.create(command="compile", command_args=[], duration_ms=100, success=True)

        event_dict = event.to_dict()
        assert "project_hash" not in event_dict["properties"]

    def test_api_event_with_project_hash(self):
        """Test that API events can include project hash."""
        event = APIEvent.create(
            endpoint="/api/test",
            method="GET",
            status_code=200,
            duration_ms=50,
            project_hash="xyz789abc123",
        )

        event_dict = event.to_dict()
        assert event_dict["properties"]["project_hash"] == "xyz789abc123"

    def test_api_event_without_project_hash(self):
        """Test that API events work without project hash."""
        event = APIEvent.create(endpoint="/api/test", method="GET", status_code=200, duration_ms=50)

        event_dict = event.to_dict()
        assert "project_hash" not in event_dict["properties"]

    def test_project_hash_privacy(self):
        """Test that project hash doesn't reveal original name."""
        # Even with knowledge of the hash, you can't reverse it
        project_name = "super-secret-project"
        hash_value = hash_project_name(project_name)

        # Hash should not contain any part of the original name
        assert project_name not in hash_value
        assert "secret" not in hash_value
        assert "project" not in hash_value

    def test_project_hash_length(self):
        """Test that hash length is consistent regardless of input length."""
        short_name = "a"
        long_name = "a" * 100

        hash1 = hash_project_name(short_name)
        hash2 = hash_project_name(long_name)

        assert len(hash1) == 16
        assert len(hash2) == 16
