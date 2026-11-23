"""~/.visivo/config.yml — the per-user config file.

People edit this file by hand, so a write keeps their comments, key order and
unknown keys, and a read survives a file that is missing or half-edited.
"""

import pytest

from visivo.server import user_config


@pytest.fixture(autouse=True)
def config_in_tmp(tmp_path, monkeypatch):
    """Never touch the developer's real ~/.visivo/config.yml."""
    path = tmp_path / ".visivo" / "config.yml"
    monkeypatch.setattr(user_config, "user_config_path", lambda: path)
    return path


class TestReading:
    def test_missing_file_reads_as_empty(self, config_in_tmp):
        assert not config_in_tmp.exists()
        assert user_config.read_user_config() == {}

    def test_corrupt_yaml_falls_back_instead_of_raising(self, config_in_tmp):
        config_in_tmp.parent.mkdir(parents=True)
        config_in_tmp.write_text("telemetry_enabled: [unclosed\n")
        assert user_config.read_user_config() == {}


class TestWriting:
    def test_round_trips(self):
        assert user_config.write_user_config(telemetry_enabled=False) is True
        assert user_config.read_user_config()["telemetry_enabled"] is False

    def test_creates_the_directory(self, config_in_tmp):
        user_config.write_user_config(telemetry_enabled=True)
        assert config_in_tmp.exists()

    def test_preserves_comments_and_unknown_keys(self, config_in_tmp):
        config_in_tmp.parent.mkdir(parents=True)
        config_in_tmp.write_text(
            "# my visivo settings\n" "telemetry_enabled: false\n" "some_future_key: 42\n"
        )
        user_config.write_user_config(telemetry_enabled=True)

        written = config_in_tmp.read_text()
        assert "# my visivo settings" in written
        config = user_config.read_user_config()
        assert config["telemetry_enabled"] is True
        assert config["some_future_key"] == 42

    def test_telemetry_reads_the_same_file(self, config_in_tmp):
        from visivo.telemetry.config import _check_global_config_disabled

        config_in_tmp.parent.mkdir(parents=True)
        config_in_tmp.write_text("telemetry_enabled: false\n")
        assert _check_global_config_disabled() is True

        user_config.write_user_config(some_other_key=1)
        assert _check_global_config_disabled() is True
