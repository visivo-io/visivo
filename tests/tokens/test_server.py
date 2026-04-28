import threading
import pytest
from unittest.mock import patch, MagicMock
from visivo.tokens.server import (
    _server_holder,
    callback_server,
    shutdown_server,
    token_received_event,
)


@pytest.fixture
def client():
    """
    Pytest fixture that provides a Flask test client
    with TESTING mode enabled.
    """
    callback_server.config["TESTING"] = True
    with callback_server.test_client() as client:
        yield client


def test_authorize_device_callback_no_token(client):
    """
    If no 'token' query param is provided,
    the endpoint should return a 400 status and JSON error.
    """
    response = client.get("/authorize-device-token")
    assert response.status_code == 400
    data = response.get_json()
    assert data["error"] == "Token not provided"


@patch("visivo.tokens.server.threading.Thread")
@patch("visivo.tokens.server.validate_and_store_token")  # bottom patch
@patch("visivo.tokens.server.Logger.instance")  # top patch
def test_authorize_device_callback_with_token(
    mock_logger_class,
    mock_validate,
    mock_thread,
    client,
):
    """
    If a 'token' query param is provided, the endpoint should:
    - Return 200
    - Call validate_and_store_token(token)
    - Set the token_received_event
    - Return an HTML page containing 'Authorization Successful'
    """
    mock_logger = MagicMock()
    mock_logger_class.return_value = mock_logger

    token_received_event.clear()

    test_token = "abc1234567"
    response = client.get(f"/authorize-device-token?token={test_token}")

    assert response.status_code == 200
    mock_validate.assert_called_once_with(test_token)
    assert token_received_event.is_set()

    response_data = response.data.decode("utf-8")
    assert "Authorization Successful" in response_data

    mock_thread.assert_called_once()
    thread_instance = mock_thread.return_value
    thread_instance.start.assert_called_once()


@pytest.fixture
def clean_server_holder():
    """Reset the module-level server holder around each test."""
    _server_holder.pop("server", None)
    yield
    _server_holder.pop("server", None)


@patch("visivo.tokens.server.time.sleep")  # skip the 1s flush delay
def test_shutdown_server_calls_server_shutdown(mock_sleep, clean_server_holder):
    """
    When a live server has been registered in _server_holder, shutdown_server
    should call its .shutdown() method exactly once.
    """
    fake_server = MagicMock()
    _server_holder["server"] = fake_server

    shutdown_server()

    mock_sleep.assert_called_once_with(1)
    fake_server.shutdown.assert_called_once()


@patch("visivo.tokens.server.time.sleep")
def test_shutdown_server_noop_when_no_server_registered(mock_sleep, clean_server_holder):
    """
    If no server has been registered (e.g. unit-test context, or a teardown
    that already happened), shutdown_server must NOT raise.
    """
    assert "server" not in _server_holder

    shutdown_server()  # should be a clean no-op


@patch("visivo.tokens.server.time.sleep")
def test_shutdown_server_safe_outside_request_context(mock_sleep, clean_server_holder):
    """
    Regression test for the Werkzeug 2.1+ breakage: shutdown_server is invoked
    from a separate thread *after* the request handler has returned, so there
    is no active Flask request context. Previously this raised
    `RuntimeError: Working outside of request context` because the function
    accessed `request.environ`. The current implementation must work cleanly
    from any thread regardless of request state.
    """
    fake_server = MagicMock()
    _server_holder["server"] = fake_server

    error: list[BaseException] = []

    def runner():
        try:
            shutdown_server()
        except BaseException as e:  # pragma: no cover - test asserts none
            error.append(e)

    t = threading.Thread(target=runner)
    t.start()
    t.join(timeout=5)

    assert not error, f"shutdown_server raised in a non-request thread: {error[0]!r}"
    fake_server.shutdown.assert_called_once()
