import pytest
from unittest.mock import patch, MagicMock
from visivo.tokens.server import callback_server, token_received_event


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


@patch("visivo.tokens.server.validate_and_store_token")  # bottom patch
@patch("visivo.tokens.server.Logger.instance")  # top patch
def test_authorize_device_callback_with_token(
    mock_logger_class,
    mock_validate,
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
