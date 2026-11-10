import logging
import socket
import threading
import time
import urllib.request

import pytest

from visivo.tokens.log_redaction import (
    REDACTED,
    TokenRedactingFilter,
    install_request_log_redaction,
    redact_token,
)

SECRET = "s3cr3t-token-value"


@pytest.mark.parametrize(
    "text,expected",
    [
        (
            f'"GET /authorize-device-token?token={SECRET} HTTP/1.1" 200 -',
            f'"GET /authorize-device-token?token={REDACTED} HTTP/1.1" 200 -',
        ),
        (
            f"/api/auth/authorize-device-token/callback/abc/?x=1&token={SECRET}&y=2",
            f"/api/auth/authorize-device-token/callback/abc/?x=1&token={REDACTED}&y=2",
        ),
        ("GET /api/project/ HTTP/1.1", "GET /api/project/ HTTP/1.1"),
    ],
)
def test_redact_token(text, expected):
    assert redact_token(text) == expected


def test_filter_rewrites_formatted_record_and_keeps_it():
    record = logging.LogRecord(
        "werkzeug", logging.INFO, __file__, 1, "%s - %s", ("127.0.0.1", f"?token={SECRET}"), None
    )

    assert TokenRedactingFilter().filter(record) is True
    assert SECRET not in record.getMessage()
    assert REDACTED in record.getMessage()


def test_filter_leaves_unrelated_record_untouched():
    record = logging.LogRecord("werkzeug", logging.INFO, __file__, 1, "%s", ("plain",), None)

    TokenRedactingFilter().filter(record)

    assert record.msg == "%s"
    assert record.args == ("plain",)


def test_install_is_idempotent():
    logger = logging.getLogger("visivo-test-redaction")
    install_request_log_redaction("visivo-test-redaction")
    install_request_log_redaction("visivo-test-redaction")

    assert sum(isinstance(f, TokenRedactingFilter) for f in logger.filters) == 1


class _Collect(logging.Handler):
    def __init__(self):
        super().__init__()
        self.lines = []

    def emit(self, record):
        self.lines.append(record.getMessage())


def _free_port():
    with socket.socket() as s:
        s.bind(("localhost", 0))
        return s.getsockname()[1]


def test_callback_server_request_log_does_not_contain_the_token(monkeypatch):
    from visivo.tokens import server

    monkeypatch.setattr(server, "validate_and_store_token", lambda token, host=None: None)
    monkeypatch.setattr(server, "shutdown_server", lambda: None)
    monkeypatch.setitem(server.callback_server.config, "BASE_URL", None)
    logger = logging.getLogger("werkzeug")
    for f in [f for f in logger.filters if isinstance(f, TokenRedactingFilter)]:
        logger.removeFilter(f)
    handler = _Collect()
    logger.addHandler(handler)
    previous_level = logger.level
    logger.setLevel(logging.INFO)
    port = _free_port()
    thread = threading.Thread(
        target=server.run_flask_server,
        kwargs={"base_url": "http://localhost:3030", "port": port},
        daemon=True,
    )
    try:
        thread.start()
        for _ in range(50):
            if server._server_holder.get("server") is not None:
                break
            time.sleep(0.05)
        urllib.request.urlopen(
            f"http://localhost:{port}/authorize-device-token?token={SECRET}"
        ).read()
        for _ in range(50):
            if any("authorize-device-token" in line for line in handler.lines):
                break
            time.sleep(0.05)
    finally:
        live = server._server_holder.get("server")
        if live is not None:
            live.shutdown()
        thread.join(timeout=5)
        logger.removeHandler(handler)
        logger.setLevel(previous_level)
        server.token_received_event.clear()

    request_lines = [line for line in handler.lines if "authorize-device-token" in line]
    assert request_lines
    assert all(SECRET not in line for line in request_lines)


def test_hot_reload_server_installs_the_redaction(tmp_path):
    from flask import Flask
    from visivo.server.hot_reload_server import HotReloadServer

    logger = logging.getLogger("werkzeug")
    for f in [f for f in logger.filters if isinstance(f, TokenRedactingFilter)]:
        logger.removeFilter(f)

    HotReloadServer(app=Flask(__name__), on_project_change=lambda: None, watch_path=str(tmp_path))

    assert any(isinstance(f, TokenRedactingFilter) for f in logger.filters)
