import threading
import time
import urllib.parse
from click.testing import CliRunner
import pytest

from visivo.logger.logger import Logger
from visivo.tokens.server import token_received_event, run_flask_server
from visivo.tokens.web_utils import open_url
from visivo.commands.authorize import authorize


@pytest.fixture(autouse=True)
def dummy_run_server(monkeypatch):
    """
    Patch run_flask_server so that it does nothing.
    This prevents starting any live server.
    """
    monkeypatch.setattr("visivo.tokens.server.run_flask_server", lambda **kwargs: None)
    monkeypatch.setattr("visivo.commands.authorize.run_flask_server", lambda **kwargs: None)


@pytest.fixture(autouse=True)
def dummy_open_url(monkeypatch):
    """
    Patch open_url so that it always returns True,
    simulating a successful browser open without actually opening a browser.
    """
    monkeypatch.setattr("visivo.tokens.web_utils.open_url", lambda url: True)
    monkeypatch.setattr("visivo.commands.authorize.open_url", lambda url: True)


@pytest.fixture(autouse=True)
def dummy_spinner(monkeypatch):
    """
    Patch Logger.instance().spinner with a dummy that does nothing.
    """

    class DummySpinner:
        def stop(self):
            pass

        def start(self):
            pass

    monkeypatch.setattr(Logger.instance(), "spinner", DummySpinner())


@pytest.fixture(autouse=True)
def mock_webbrowser_open(monkeypatch):
    """
    Mock webbrowser.open for all tests in this file.
    If you want to test the actual opening of a browser, you can comment out this fixture.
    """
    monkeypatch.setattr("webbrowser.open", lambda url, new=0, autoraise=True: True)


@pytest.fixture(autouse=True)
def reset_token_event():
    token_received_event.clear()
    yield
    token_received_event.clear()


@pytest.fixture(autouse=True)
def mock_file_writes(monkeypatch):
    """
    Patch the token storage function so that it does nothing.
    """
    monkeypatch.setattr(
        "visivo.tokens.server.validate_and_store_token", lambda token, host=None: None
    )


def test_authorize_successful_callback(monkeypatch):
    """
    Test that when no token exists the authorize command completes normally.
    """
    monkeypatch.setattr("visivo.commands.authorize.get_existing_token", lambda host=None: None)
    monkeypatch.setattr(token_received_event, "wait", lambda timeout=None: True)

    runner = CliRunner()
    result = runner.invoke(authorize, ["--host", "http://localhost:3030"])

    assert result.exit_code == 0
    assert "Waiting for visivo token response" in result.output


def test_authorize_timeout_cancel(monkeypatch):
    """
    Test the case where a token already exists and no callback is received.
    The command prompts to add a new token, then later asks if the user wants
    to cancel. We simulate a timeout by forcing token_received_event.wait to always return False.
    """
    monkeypatch.setattr(
        "visivo.commands.authorize.get_existing_token", lambda host=None: "abc1234567"
    )
    monkeypatch.setattr(token_received_event, "wait", lambda timeout=None: False)

    runner = CliRunner()
    result = runner.invoke(authorize, ["--host", "http://localhost:3030"], input="y\ny\n")
    expected = "Authorization cancelled. No token received."
    assert expected in result.output


def test_authorize_existing_token_no_overwrite(monkeypatch):
    """
    Test the case where a token already exists and the user opts not to
    overwrite it. The command should cancel authorization immediately.
    """
    monkeypatch.setattr(
        "visivo.commands.authorize.get_existing_token", lambda host=None: "abc1234567"
    )

    runner = CliRunner()
    result = runner.invoke(authorize, ["--host", "http://localhost:3030"], input="n\n")

    expected = "Authorization cancelled. Using the existing token."
    assert expected in result.output


def test_authorize_existing_token_overwrite(monkeypatch):
    """
    Test the case where a token already exists and the user opts to add a new token.
    In this case the command should continue to wait for a callback.
    """
    monkeypatch.setattr(
        "visivo.commands.authorize.get_existing_token", lambda host=None: "abc1234567"
    )
    monkeypatch.setattr(token_received_event, "wait", lambda timeout=None: True)

    runner = CliRunner()
    result = runner.invoke(authorize, ["--host", "http://localhost:3030"], input="y\n")

    assert result.exit_code == 0
    assert "Waiting for visivo token response" in result.output


def _capture_opened_url(monkeypatch):
    """
    Patch open_url (where it is used in authorize) to capture the URL it is
    called with, returning a one-element list that will hold the captured URL.
    """
    captured = []

    def fake_open_url(url):
        captured.append(url)
        return True

    monkeypatch.setattr("visivo.commands.authorize.open_url", fake_open_url)
    return captured


def test_authorize_includes_machine_id_when_telemetry_enabled(monkeypatch):
    """
    When telemetry is enabled, the opened authorize URL must carry the anonymous
    machine_id (the PostHog distinct_id) so the server can stitch it to the account.
    """
    known_machine_id = "11111111-2222-3333-4444-555555555555"
    monkeypatch.setattr("visivo.commands.authorize.get_existing_token", lambda host=None: None)
    monkeypatch.setattr("visivo.commands.authorize.is_telemetry_enabled", lambda: True)
    monkeypatch.setattr("visivo.commands.authorize.get_machine_id", lambda: known_machine_id)
    monkeypatch.setattr(token_received_event, "wait", lambda timeout=None: True)

    captured = _capture_opened_url(monkeypatch)

    runner = CliRunner()
    result = runner.invoke(authorize, ["--host", "http://localhost:3030"])

    assert result.exit_code == 0
    assert len(captured) == 1
    opened_url = captured[0]
    parsed = urllib.parse.urlparse(opened_url)
    query = urllib.parse.parse_qs(parsed.query)

    assert query.get("machine_id") == [known_machine_id]
    # Regression: original params are still present.
    assert "redirect_url" in query
    assert query.get("name") is not None


def test_authorize_excludes_machine_id_when_telemetry_disabled(monkeypatch):
    """
    When telemetry is disabled (opt-out), the opened authorize URL must NOT carry
    machine_id, so no stitching happens and the CLI stays anonymous.
    """
    monkeypatch.setattr("visivo.commands.authorize.get_existing_token", lambda host=None: None)
    monkeypatch.setattr("visivo.commands.authorize.is_telemetry_enabled", lambda: False)

    def fail_get_machine_id():
        raise AssertionError("get_machine_id must not be called when telemetry is disabled")

    monkeypatch.setattr("visivo.commands.authorize.get_machine_id", fail_get_machine_id)
    monkeypatch.setattr(token_received_event, "wait", lambda timeout=None: True)

    captured = _capture_opened_url(monkeypatch)

    runner = CliRunner()
    result = runner.invoke(authorize, ["--host", "http://localhost:3030"])

    assert result.exit_code == 0
    assert len(captured) == 1
    opened_url = captured[0]
    parsed = urllib.parse.urlparse(opened_url)
    query = urllib.parse.parse_qs(parsed.query)

    assert "machine_id" not in query
    # Regression: original params are still present.
    assert "redirect_url" in query
    assert query.get("name") is not None
