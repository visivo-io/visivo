import threading
import time
import types
import urllib.parse
from click.testing import CliRunner
import pytest

from visivo.logger.logger import Logger, TypeEnum
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
def spinner_logger():
    """
    Put the Logger in the state the CLI group leaves it in. Under pytest stdout
    is not a TTY, so this is the non-TTY state where the spinner is None.
    """
    Logger.instance().set_type(TypeEnum.spinner)
    yield
    Logger.instance().set_type(TypeEnum.console)


@pytest.fixture
def interactive(monkeypatch):
    monkeypatch.setattr("visivo.commands.authorize.is_interactive", lambda: True)


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


def test_authorize_timeout_cancel(monkeypatch, interactive):
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


def test_authorize_existing_token_no_overwrite(monkeypatch, interactive):
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


def test_authorize_existing_token_overwrite(monkeypatch, interactive):
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


def _fake_sys(stdin_tty, stdout_tty):
    return types.SimpleNamespace(
        stdin=types.SimpleNamespace(isatty=lambda: stdin_tty),
        stdout=types.SimpleNamespace(isatty=lambda: stdout_tty),
    )


@pytest.mark.parametrize(
    "ci,stdin_tty,stdout_tty,expected",
    [
        (None, True, True, True),
        ("true", True, True, False),
        (None, False, True, False),
        (None, True, False, False),
    ],
)
def test_is_interactive(monkeypatch, ci, stdin_tty, stdout_tty, expected):
    from visivo.commands import authorize as authorize_module

    if ci is None:
        monkeypatch.delenv("CI", raising=False)
    else:
        monkeypatch.setenv("CI", ci)
    monkeypatch.setattr(authorize_module, "sys", _fake_sys(stdin_tty, stdout_tty))

    assert authorize_module.is_interactive() is expected


def test_authorize_through_cli_group_without_tty(monkeypatch):
    """
    The CLI group sets the spinner logger type. Without a TTY that leaves the
    spinner as None, and authorize must not touch it.
    """
    from visivo.command_line import visivo

    monkeypatch.setattr("visivo.commands.authorize.get_existing_token", lambda host=None: None)
    monkeypatch.setattr(token_received_event, "wait", lambda timeout=None: True)

    runner = CliRunner()
    result = runner.invoke(visivo, ["authorize", "--host", "http://localhost:3030"])

    assert Logger.instance().spinner is None
    assert result.exception is None, result.output
    assert result.exit_code == 0
    assert "http://localhost:3030/authorize-device?" in result.output
    assert "Waiting for visivo token response" in result.output


def test_authorize_with_ci_true_does_not_prompt(monkeypatch):
    """
    CI=true is non-interactive even when both streams look like a TTY. A
    timeout exits non-zero instead of asking whether to keep waiting.
    """
    monkeypatch.setenv("CI", "true")
    monkeypatch.setattr("visivo.commands.authorize.sys", _fake_sys(True, True))
    Logger.instance().set_type(TypeEnum.spinner)
    monkeypatch.setattr("visivo.commands.authorize.get_existing_token", lambda host=None: None)
    monkeypatch.setattr(token_received_event, "wait", lambda timeout=None: False)

    def no_prompt(*args, **kwargs):
        raise AssertionError("authorize must not prompt when CI=true")

    monkeypatch.setattr("visivo.commands.authorize.click.confirm", no_prompt)

    runner = CliRunner()
    result = runner.invoke(authorize, ["--host", "http://localhost:3030"])

    assert Logger.instance().spinner is None
    assert result.exit_code == 1
    assert "http://localhost:3030/authorize-device?" in result.output
    assert "No token received." in result.output


def test_authorize_existing_token_without_tty_keeps_token(monkeypatch):
    """
    Without a TTY an existing token is kept and the command exits at once,
    instead of blocking on, or aborting at, the replace prompt.
    """
    monkeypatch.setattr(
        "visivo.commands.authorize.get_existing_token", lambda host=None: "abc1234567"
    )

    def no_prompt(*args, **kwargs):
        raise AssertionError("authorize must not prompt without a TTY")

    monkeypatch.setattr("visivo.commands.authorize.click.confirm", no_prompt)
    opened = _capture_opened_url(monkeypatch)

    runner = CliRunner()
    result = runner.invoke(authorize, ["--host", "http://localhost:3030"])

    assert result.exit_code == 0
    assert "Using the existing token" in result.output
    assert "visivo authorize --replace" in result.output
    assert "abc1234567" not in result.output
    assert opened == []


def test_authorize_existing_token_without_tty_replace_flag(monkeypatch):
    """
    --replace skips the prompt and starts a new authorization without a TTY.
    """
    monkeypatch.setattr(
        "visivo.commands.authorize.get_existing_token", lambda host=None: "abc1234567"
    )
    monkeypatch.setattr(token_received_event, "wait", lambda timeout=None: True)

    def no_prompt(*args, **kwargs):
        raise AssertionError("--replace must not prompt")

    monkeypatch.setattr("visivo.commands.authorize.click.confirm", no_prompt)
    opened = _capture_opened_url(monkeypatch)

    runner = CliRunner()
    result = runner.invoke(authorize, ["--host", "http://localhost:3030", "--replace"])

    assert result.exit_code == 0
    assert len(opened) == 1
    assert "Waiting for visivo token response" in result.output


def test_authorize_without_tty_prints_url_when_browser_fails(monkeypatch):
    monkeypatch.setattr("visivo.commands.authorize.get_existing_token", lambda host=None: None)
    monkeypatch.setattr("visivo.commands.authorize.open_url", lambda url: False)
    monkeypatch.setattr(token_received_event, "wait", lambda timeout=None: True)

    runner = CliRunner()
    result = runner.invoke(authorize, ["--host", "http://localhost:3030"])

    assert result.exit_code == 0
    assert "couldn't automatically open" in result.output
    assert result.output.count("http://localhost:3030/authorize-device?") >= 2
