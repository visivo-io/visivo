"""
Tests for CI/CD environment detection.
"""

import os
import uuid
from pathlib import Path
import pytest
from visivo.telemetry.config import is_ci_environment, get_machine_id


class TestCIDetection:
    """Test CI/CD environment detection."""

    def test_ci_detection_with_ci_var(self, monkeypatch):
        """Test detection with generic CI variable."""
        monkeypatch.setenv("CI", "true")
        assert is_ci_environment() is True

    def test_ci_detection_with_github_actions(self, monkeypatch):
        """Test detection with GitHub Actions."""
        monkeypatch.setenv("GITHUB_ACTIONS", "true")
        assert is_ci_environment() is True

    def test_ci_detection_with_gitlab_ci(self, monkeypatch):
        """Test detection with GitLab CI."""
        monkeypatch.setenv("GITLAB_CI", "true")
        assert is_ci_environment() is True

    def test_ci_detection_with_circleci(self, monkeypatch):
        """Test detection with CircleCI."""
        monkeypatch.setenv("CIRCLECI", "true")
        assert is_ci_environment() is True

    def test_ci_detection_with_jenkins(self, monkeypatch):
        """Test detection with Jenkins."""
        monkeypatch.setenv("JENKINS_HOME", "/var/jenkins")
        assert is_ci_environment() is True

    def test_ci_detection_with_mint(self, monkeypatch):
        """Test detection with Mint (rwx)."""
        monkeypatch.setenv("MINT", "true")
        assert is_ci_environment() is True

    def test_ci_detection_with_docker(self, monkeypatch, tmp_path):
        """Test detection in Docker container."""
        # Create fake /.dockerenv file
        dockerenv = tmp_path / ".dockerenv"
        dockerenv.touch()

        # Mock os.path.exists to check our fake file
        original_exists = os.path.exists

        def mock_exists(path):
            if path == "/.dockerenv":
                return dockerenv.exists()
            return original_exists(path)

        monkeypatch.setattr(os.path, "exists", mock_exists)
        assert is_ci_environment() is True

    def test_ci_detection_with_kubernetes(self, monkeypatch):
        """Test detection in Kubernetes."""
        monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "10.0.0.1")
        assert is_ci_environment() is True

    def test_not_ci_environment(self, monkeypatch):
        """Test detection when not in CI."""
        # Clear all CI environment variables
        ci_vars = [
            "CI",
            "GITHUB_ACTIONS",
            "GITLAB_CI",
            "CIRCLECI",
            "JENKINS_HOME",
            "MINT",
            "KUBERNETES_SERVICE_HOST",
        ]
        for var in ci_vars:
            monkeypatch.delenv(var, raising=False)

        assert is_ci_environment() is False


class TestCIMachineId:
    """Test machine ID behavior in CI environments."""

    def test_ci_machine_id_format(self, monkeypatch):
        """Test that CI machine IDs have special format."""
        monkeypatch.setenv("CI", "true")

        machine_id = get_machine_id()

        # Should start with "ci-" prefix
        assert machine_id.startswith("ci-")

        # Rest should be valid UUID
        uuid_part = machine_id[3:]  # Skip "ci-" prefix
        uuid.UUID(uuid_part)

    def test_ci_machine_id_not_persistent(self, monkeypatch, tmp_path):
        """Test that CI machine IDs are not persistent."""
        monkeypatch.setenv("CI", "true")
        monkeypatch.setattr(Path, "home", lambda: tmp_path)

        # Get machine ID twice
        machine_id1 = get_machine_id()
        machine_id2 = get_machine_id()

        # Should be different each time
        assert machine_id1 != machine_id2

        # No file should be created
        machine_id_path = tmp_path / ".visivo" / "machine_id"
        assert not machine_id_path.exists()

    def test_regular_machine_id_format(self, monkeypatch, tmp_path):
        """Test that regular machine IDs don't have prefix."""
        # Clear CI environment
        monkeypatch.delenv("CI", raising=False)
        monkeypatch.setattr(Path, "home", lambda: tmp_path)

        machine_id = get_machine_id()

        # Should NOT start with "ci-" prefix
        assert not machine_id.startswith("ci-")

        # Should be valid UUID
        uuid.UUID(machine_id)

    def test_regular_machine_id_persistent(self, monkeypatch, tmp_path):
        """Test that regular machine IDs are persistent."""
        # Clear CI environment
        monkeypatch.delenv("CI", raising=False)
        monkeypatch.setattr(Path, "home", lambda: tmp_path)

        # Get machine ID twice
        machine_id1 = get_machine_id()
        machine_id2 = get_machine_id()

        # Should be the same
        assert machine_id1 == machine_id2

        # File should be created
        machine_id_path = tmp_path / ".visivo" / "machine_id"
        assert machine_id_path.exists()

    def test_events_include_ci_flag(self, monkeypatch):
        """Test that events include the is_ci flag."""
        from visivo.telemetry.events import CLIEvent, APIEvent

        # Test with CI environment
        monkeypatch.setenv("CI", "true")

        cli_event = CLIEvent.create(command="test", command_args=[], duration_ms=100, success=True)

        api_event = APIEvent.create(endpoint="/test", method="GET", status_code=200, duration_ms=50)

        # Both should have is_ci = True
        assert cli_event.to_dict()["properties"]["is_ci"] is True
        assert api_event.to_dict()["properties"]["is_ci"] is True

        # Test without CI environment
        monkeypatch.delenv("CI", raising=False)

        cli_event2 = CLIEvent.create(command="test", command_args=[], duration_ms=100, success=True)

        # Should have is_ci = False
        assert cli_event2.to_dict()["properties"]["is_ci"] is False
