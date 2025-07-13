"""
Tests for machine ID functionality.
"""

import uuid
from pathlib import Path
import pytest
from visivo.telemetry.machine_id import get_machine_id


class TestMachineId:
    """Test machine ID generation and persistence."""

    def test_machine_id_generation(self, tmp_path, monkeypatch):
        """Test that machine ID is generated and stored correctly."""
        # Use temporary home directory
        monkeypatch.setattr(Path, "home", lambda: tmp_path)
        # Clear ALL CI environment variables
        all_ci_vars = [
            "CI",
            "CONTINUOUS_INTEGRATION",
            "GITHUB_ACTIONS",
            "GITLAB_CI",
            "CIRCLECI",
            "JENKINS_HOME",
            "JENKINS_URL",
            "TEAMCITY_VERSION",
            "TRAVIS",
            "BUILDKITE",
            "DRONE",
            "BITBUCKET_BUILD_NUMBER",
            "SEMAPHORE",
            "APPVEYOR",
            "WERCKER",
            "MAGNUM",
            "MINT",
            "CODEBUILD_BUILD_ID",
            "TF_BUILD",
            "SYSTEM_TEAMFOUNDATIONCOLLECTIONURI",
            "KUBERNETES_SERVICE_HOST",
        ]
        for var in all_ci_vars:
            monkeypatch.delenv(var, raising=False)

        # Mock os.path.exists to return False for /.dockerenv
        import os

        monkeypatch.setattr(
            os.path, "exists", lambda path: False if path == "/.dockerenv" else os.path.exists(path)
        )

        # Get machine ID
        machine_id1 = get_machine_id()

        # Verify it's a valid UUID
        uuid.UUID(machine_id1)

        # Verify file was created
        machine_id_path = tmp_path / ".visivo" / "machine_id"
        assert machine_id_path.exists()

        # Verify file contains the ID
        with open(machine_id_path, "r") as f:
            stored_id = f.read().strip()
        assert stored_id == machine_id1

    def test_machine_id_persistence(self, tmp_path, monkeypatch):
        """Test that machine ID persists across calls."""
        # Use temporary home directory
        monkeypatch.setattr(Path, "home", lambda: tmp_path)
        # Clear ALL CI environment variables
        all_ci_vars = [
            "CI",
            "CONTINUOUS_INTEGRATION",
            "GITHUB_ACTIONS",
            "GITLAB_CI",
            "CIRCLECI",
            "JENKINS_HOME",
            "JENKINS_URL",
            "TEAMCITY_VERSION",
            "TRAVIS",
            "BUILDKITE",
            "DRONE",
            "BITBUCKET_BUILD_NUMBER",
            "SEMAPHORE",
            "APPVEYOR",
            "WERCKER",
            "MAGNUM",
            "MINT",
            "CODEBUILD_BUILD_ID",
            "TF_BUILD",
            "SYSTEM_TEAMFOUNDATIONCOLLECTIONURI",
            "KUBERNETES_SERVICE_HOST",
        ]
        for var in all_ci_vars:
            monkeypatch.delenv(var, raising=False)

        # Mock os.path.exists to return False for /.dockerenv
        import os

        monkeypatch.setattr(
            os.path, "exists", lambda path: False if path == "/.dockerenv" else os.path.exists(path)
        )

        # Get machine ID twice
        machine_id1 = get_machine_id()
        machine_id2 = get_machine_id()

        # Should be the same
        assert machine_id1 == machine_id2

    def test_machine_id_corrupted_file(self, tmp_path, monkeypatch):
        """Test that corrupted machine ID file is regenerated."""
        # Use temporary home directory
        monkeypatch.setattr(Path, "home", lambda: tmp_path)
        # Clear ALL CI environment variables
        all_ci_vars = [
            "CI",
            "CONTINUOUS_INTEGRATION",
            "GITHUB_ACTIONS",
            "GITLAB_CI",
            "CIRCLECI",
            "JENKINS_HOME",
            "JENKINS_URL",
            "TEAMCITY_VERSION",
            "TRAVIS",
            "BUILDKITE",
            "DRONE",
            "BITBUCKET_BUILD_NUMBER",
            "SEMAPHORE",
            "APPVEYOR",
            "WERCKER",
            "MAGNUM",
            "MINT",
            "CODEBUILD_BUILD_ID",
            "TF_BUILD",
            "SYSTEM_TEAMFOUNDATIONCOLLECTIONURI",
            "KUBERNETES_SERVICE_HOST",
        ]
        for var in all_ci_vars:
            monkeypatch.delenv(var, raising=False)

        # Mock os.path.exists to return False for /.dockerenv
        import os

        monkeypatch.setattr(
            os.path, "exists", lambda path: False if path == "/.dockerenv" else os.path.exists(path)
        )

        # Create corrupted file
        visivo_dir = tmp_path / ".visivo"
        visivo_dir.mkdir()
        machine_id_path = visivo_dir / "machine_id"
        machine_id_path.write_text("not-a-valid-uuid")

        # Get machine ID - should regenerate
        machine_id = get_machine_id()

        # Verify it's a valid UUID
        if machine_id.startswith("ci-"):
            # CI environment - validate UUID part
            uuid.UUID(machine_id[3:])
        else:
            # Regular environment
            uuid.UUID(machine_id)

        # Verify file was updated
        with open(machine_id_path, "r") as f:
            stored_id = f.read().strip()
        assert stored_id == machine_id
        assert stored_id != "not-a-valid-uuid"

    def test_machine_id_read_only_directory(self, tmp_path, monkeypatch):
        """Test behavior when directory is read-only."""
        # Use temporary home directory
        monkeypatch.setattr(Path, "home", lambda: tmp_path)
        # Clear ALL CI environment variables
        all_ci_vars = [
            "CI",
            "CONTINUOUS_INTEGRATION",
            "GITHUB_ACTIONS",
            "GITLAB_CI",
            "CIRCLECI",
            "JENKINS_HOME",
            "JENKINS_URL",
            "TEAMCITY_VERSION",
            "TRAVIS",
            "BUILDKITE",
            "DRONE",
            "BITBUCKET_BUILD_NUMBER",
            "SEMAPHORE",
            "APPVEYOR",
            "WERCKER",
            "MAGNUM",
            "MINT",
            "CODEBUILD_BUILD_ID",
            "TF_BUILD",
            "SYSTEM_TEAMFOUNDATIONCOLLECTIONURI",
            "KUBERNETES_SERVICE_HOST",
        ]
        for var in all_ci_vars:
            monkeypatch.delenv(var, raising=False)

        # Mock os.path.exists to return False for /.dockerenv
        import os

        monkeypatch.setattr(
            os.path, "exists", lambda path: False if path == "/.dockerenv" else os.path.exists(path)
        )

        # Make directory read-only
        tmp_path.chmod(0o555)

        try:
            # Should still return a machine ID (just not persisted)
            machine_id = get_machine_id()
            # Verify it's valid
            if machine_id.startswith("ci-"):
                # CI environment - validate UUID part
                uuid.UUID(machine_id[3:])
            else:
                # Regular environment
                uuid.UUID(machine_id)

            # File should not exist
            machine_id_path = tmp_path / ".visivo" / "machine_id"
            assert not machine_id_path.exists()
        finally:
            # Restore permissions
            tmp_path.chmod(0o755)

    def test_events_include_machine_id(self, tmp_path, monkeypatch):
        """Test that events include the machine ID."""
        # Use temporary home directory
        monkeypatch.setattr(Path, "home", lambda: tmp_path)
        # Clear ALL CI environment variables
        all_ci_vars = [
            "CI",
            "CONTINUOUS_INTEGRATION",
            "GITHUB_ACTIONS",
            "GITLAB_CI",
            "CIRCLECI",
            "JENKINS_HOME",
            "JENKINS_URL",
            "TEAMCITY_VERSION",
            "TRAVIS",
            "BUILDKITE",
            "DRONE",
            "BITBUCKET_BUILD_NUMBER",
            "SEMAPHORE",
            "APPVEYOR",
            "WERCKER",
            "MAGNUM",
            "MINT",
            "CODEBUILD_BUILD_ID",
            "TF_BUILD",
            "SYSTEM_TEAMFOUNDATIONCOLLECTIONURI",
            "KUBERNETES_SERVICE_HOST",
        ]
        for var in all_ci_vars:
            monkeypatch.delenv(var, raising=False)

        # Mock os.path.exists to return False for /.dockerenv
        import os

        monkeypatch.setattr(
            os.path, "exists", lambda path: False if path == "/.dockerenv" else os.path.exists(path)
        )

        # Clear cached machine ID
        import visivo.telemetry.events

        visivo.telemetry.events.MACHINE_ID = None

        # Create events
        from visivo.telemetry.events import CLIEvent, APIEvent

        cli_event = CLIEvent.create(command="test", command_args=[], duration_ms=100, success=True)

        api_event = APIEvent.create(endpoint="/test", method="GET", status_code=200, duration_ms=50)

        # Both should have the same machine ID
        assert cli_event.machine_id == api_event.machine_id

        # Machine ID should be a valid UUID (no ci- prefix for regular IDs)
        # Handle potential CI prefix
        machine_id = cli_event.machine_id
        if machine_id.startswith("ci-"):
            # Validate the UUID part after the prefix
            uuid.UUID(machine_id[3:])
        else:
            # Regular UUID
            uuid.UUID(machine_id)

        # Should match what get_machine_id returns
        assert cli_event.machine_id == get_machine_id()
