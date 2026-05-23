import os
import pytest
import click
from unittest.mock import patch, MagicMock
from visivo.tokens.token_functions import (
    get_existing_token,
    write_token,
    validate_and_store_token,
    PROFILE_PATH,
)


@pytest.fixture
def mock_logger():
    """Patch Logger.instance() so debug()/success() calls don't clutter output."""
    with patch("visivo.tokens.token_functions.Logger.instance") as mock_logger_class:
        mock_logger = MagicMock()
        mock_logger_class.return_value = mock_logger
        yield mock_logger


@pytest.fixture
def profile_path(tmp_path, monkeypatch):
    """Redirect PROFILE_PATH to a tmp file for the duration of a test."""
    path = tmp_path / ".visivo" / "profile.yml"
    monkeypatch.setattr("visivo.tokens.token_functions.PROFILE_PATH", str(path))
    return path


# ------------------ get_existing_token tests ------------------ #


def test_get_existing_token_no_file(profile_path):
    assert get_existing_token() is None
    assert get_existing_token(host="https://app.visivo.io") is None


def test_get_existing_token_host_match(profile_path):
    profile_path.parent.mkdir(parents=True)
    profile_path.write_text(
        'tokens:\n  "https://app.visivo.io": prod1234567\n'
        '  "http://localhost:3030": local1234567\n'
    )
    assert get_existing_token(host="https://app.visivo.io") == "prod1234567"
    assert get_existing_token(host="http://localhost:3030") == "local1234567"


def test_get_existing_token_host_miss_returns_none(profile_path):
    profile_path.parent.mkdir(parents=True)
    profile_path.write_text('tokens:\n  "https://app.visivo.io": prod1234567\n')
    assert get_existing_token(host="http://localhost:9999") is None


def test_get_existing_token_legacy_fallback(profile_path):
    """Legacy single-token profile still works when no host is passed."""
    profile_path.parent.mkdir(parents=True)
    profile_path.write_text("token: legacy123456\n")
    assert get_existing_token() == "legacy123456"


def test_get_existing_token_legacy_with_host_returns_none(profile_path):
    """A specific host should NOT silently match the legacy token."""
    profile_path.parent.mkdir(parents=True)
    profile_path.write_text("token: legacy123456\n")
    assert get_existing_token(host="http://localhost:3030") is None


# ------------------ write_token tests ------------------ #


def test_write_token_creates_tokens_map(profile_path, mock_logger):
    write_token("testtoken1", host="http://localhost:3030")
    contents = profile_path.read_text()
    assert "http://localhost:3030" in contents
    assert "testtoken1" in contents
    mock_logger.success.assert_called_once_with("Token written for http://localhost:3030")


def test_write_token_preserves_existing_hosts(profile_path, mock_logger):
    profile_path.parent.mkdir(parents=True)
    profile_path.write_text('tokens:\n  "https://app.visivo.io": prod1234567\n')
    write_token("local1234567", host="http://localhost:3030")
    refetched = get_existing_token(host="https://app.visivo.io")
    assert refetched == "prod1234567"


def test_write_token_migrates_legacy(profile_path, mock_logger):
    """Writing a host-keyed token on a legacy profile migrates the legacy value
    to https://app.visivo.io rather than discarding it."""
    profile_path.parent.mkdir(parents=True)
    profile_path.write_text("token: legacy1234567\n")
    write_token("local1234567", host="http://localhost:3030")
    assert get_existing_token(host="https://app.visivo.io") == "legacy1234567"
    assert get_existing_token(host="http://localhost:3030") == "local1234567"


def test_write_token_requires_host(profile_path, mock_logger):
    with pytest.raises(click.ClickException, match="host is required"):
        write_token("testtoken1", host=None)


# ------------------ validate_and_store_token tests ------------------ #


def test_validate_and_store_token_short_token(profile_path):
    with pytest.raises(click.ClickException, match="Token is too short"):
        validate_and_store_token("short", host="http://localhost:3030")


def test_validate_and_store_token_none_prompts(profile_path, mock_logger):
    with patch("click.prompt", return_value="abcdefghijklmnop") as mock_prompt:
        validate_and_store_token(None, host="http://localhost:3030")
    mock_prompt.assert_called_once_with("Please enter your token")
    assert get_existing_token(host="http://localhost:3030") == "abcdefghijklmnop"


def test_validate_and_store_token_valid(profile_path, mock_logger):
    validate_and_store_token("abcdefghij", host="http://localhost:3030")
    assert get_existing_token(host="http://localhost:3030") == "abcdefghij"
