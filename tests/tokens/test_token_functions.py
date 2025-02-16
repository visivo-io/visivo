import os
import pytest
import click
from unittest.mock import patch, mock_open, MagicMock
from visivo.tokens.token_functions import (
    get_existing_token,
    write_token,
    validate_and_store_token,
    PROFILE_PATH,
)


@pytest.fixture
def mock_logger():
    """
    Fixture that patches Logger.instance() so debug() and success() calls
    won't clutter test output. We return the mock logger so tests can assert
    calls like mock_logger.success.assert_called_once_with(...).
    """
    with patch("visivo.tokens.token_functions.Logger.instance") as mock_logger_class:
        mock_logger = MagicMock()
        mock_logger_class.return_value = mock_logger
        yield mock_logger


# ------------------ get_existing_token tests ------------------ #


@patch("os.path.exists", return_value=False)
def test_get_existing_token_no_file(mock_exists):
    """Should return None if the profile file doesn't exist."""
    token = get_existing_token()
    assert token is None
    mock_exists.assert_called_once_with(PROFILE_PATH)


@patch("os.path.exists", return_value=True)
@patch("builtins.open", new_callable=mock_open, read_data="token: abc1234567")
def test_get_existing_token_happy_path(mock_file, mock_exists):
    """Should return the token if the file exists and has a 'token' key."""
    token = get_existing_token()
    assert token == "abc1234567"
    mock_exists.assert_called_once_with(PROFILE_PATH)
    mock_file.assert_called_once_with(PROFILE_PATH, "r")


@patch("os.path.exists", return_value=True)
@patch("builtins.open", new_callable=mock_open, read_data="{}")
def test_get_existing_token_empty_token(mock_file, mock_exists):
    """Should return None if 'token' key isn't found in the file."""
    token = get_existing_token()
    assert token is None
    mock_exists.assert_called_once_with(PROFILE_PATH)
    mock_file.assert_called_once_with(PROFILE_PATH, "r")


# ------------------ write_token tests ------------------ #


# The topmost @patch is the LAST argument to the function,
# so the order of decorators must match the parameter order in reverse.
@patch("os.makedirs")
@patch("builtins.open", new_callable=mock_open)
def test_write_token_happy_path(mock_file, mock_makedirs, mock_logger):
    """Should write the token to PROFILE_PATH and log success."""
    write_token("testtoken")

    # Ensure directories are created
    mock_makedirs.assert_called_once_with(os.path.dirname(PROFILE_PATH), exist_ok=True)

    # Ensure file is opened for writing
    mock_file.assert_called_once_with(PROFILE_PATH, "w")

    # Capture what was written to the file
    handle = mock_file()
    written_content = "".join(call.args[0] for call in handle.write.mock_calls)
    assert "testtoken" in written_content

    # Verify the logger call
    mock_logger.success.assert_called_once_with("Token written successfully")


@patch("os.makedirs")
@patch("builtins.open", side_effect=Exception("Write error"))
def test_write_token_error(mock_file, mock_makedirs, mock_logger):
    """Should raise a ClickException if file writing fails."""
    with pytest.raises(click.ClickException, match="Error writing token"):
        write_token("testtoken")


# ------------------ validate_and_store_token tests ------------------ #


@patch("visivo.tokens.token_functions.write_token")
def test_validate_and_store_token_short_token(mock_write):
    """Should raise ClickException if token is shorter than 10 chars."""
    with pytest.raises(click.ClickException, match="Token is too short"):
        validate_and_store_token("short")


@patch("visivo.tokens.token_functions.write_token")
@patch("click.prompt", return_value="abcdefghijklmnop")
def test_validate_and_store_token_none_passed(mock_prompt, mock_write, mock_logger):
    """
    If token=None, we prompt for it, then call write_token with the user input.
    """
    validate_and_store_token(None)
    mock_prompt.assert_called_once_with("Please enter your token")
    mock_write.assert_called_once_with("abcdefghijklmnop")
    mock_logger.debug.assert_any_call("Token received")
    mock_logger.debug.assert_any_call(f"Writing token to {PROFILE_PATH}")


@patch("visivo.tokens.token_functions.write_token")
def test_validate_and_store_token_valid_token(mock_write, mock_logger):
    """If token is valid, it should call write_token without prompting."""
    validate_and_store_token("abcdefghij")  # exactly 10 chars
    mock_write.assert_called_once_with("abcdefghij")
    mock_logger.debug.assert_any_call("Token received")
    mock_logger.debug.assert_any_call(f"Writing token to {PROFILE_PATH}")
