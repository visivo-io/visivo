"""``visivo telemetry off|on|status`` — the per-machine switch.

Each test points ``Path.home`` at a temp dir so the real ``~/.visivo/config.yml``
is never touched, and clears the telemetry env vars pytest sets.
"""

import os
import tempfile
from pathlib import Path
from unittest import mock

import pytest
import yaml
from click.testing import CliRunner

from visivo.commands.telemetry import telemetry

runner = CliRunner()


@pytest.fixture
def home():
    with tempfile.TemporaryDirectory() as tmpdir:
        with mock.patch("pathlib.Path.home", return_value=Path(tmpdir)):
            with mock.patch.dict(os.environ, {}, clear=True):
                yield Path(tmpdir)


def _config(home):
    path = home / ".visivo" / "config.yml"
    if not path.exists():
        return None
    with open(path) as f:
        return yaml.safe_load(f)


def test_off_writes_machine_config_and_status_reports_it(home):
    result = runner.invoke(telemetry, ["off"])
    assert result.exit_code == 0, result.output
    assert "Telemetry is off for this machine" in result.output
    assert "VISIVO_TELEMETRY_FORCE=true" in result.output
    assert _config(home) == {"telemetry_enabled": False}

    status = runner.invoke(telemetry, ["status"])
    assert status.exit_code == 0, status.output
    assert "Telemetry is off: this machine opted out (visivo telemetry off)." in status.output
    assert "telemetry_enabled: false" in status.output


def test_on_restores_and_preserves_other_keys(home):
    (home / ".visivo").mkdir()
    with open(home / ".visivo" / "config.yml", "w") as f:
        f.write("# keep me\nrun_trigger: manual\ntelemetry_enabled: false\n")

    result = runner.invoke(telemetry, ["on"])
    assert result.exit_code == 0, result.output
    assert "Telemetry is on for this machine" in result.output
    assert _config(home) == {"run_trigger": "manual", "telemetry_enabled": True}
    # Round-trips through ruamel: the user's comment survives.
    assert "# keep me" in (home / ".visivo" / "config.yml").read_text()


def test_status_default_is_on(home):
    status = runner.invoke(telemetry, ["status"])
    assert status.exit_code == 0, status.output
    assert "Telemetry is on: enabled by default." in status.output
    assert "visivo telemetry off" in status.output


def test_status_reflects_force_over_opt_out(home):
    runner.invoke(telemetry, ["off"])
    with mock.patch.dict(os.environ, {"VISIVO_TELEMETRY_FORCE": "true"}):
        status = runner.invoke(telemetry, ["status"])
    assert "Telemetry is on: VISIVO_TELEMETRY_FORCE is set." in status.output


def test_off_reports_unwritable_home(home):
    with mock.patch("visivo.commands.telemetry.write_user_config", return_value=False):
        result = runner.invoke(telemetry, ["off"])
    assert result.exit_code != 0
    assert "Could not write" in result.output
