"""
Tests for telemetry configuration and opt-out logic.
"""

import os
import tempfile
from pathlib import Path
from unittest import mock
import pytest
import yaml

from visivo.telemetry.config import (
    is_telemetry_enabled,
    telemetry_decision,
    _check_env_disabled,
    _check_global_config_disabled,
)
from visivo.models.defaults import Defaults


class TestTelemetryConfig:
    """Test telemetry configuration."""

    def test_telemetry_disabled_by_default_in_tests(self):
        """Ensure telemetry is disabled by default in test environment."""
        # Set the environment variable for tests
        with mock.patch.dict(os.environ, {"VISIVO_TELEMETRY_DISABLED": "true"}):
            assert not is_telemetry_enabled()

    def test_env_var_disabled_true(self):
        """Test that VISIVO_TELEMETRY_DISABLED=true disables telemetry."""
        with mock.patch.dict(os.environ, {"VISIVO_TELEMETRY_DISABLED": "true"}):
            assert _check_env_disabled() is True
            assert not is_telemetry_enabled()

    def test_env_var_disabled_1(self):
        """Test that VISIVO_TELEMETRY_DISABLED=1 disables telemetry."""
        with mock.patch.dict(os.environ, {"VISIVO_TELEMETRY_DISABLED": "1"}):
            assert _check_env_disabled() is True
            assert not is_telemetry_enabled()

    def test_env_var_disabled_yes(self):
        """Test that VISIVO_TELEMETRY_DISABLED=yes disables telemetry."""
        with mock.patch.dict(os.environ, {"VISIVO_TELEMETRY_DISABLED": "yes"}):
            assert _check_env_disabled() is True
            assert not is_telemetry_enabled()

    def test_env_var_disabled_false(self):
        """Test that VISIVO_TELEMETRY_DISABLED=false does not disable telemetry."""
        with mock.patch.dict(os.environ, {"VISIVO_TELEMETRY_DISABLED": "false"}, clear=True):
            assert _check_env_disabled() is False

    def test_env_var_not_set(self):
        """Test that telemetry is enabled when env var is not set."""
        with mock.patch.dict(os.environ, {}, clear=True):
            assert _check_env_disabled() is False

    def test_project_defaults_disabled(self):
        """Test that project defaults can disable telemetry."""
        defaults = Defaults(telemetry_enabled=False)
        with mock.patch.dict(os.environ, {}, clear=True):
            assert not is_telemetry_enabled(project_defaults=defaults)

    def test_project_defaults_enabled(self):
        """Test that project defaults can explicitly enable telemetry."""
        defaults = Defaults(telemetry_enabled=True)
        with mock.patch.dict(os.environ, {}, clear=True):
            assert is_telemetry_enabled(project_defaults=defaults)

    def test_project_defaults_none(self):
        """Test that None telemetry_enabled in defaults doesn't affect telemetry."""
        defaults = Defaults(telemetry_enabled=None)
        with mock.patch.dict(os.environ, {}, clear=True):
            assert is_telemetry_enabled(project_defaults=defaults)

    def test_global_config_disabled(self):
        """Test that global config file can disable telemetry."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create a temporary config file
            config_dir = Path(tmpdir) / ".visivo"
            config_dir.mkdir()
            config_file = config_dir / "config.yml"

            with open(config_file, "w") as f:
                yaml.dump({"telemetry_enabled": False}, f)

            # Mock Path.home() to return our temp directory
            with mock.patch("pathlib.Path.home", return_value=Path(tmpdir)):
                assert _check_global_config_disabled() is True

    def test_global_config_enabled(self):
        """Test that global config file can explicitly enable telemetry."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_dir = Path(tmpdir) / ".visivo"
            config_dir.mkdir()
            config_file = config_dir / "config.yml"

            with open(config_file, "w") as f:
                yaml.dump({"telemetry_enabled": True}, f)

            with mock.patch("pathlib.Path.home", return_value=Path(tmpdir)):
                assert _check_global_config_disabled() is False

    def test_global_config_missing(self):
        """Test that missing global config file doesn't disable telemetry."""
        with tempfile.TemporaryDirectory() as tmpdir:
            with mock.patch("pathlib.Path.home", return_value=Path(tmpdir)):
                assert _check_global_config_disabled() is False

    def test_global_config_invalid_yaml(self):
        """Test that invalid YAML in global config doesn't crash."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_dir = Path(tmpdir) / ".visivo"
            config_dir.mkdir()
            config_file = config_dir / "config.yml"

            with open(config_file, "w") as f:
                f.write("invalid: yaml: content:")  # Invalid YAML

            with mock.patch("pathlib.Path.home", return_value=Path(tmpdir)):
                # Should default to enabled when config is invalid
                assert _check_global_config_disabled() is False

    def test_precedence_env_over_project(self):
        """Test that environment variable takes precedence over project config."""
        defaults = Defaults(telemetry_enabled=True)
        with mock.patch.dict(os.environ, {"VISIVO_TELEMETRY_DISABLED": "true"}):
            assert not is_telemetry_enabled(project_defaults=defaults)

    def test_precedence_env_over_global(self):
        """Test that environment variable takes precedence over global config."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_dir = Path(tmpdir) / ".visivo"
            config_dir.mkdir()
            config_file = config_dir / "config.yml"

            with open(config_file, "w") as f:
                yaml.dump({"telemetry_enabled": True}, f)

            with mock.patch("pathlib.Path.home", return_value=Path(tmpdir)):
                with mock.patch.dict(os.environ, {"VISIVO_TELEMETRY_DISABLED": "true"}):
                    assert not is_telemetry_enabled()

    def test_precedence_project_over_global(self):
        """Test that project config takes precedence over global config."""
        defaults = Defaults(telemetry_enabled=False)

        with tempfile.TemporaryDirectory() as tmpdir:
            config_dir = Path(tmpdir) / ".visivo"
            config_dir.mkdir()
            config_file = config_dir / "config.yml"

            with open(config_file, "w") as f:
                yaml.dump({"telemetry_enabled": True}, f)

            with mock.patch("pathlib.Path.home", return_value=Path(tmpdir)):
                with mock.patch.dict(os.environ, {}, clear=True):
                    assert not is_telemetry_enabled(project_defaults=defaults)


class TestTelemetryForce:
    """``VISIVO_TELEMETRY_FORCE`` is the escape hatch for an opted-out machine."""

    def _home_with(self, tmpdir, enabled):
        config_dir = Path(tmpdir) / ".visivo"
        config_dir.mkdir()
        with open(config_dir / "config.yml", "w") as f:
            yaml.dump({"telemetry_enabled": enabled}, f)

    def test_force_overrides_machine_opt_out(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._home_with(tmpdir, False)
            with mock.patch("pathlib.Path.home", return_value=Path(tmpdir)):
                with mock.patch.dict(os.environ, {"VISIVO_TELEMETRY_FORCE": "true"}, clear=True):
                    assert is_telemetry_enabled()
                    assert telemetry_decision() == (True, "VISIVO_TELEMETRY_FORCE is set")

    def test_force_overrides_project_and_env_opt_out(self):
        defaults = Defaults(telemetry_enabled=False)
        env = {"VISIVO_TELEMETRY_FORCE": "1", "VISIVO_TELEMETRY_DISABLED": "true"}
        with mock.patch.dict(os.environ, env, clear=True):
            assert is_telemetry_enabled(project_defaults=defaults)

    def test_force_false_is_not_a_force(self):
        with mock.patch.dict(
            os.environ, {"VISIVO_TELEMETRY_FORCE": "false", "VISIVO_TELEMETRY_DISABLED": "true"}
        ):
            assert not is_telemetry_enabled()

    def test_decision_reasons(self):
        defaults = Defaults(telemetry_enabled=False)
        with mock.patch.dict(os.environ, {"VISIVO_TELEMETRY_DISABLED": "true"}):
            assert telemetry_decision()[1] == "VISIVO_TELEMETRY_DISABLED is set"
        with tempfile.TemporaryDirectory() as tmpdir:
            self._home_with(tmpdir, False)
            with mock.patch("pathlib.Path.home", return_value=Path(tmpdir)):
                with mock.patch.dict(os.environ, {}, clear=True):
                    assert telemetry_decision(project_defaults=defaults) == (
                        False,
                        "the project's defaults set telemetry_enabled: false",
                    )
                    assert telemetry_decision() == (
                        False,
                        "this machine opted out (visivo telemetry off)",
                    )
        with tempfile.TemporaryDirectory() as tmpdir:
            with mock.patch("pathlib.Path.home", return_value=Path(tmpdir)):
                with mock.patch.dict(os.environ, {}, clear=True):
                    assert telemetry_decision() == (True, "enabled by default")
