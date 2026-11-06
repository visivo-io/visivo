import gzip
import importlib.util
import os
import threading
import urllib.error
import urllib.request
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

SERVE_DIST = Path(__file__).resolve().parents[2] / "scripts" / "serve_dist.py"


def _load_handler():
    spec = importlib.util.spec_from_file_location("serve_dist", SERVE_DIST)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.SPARequestHandler


@pytest.fixture
def server(tmp_path):
    (tmp_path / "index.html").write_text("<html>viewer</html>")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "duckdb-eh.wasm").write_bytes(b"\0asm" + b"\1" * 4096)
    (tmp_path / "assets" / "logo.png").write_bytes(b"\x89PNG" + b"\0" * 64)
    handler = partial(_load_handler(), directory=str(tmp_path))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


def _get(url, gzip_ok=True):
    headers = {"Accept-Encoding": "gzip"} if gzip_ok else {}
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers))


def test_wasm_is_served_as_wasm_and_gzipped(server):
    response = _get(f"{server}/assets/duckdb-eh.wasm")

    assert response.headers["Content-Type"] == "application/wasm"
    assert response.headers["Content-Encoding"] == "gzip"
    assert gzip.decompress(response.read()) == b"\0asm" + b"\1" * 4096


def test_no_gzip_unless_the_client_asks(server):
    response = _get(f"{server}/assets/duckdb-eh.wasm", gzip_ok=False)

    assert response.headers.get("Content-Encoding") is None
    assert response.read().startswith(b"\0asm")


def test_images_are_not_gzipped(server):
    response = _get(f"{server}/assets/logo.png")

    assert response.headers.get("Content-Encoding") is None


def test_a_dashboard_route_falls_back_to_index_html(server):
    response = _get(f"{server}/NYC%20Taxi")

    assert gzip.decompress(response.read()) == b"<html>viewer</html>"


def test_a_missing_file_still_404s(server):
    with pytest.raises(urllib.error.HTTPError) as error:
        _get(f"{server}/data/dashboards.json")
    assert error.value.code == 404
