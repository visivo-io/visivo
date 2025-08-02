import pytest
import urllib.parse
import webbrowser
from unittest.mock import Mock
from visivo.tokens.web_utils import open_url, generate_success_html_response


@pytest.fixture
def mock_webbrowser_open(monkeypatch):
    mock_open = Mock(return_value=True)
    captured_url = None

    def side_effect(url):
        nonlocal captured_url
        captured_url = url
        return True

    mock_open.side_effect = side_effect

    monkeypatch.setattr(webbrowser, "open", mock_open)

    return mock_open, lambda: captured_url


def test_open_url_encodes_query(mock_webbrowser_open):
    """
    Ensures open_url re-encodes the query and calls webbrowser.open with the safe URL.
    """
    mock_open, get_captured_url = mock_webbrowser_open

    original_url = "http://example.com/path?param=hello world&other=%40"
    result = open_url(original_url)

    assert result is True

    captured_url = get_captured_url()
    parsed = urllib.parse.urlparse(captured_url)
    query = urllib.parse.parse_qs(parsed.query)

    assert query["param"][0] == "hello world"
    assert query["other"][0] == "@"
    assert parsed.scheme == "http"
    assert parsed.netloc == "example.com"
    assert parsed.path == "/path"

    mock_open.assert_called_once()


def test_generate_success_html_response_redirect():
    """
    When closePopUp=False, ensure the response contains redirect JS to profile page and correct timeout.
    """
    base_url = "http://mytestsite.com"
    timeout = 10
    html = generate_success_html_response(base_url, timeout=timeout, closePopUp=False)

    assert "<title>Authorization Successful</title>" in html
    assert "~/.visivo/profile.yml" in html
    assert f"window.location.href = '{base_url}/profile';" in html
    assert f"animation: loadProgress {timeout}s linear forwards;" in html
    assert "Redirecting to your profile page..." in html


def test_generate_success_html_response_closes_popup():
    """
    When closePopUp=True, ensure the response contains window.close() and relevant messaging.
    """
    base_url = "http://mytestsite.com"
    timeout = 5
    html = generate_success_html_response(base_url, timeout=timeout, closePopUp=True)

    assert "<title>Authorization Successful</title>" in html
    assert "~/.visivo/profile.yml" in html
    assert "window.close();" in html
    assert f"animation: loadProgress {timeout}s linear forwards;" in html
    assert "Redirecting to local server please wait..." in html
