"""~/.visivo/config.yml — the per-user preference file.

Nothing wrote this file before; users hand-edited it. So the writer has to be a
good citizen of a file it doesn't own: keep their comments, keep their key order,
and never drop a key it doesn't recognise. And every read has to survive a file
that isn't there, or that someone left half-edited — a preference lookup must
not be the thing that stops `visivo serve` from starting.
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

    def test_missing_file_gives_the_default_trigger(self):
        assert user_config.get_run_trigger() == user_config.AUTOMATIC

    def test_local_defaults_to_automatic(self):
        """A local run is a sub-second in-process rebuild, so rebuilding as you
        type is the behavior that fits. Cloud defaults the other way."""
        assert user_config.DEFAULT_RUN_TRIGGER == user_config.AUTOMATIC

    def test_corrupt_yaml_falls_back_instead_of_raising(self, config_in_tmp):
        config_in_tmp.parent.mkdir(parents=True)
        config_in_tmp.write_text("run_trigger: [unclosed\n")
        assert user_config.read_user_config() == {}
        assert user_config.get_run_trigger() == user_config.AUTOMATIC

    def test_an_unrecognised_value_falls_back(self, config_in_tmp):
        config_in_tmp.parent.mkdir(parents=True)
        config_in_tmp.write_text("run_trigger: sometimes\n")
        assert user_config.get_run_trigger() == user_config.AUTOMATIC


class TestWriting:
    def test_round_trips(self):
        assert user_config.set_run_trigger(user_config.MANUAL) is True
        assert user_config.get_run_trigger() == user_config.MANUAL

    def test_creates_the_directory(self, config_in_tmp):
        user_config.set_run_trigger(user_config.MANUAL)
        assert config_in_tmp.exists()

    def test_refuses_an_unknown_value(self):
        assert user_config.set_run_trigger("sometimes") is False
        assert user_config.get_run_trigger() == user_config.AUTOMATIC

    def test_preserves_comments_and_unknown_keys(self, config_in_tmp):
        """This is a file people edit by hand — writing a preference must not
        quietly delete the rest of it."""
        config_in_tmp.parent.mkdir(parents=True)
        config_in_tmp.write_text(
            "# my visivo settings\n" "telemetry_enabled: false\n" "some_future_key: 42\n"
        )
        user_config.set_run_trigger(user_config.MANUAL)

        written = config_in_tmp.read_text()
        assert "# my visivo settings" in written
        assert "run_trigger: manual" in written
        config = user_config.read_user_config()
        assert config["telemetry_enabled"] is False
        assert config["some_future_key"] == 42

    def test_telemetry_reads_the_same_file(self, config_in_tmp):
        """One parser for the file, so the two settings can't disagree about
        where it lives or how a broken one is handled."""
        from visivo.telemetry.config import _check_global_config_disabled

        config_in_tmp.parent.mkdir(parents=True)
        config_in_tmp.write_text("telemetry_enabled: false\n")
        assert _check_global_config_disabled() is True

        user_config.set_run_trigger(user_config.MANUAL)
        assert _check_global_config_disabled() is True  # still off after our write
