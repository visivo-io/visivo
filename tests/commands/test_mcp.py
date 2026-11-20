"""The `visivo mcp` command (VIS-1809)."""

import io
import json
import os
import socket
import subprocess
import sys

import click
import pytest

from visivo.agent.tools import TOOLS
from visivo.commands import mcp_phase as phase
from visivo.server.hot_reload_server import HotReloadServer

MESSAGES = [
    {"jsonrpc": "2.0", "id": 1, "method": "initialize"},
    {"jsonrpc": "2.0", "method": "notifications/initialized"},
    {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    {
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {"name": "list_sources", "arguments": {}},
    },
]


def _stdin(messages=MESSAGES):
    return "".join(json.dumps(message) + "\n" for message in messages)


def _run_cli(arguments, stdin="", debug=False, cwd=None):
    env = {**os.environ, "VISIVO_TELEMETRY_DISABLED": "true"}
    env.pop("DEBUG", None)
    if debug:
        env["DEBUG"] = "true"
    return subprocess.run(
        [sys.executable, "-m", "visivo.command_line", *arguments],
        input=stdin,
        capture_output=True,
        text=True,
        timeout=180,
        env=env,
        cwd=cwd,
    )


def _mcp_arguments(tmp_path):
    port = HotReloadServer.find_available_port(start_port=8200)
    return ["mcp", "-w", str(tmp_path), "-o", str(tmp_path / "target"), "--port", str(port)]


class TestTheRealCommand:
    def test_stdout_carries_only_protocol_messages(self, tmp_path):
        """With DEBUG on, the CLI logs at its loudest, and none of it may reach stdout."""
        finished = _run_cli(_mcp_arguments(tmp_path), _stdin(), debug=True)

        assert finished.returncode == 0, finished.stderr
        replies = [json.loads(line) for line in finished.stdout.splitlines()]
        assert [reply["id"] for reply in replies] == [1, 2, 3]
        assert all(reply["jsonrpc"] == "2.0" for reply in replies)
        assert replies[0]["result"]["serverInfo"]["name"] == "visivo"
        assert {tool["name"] for tool in replies[1]["result"]["tools"]} == set(TOOLS)
        assert replies[2]["result"]["isError"] is False
        assert "Starting Visivo..." in finished.stderr

    def test_no_project_file_is_said_on_stderr(self, tmp_path):
        finished = _run_cli(_mcp_arguments(tmp_path), _stdin(MESSAGES[:1]))

        assert finished.returncode == 0, finished.stderr
        assert "No Visivo project file" in finished.stderr

    def test_started_from_a_directory_it_cannot_write_it_uses_the_project(self, tmp_path):
        """A client starts the command from a directory of its own choosing."""
        project = tmp_path / "project"
        project.mkdir()
        elsewhere = tmp_path / "elsewhere"
        elsewhere.mkdir()
        elsewhere.chmod(0o555)
        port = HotReloadServer.find_available_port(start_port=8250)

        finished = _run_cli(
            ["mcp", "--working-dir", str(project), "--port", str(port)],
            _stdin(MESSAGES[:1]),
            cwd=elsewhere,
        )

        assert finished.returncode == 0, finished.stderr
        assert (project / "target").is_dir()
        assert not (elsewhere / "target").exists()

    def test_an_output_directory_it_cannot_create_is_refused_cleanly(self, tmp_path):
        locked = tmp_path / "locked"
        locked.mkdir()
        locked.chmod(0o555)
        port = HotReloadServer.find_available_port(start_port=8270)

        finished = _run_cli(
            ["mcp", "-w", str(tmp_path), "-o", str(locked / "target"), "--port", str(port)],
            _stdin(MESSAGES[:1]),
        )

        assert finished.returncode != 0
        assert finished.stdout == ""
        assert "Cannot create the output directory" in finished.stderr
        assert "--working-dir" in finished.stderr
        assert "unexpected error" not in finished.stderr

    def test_a_running_visivo_serve_on_the_port_is_detected(self, tmp_path):
        """`visivo serve` listens on 0.0.0.0, which a bind probe on 127.0.0.1 misses."""
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as taken:
            taken.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            taken.bind(("0.0.0.0", 0))
            taken.listen(1)
            port = taken.getsockname()[1]

            finished = _run_cli(
                ["mcp", "-w", str(tmp_path), "-o", str(tmp_path / "target"), "--port", str(port)],
                _stdin(),
            )

        assert finished.returncode != 0
        assert finished.stdout == ""
        assert f"Port {port} is in use" in finished.stderr
        assert "Review drafts at" not in finished.stderr

    def test_help_still_prints_to_stdout(self):
        finished = _run_cli(["mcp", "--help"])

        assert finished.returncode == 0
        assert "over stdio" in finished.stdout

    def test_it_is_listed_with_the_other_commands(self):
        assert "mcp" in _run_cli(["--help"]).stdout


@pytest.fixture
def no_http_server(monkeypatch):
    served = []
    monkeypatch.setattr(HotReloadServer, "serve", lambda self, **kwargs: served.append(kwargs))
    monkeypatch.setattr(phase, "web_app_started", lambda server, port: True)
    return served


def _phase(tmp_path, reader, port=None):
    writer = io.StringIO()
    phase.mcp_phase(
        output_dir=str(tmp_path / "target"),
        working_dir=str(tmp_path),
        default_source=None,
        threads=1,
        dbt_profile=None,
        dbt_target=None,
        no_deprecation_warnings=True,
        host=None,
        port=port or HotReloadServer.find_available_port(start_port=8300),
        reader=reader,
        writer=writer,
    )
    return [json.loads(line) for line in writer.getvalue().splitlines()]


class TestThePhase:
    def test_it_answers_until_stdin_closes(self, tmp_path, no_http_server):
        replies = _phase(tmp_path, io.StringIO(_stdin()))

        assert [reply["id"] for reply in replies] == [1, 2, 3]

    def test_the_web_app_is_served_on_localhost_only(self, tmp_path, no_http_server):
        _phase(tmp_path, io.StringIO(""), port=8391)

        assert len(no_http_server) == 1
        assert no_http_server[0]["host"] == "127.0.0.1"
        assert no_http_server[0]["port"] == 8391
        assert callable(no_http_server[0]["on_server_ready"])

    def test_a_port_in_use_is_refused_with_the_way_out(self, tmp_path, no_http_server):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as taken:
            taken.bind(("127.0.0.1", 0))
            taken.listen(1)
            port = taken.getsockname()[1]

            with pytest.raises(click.ClickException) as refused:
                _phase(tmp_path, io.StringIO(_stdin()), port=port)

        assert f"http://localhost:{port}/api/mcp/" in refused.value.message
        assert "--port" in refused.value.message
        assert no_http_server == []

    @pytest.mark.parametrize("listen_on", ["127.0.0.1", "0.0.0.0"])
    def test_port_is_free_sees_a_listener_on_any_address(self, listen_on):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as taken:
            taken.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            taken.bind((listen_on, 0))
            port = taken.getsockname()[1]
            assert phase.port_is_free(port) is True
            taken.listen(1)

            assert phase.port_is_free(port) is False

    def test_port_is_free_sees_a_listener_on_ipv6_localhost(self):
        if not socket.has_ipv6:
            pytest.skip("no IPv6 on this machine")
        with socket.socket(socket.AF_INET6, socket.SOCK_STREAM) as taken:
            taken.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
            try:
                taken.bind(("::1", 0))
            except OSError:
                pytest.skip("no IPv6 loopback on this machine")
            taken.listen(1)

            assert phase.port_is_free(taken.getsockname()[1]) is False

    def test_a_web_app_that_does_not_start_stops_the_command(self, tmp_path, monkeypatch):
        """The command must not send a person to a URL it does not serve."""
        stopped = []
        monkeypatch.setattr(HotReloadServer, "serve", lambda self, **kwargs: None)
        monkeypatch.setattr(HotReloadServer, "stop", lambda self: stopped.append(True))
        monkeypatch.setattr(phase, "WEB_APP_START_TIMEOUT_S", 0.2)
        port = HotReloadServer.find_available_port(start_port=8350)

        with pytest.raises(click.ClickException) as refused:
            _phase(tmp_path, io.StringIO(_stdin()), port=port)

        assert f"did not start on port {port}" in refused.value.message
        assert "--port" in refused.value.message
        assert stopped == [True]

    def test_a_failed_bind_is_reported_at_once(self):
        class Server:
            start_error = SystemExit(1)

        port = HotReloadServer.find_available_port(start_port=8370)

        assert phase.web_app_started(Server(), port, timeout=30) is False

    def test_the_web_app_counts_as_started_when_it_answers(self):
        class Server:
            start_error = None

        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as up:
            up.bind(("127.0.0.1", 0))
            up.listen(1)

            assert phase.web_app_started(Server(), up.getsockname()[1], timeout=5) is True

    def test_the_server_records_why_it_could_not_start(self, monkeypatch):
        from flask import Flask

        server = HotReloadServer(Flask(__name__), on_project_change=None, watch_path=".")

        def refuse(*args, **kwargs):
            raise SystemExit(1)

        monkeypatch.setattr(server.socketio, "run", refuse)
        monkeypatch.setattr("threading.excepthook", lambda args: None)

        server.run_server("127.0.0.1", 1)
        server.server_thread.join(timeout=5)

        assert isinstance(server.start_error, SystemExit)

    def test_the_server_is_stopped_when_the_loop_fails(self, tmp_path, no_http_server, monkeypatch):
        stopped = []
        monkeypatch.setattr(HotReloadServer, "stop", lambda self: stopped.append(True))

        def explode(app, reader, writer):
            raise RuntimeError("stdin broke")

        monkeypatch.setattr(phase, "serve_stdio", explode)

        with pytest.raises(RuntimeError):
            _phase(tmp_path, io.StringIO(""))

        assert stopped == [True]
