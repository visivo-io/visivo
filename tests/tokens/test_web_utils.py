# test_web_utils.py
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

    # Patch the place webbrowser.open is imported
    monkeypatch.setattr(webbrowser, "open", mock_open)

    return mock_open, lambda: captured_url


def test_open_url_encodes_query(mock_webbrowser_open):
    """
    Ensures open_url re-encodes the query and calls webbrowser.open with the safe URL.
    """
    mock_open, get_captured_url = mock_webbrowser_open

    # Original URL with spaces and a percent-encoded character
    original_url = "http://example.com/path?param=hello world&other=%40"
    result = open_url(original_url)

    # open_url should return whatever fake_open returns (True)
    assert result is True

    # Check the final URL that was "opened"
    captured_url = get_captured_url()
    parsed = urllib.parse.urlparse(captured_url)
    query = urllib.parse.parse_qs(parsed.query)

    # "hello world" -> parse_qs decodes the + or %20 back to a space
    assert query["param"][0] == "hello world"
    # "%40" -> "@"
    assert query["other"][0] == "@"
    # Confirm scheme, netloc, and path are unchanged
    assert parsed.scheme == "http"
    assert parsed.netloc == "example.com"
    assert parsed.path == "/path"

    mock_open.assert_called_once()


def test_generate_success_html_response():
    """
    Checks that the returned HTML includes a meta refresh tag pointing to {base_url}/profile
    and that the timeout is set properly.
    """
    base_url = "http://mytestsite.com"
    timeout = 10
    html = generate_success_html_response(base_url, timeout=timeout)

    expected_meta = (
        f'<meta http-equiv="refresh" content="{timeout};url={base_url}/profile" />'
    )
    assert expected_meta in html

    # Check for some key text or structure in the HTML
    assert "<title>Authorization Successful</title>" in html
    assert "A token has been written to your development machine" in html
    assert "You'll now be redirected to your profile page" in html
