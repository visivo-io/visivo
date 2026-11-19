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


def _run_cli(arguments, stdin="", debug=False):
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

    def test_the_server_is_stopped_when_the_loop_fails(self, tmp_path, no_http_server, monkeypatch):
        stopped = []
        monkeypatch.setattr(HotReloadServer, "stop", lambda self: stopped.append(True))

        def explode(app, reader, writer):
            raise RuntimeError("stdin broke")

        monkeypatch.setattr(phase, "serve_stdio", explode)

        with pytest.raises(RuntimeError):
            _phase(tmp_path, io.StringIO(""))

        assert stopped == [True]
