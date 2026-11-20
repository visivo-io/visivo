"""MCP over stdio (VIS-1809).

Transport only: framing, and that the answers are the HTTP endpoint's answers.
"""

import io
import json

import pytest

from tests.contracts.mcp_parity import check, load_cases
from visivo.agent.mcp_stdio import serve_stdio
from visivo.agent.tools import TOOLS

CASES = load_cases()


def _exchange(app, *messages):
    lines = [m if isinstance(m, str) else json.dumps(m) for m in messages]
    writer = io.StringIO()
    serve_stdio(app, io.StringIO("".join(line + "\n" for line in lines)), writer)
    return writer.getvalue()


def _replies(app, *messages):
    return [json.loads(line) for line in _exchange(app, *messages).splitlines()]


def _request(method, params=None, request_id=1):
    body = {"jsonrpc": "2.0", "id": request_id, "method": method}
    if params is not None:
        body["params"] = params
    return body


class TestFraming:
    def test_each_request_gets_one_line_in_order(self, integration_app):
        replies = _replies(
            integration_app,
            _request("initialize", request_id=1),
            _request("tools/list", request_id="two"),
        )

        assert [reply["id"] for reply in replies] == [1, "two"]
        assert replies[0]["result"]["serverInfo"]["name"] == "visivo"

    def test_a_notification_gets_no_line(self, integration_app):
        output = _exchange(
            integration_app, {"jsonrpc": "2.0", "method": "notifications/initialized"}
        )

        assert output == ""

    def test_a_blank_line_is_skipped(self, integration_app):
        replies = _replies(integration_app, "", "   ", _request("ping"))

        assert replies == [{"jsonrpc": "2.0", "id": 1, "result": {}}]

    def test_a_line_that_is_not_json_is_a_parse_error_and_the_loop_goes_on(self, integration_app):
        replies = _replies(integration_app, "{not json", _request("ping", request_id=2))

        assert replies[0]["error"]["code"] == -32700
        assert replies[0]["id"] is None
        assert replies[1] == {"jsonrpc": "2.0", "id": 2, "result": {}}

    def test_malformed_params_cost_one_reply_not_the_session(self, integration_app):
        replies = _replies(
            integration_app,
            {"jsonrpc": "2.0", "id": 8, "method": "tools/call", "params": "oops"},
            _request("ping", request_id=9),
        )

        assert replies[0]["id"] == 8
        assert replies[0]["error"]["code"] == -32602
        assert replies[1] == {"jsonrpc": "2.0", "id": 9, "result": {}}

    def test_a_message_that_raises_is_an_internal_error_and_the_loop_goes_on(
        self, integration_app, monkeypatch
    ):
        from visivo.agent import mcp_dispatch

        def explode():
            raise RuntimeError("registry broke")

        monkeypatch.setattr(mcp_dispatch, "tool_list", explode)

        replies = _replies(
            integration_app,
            _request("tools/list", request_id=5),
            {"jsonrpc": "2.0", "method": "tools/list"},
            _request("ping", request_id=6),
        )

        assert replies[0]["id"] == 5
        assert replies[0]["error"]["code"] == -32603
        assert "registry broke" in replies[0]["error"]["message"]
        assert replies[1] == {"jsonrpc": "2.0", "id": 6, "result": {}}
        assert len(replies) == 2

    def test_a_request_without_an_id_gets_no_line(self, integration_app):
        assert _exchange(integration_app, {"jsonrpc": "2.0", "method": "tools/list"}) == ""

    def test_a_reply_never_spans_lines(self, integration_app):
        """The transport forbids an embedded newline, and skills are full of them."""
        output = _exchange(
            integration_app,
            _request("tools/call", {"name": "read_skill", "arguments": {"name": "build-a-model"}}),
        )

        assert output.endswith("\n")
        assert output.count("\n") == 1
        assert "\\n" in output

    def test_each_reply_is_flushed(self, integration_app):
        class Writer(io.StringIO):
            flushes = 0

            def flush(self):
                self.flushes += 1

        writer = Writer()
        reader = io.StringIO(json.dumps(_request("ping")) + "\n")
        serve_stdio(integration_app, reader, writer)

        assert writer.flushes == 1


class TestItServesTheSameTools:
    def test_the_registry_whole(self, integration_app):
        listed = _replies(integration_app, _request("tools/list"))[0]["result"]["tools"]

        assert {tool["name"] for tool in listed} == set(TOOLS)

    def test_tools_list_is_the_http_endpoints_answer(self, integration_app, integration_client):
        over_http = json.loads(
            integration_client.post("/api/mcp/", json=_request("tools/list")).data
        )

        assert _replies(integration_app, _request("tools/list")) == [over_http]

    def test_a_write_lands_in_the_same_draft_tier(self, integration_app):
        config = {"name": "from_stdio", "sql": "select 1 as x"}
        reply = _replies(
            integration_app,
            _request("tools/call", {"name": "write_model", "arguments": {"config": config}}),
        )[0]

        assert reply["result"]["isError"] is False, reply
        assert integration_app.model_manager.get("from_stdio") is not None

    def test_a_refused_tool_is_an_error_result(self, integration_app):
        reply = _replies(
            integration_app,
            _request("tools/call", {"name": "get_source", "arguments": {"name": "nope"}}),
        )[0]

        assert reply["result"]["isError"] is True


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_stdio_satisfies_the_parity_contract(case, integration_app):
    """A reply stands in for HTTP 200, and no reply for the empty 202."""
    replies = _replies(integration_app, case["request"])
    status, body = (200, replies[0]) if replies else (202, None)

    problems = check(case, status, body, set(TOOLS))

    assert not problems, "\n".join(problems)
