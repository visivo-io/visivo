import threading
import time
from click.testing import CliRunner
import pytest

from visivo.logging.logger import Logger
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
    monkeypatch.setattr("visivo.tokens.server.validate_and_store_token", lambda token: None)


def test_authorize_successful_callback(monkeypatch):
    """
    Test that when no token exists the authorize command completes normally.
    """
    monkeypatch.setattr("visivo.commands.authorize.get_existing_token", lambda: None)
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
    monkeypatch.setattr("visivo.commands.authorize.get_existing_token", lambda: "abc1234567")
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
    monkeypatch.setattr("visivo.commands.authorize.get_existing_token", lambda: "abc1234567")

    runner = CliRunner()
    result = runner.invoke(authorize, ["--host", "http://localhost:3030"], input="n\n")

    expected = "Authorization cancelled. Using the existing token."
    assert expected in result.output


def test_authorize_existing_token_overwrite(monkeypatch):
    """
    Test the case where a token already exists and the user opts to add a new token.
    In this case the command should continue to wait for a callback.
    """
    monkeypatch.setattr("visivo.commands.authorize.get_existing_token", lambda: "abc1234567")
    monkeypatch.setattr(token_received_event, "wait", lambda timeout=None: True)

    runner = CliRunner()
    result = runner.invoke(authorize, ["--host", "http://localhost:3030"], input="y\n")

    assert result.exit_code == 0
    assert "Waiting for visivo token response" in result.output
