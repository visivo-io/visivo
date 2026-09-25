"""The MCP endpoint (VIS-1335).

Transport only, so these check the envelope and the boundary — not what the
tools do, which is tests/agent/test_tools.py's job. If a behaviour had to be
asserted here rather than there, the registry would be wrong.
"""

import json
import os

import pytest

from visivo.agent.tools import TOOLS


def _rpc(client, method, params=None, request_id=1):
    body = {"jsonrpc": "2.0", "id": request_id, "method": method}
    if params is not None:
        body["params"] = params
    return client.post("/api/mcp/", json=body)


def _result(response):
    assert response.status_code == 200, response.data
    payload = json.loads(response.data)
    assert payload["jsonrpc"] == "2.0"
    assert "error" not in payload, payload["error"]
    return payload["result"]


def _tool_text(result):
    assert result["content"][0]["type"] == "text"
    return result["content"][0]["text"]


class TestTheHandshake:
    def test_initialize_advertises_tools(self, integration_client):
        result = _result(_rpc(integration_client, "initialize"))

        assert "tools" in result["capabilities"]
        assert result["serverInfo"]["name"] == "visivo"
        assert result["protocolVersion"]

    def test_it_tells_the_agent_the_rules_up_front(self, integration_client):
        """Two things an agent cannot infer: writes are drafts, and the whole
        schema is too big to ask for."""
        instructions = _result(_rpc(integration_client, "initialize"))["instructions"]

        assert "draft" in instructions
        assert "get_schema" in instructions

    def test_a_notification_gets_no_body(self, integration_client):
        response = integration_client.post(
            "/api/mcp/",
            json={"jsonrpc": "2.0", "method": "notifications/initialized"},
        )

        assert response.status_code == 202
        assert response.data == b""


class TestListing:
    def test_it_serves_the_registry_whole(self, integration_client):
        listed = _result(_rpc(integration_client, "tools/list"))["tools"]

        assert {t["name"] for t in listed} == set(TOOLS)

    def test_each_tool_arrives_in_the_shape_a_client_expects(self, integration_client):
        for tool in _result(_rpc(integration_client, "tools/list"))["tools"]:
            assert tool["description"].strip()
            assert tool["inputSchema"]["type"] == "object"

    def test_still_no_commit_tool_over_the_wire(self, integration_client):
        """The safety rule has to hold at the surface an agent actually sees,
        not only in the registry it is built from."""
        listed = _result(_rpc(integration_client, "tools/list"))["tools"]

        assert not [t for t in listed if "commit" in t["name"]]


class TestCalling:
    def test_a_read_comes_back_as_json_text(self, integration_client, integration_app):
        source = integration_app.source_manager.get_all_objects_list()[0]

        result = _result(
            _rpc(
                integration_client,
                "tools/call",
                {"name": "get_source", "arguments": {"name": source.name}},
            )
        )

        assert result["isError"] is False
        assert json.loads(_tool_text(result))["name"] == source.name

    def test_a_write_lands_as_a_draft(self, integration_client, integration_app):
        _result(
            _rpc(
                integration_client,
                "tools/call",
                {
                    "name": "write_markdown",
                    "arguments": {"config": {"name": "via-mcp", "content": "# hi"}},
                },
            )
        )

        assert "via-mcp" in integration_app.markdown_manager.cached_objects

    def test_and_writes_no_file(self, integration_client, output_dir):
        before = _yaml_files(output_dir)

        _rpc(
            integration_client,
            "tools/call",
            {
                "name": "write_markdown",
                "arguments": {"config": {"name": "via-mcp", "content": "# hi"}},
            },
        )

        assert _yaml_files(output_dir) == before

    def test_get_schema_is_reachable_over_the_wire(self, integration_client):
        result = _result(
            _rpc(
                integration_client,
                "tools/call",
                {"name": "get_schema", "arguments": {"type": "model"}},
            )
        )

        sliced = json.loads(_tool_text(result))
        assert "SqlModel" in sliced["$defs"]
        assert len(_tool_text(result)) / 1024 < 10


class TestWhenSomethingIsWrong:
    """A refusal is a tool RESULT, not a JSON-RPC error. A JSON-RPC error ends
    the call; an error result is something the model can read and correct."""

    def test_a_refused_tool_is_an_error_result(self, integration_client):
        result = _result(
            _rpc(
                integration_client,
                "tools/call",
                {"name": "get_source", "arguments": {"name": "nope"}},
            )
        )

        assert result["isError"] is True
        assert "nope" in _tool_text(result)

    def test_an_invalid_config_explains_itself(self, integration_client):
        result = _result(
            _rpc(
                integration_client,
                "tools/call",
                {"name": "write_markdown", "arguments": {"config": {"name": "bad"}}},
            )
        )

        assert result["isError"] is True
        assert _tool_text(result)

    def test_an_unknown_tool_is_too(self, integration_client):
        result = _result(_rpc(integration_client, "tools/call", {"name": "fly", "arguments": {}}))

        assert result["isError"] is True

    def test_an_unknown_method_is_a_protocol_error(self, integration_client):
        """That one IS the protocol's business, not a tool's."""
        response = _rpc(integration_client, "tools/teleport")

        payload = json.loads(response.data)
        assert payload["error"]["code"] == -32601

    def test_a_body_that_is_not_json_rpc_says_so(self, integration_client):
        response = integration_client.post("/api/mcp/", json=[1, 2, 3])

        assert json.loads(response.data)["error"]["code"] == -32700


def _yaml_files(output_dir):
    root = os.path.dirname(os.path.abspath(output_dir))
    found = {}
    for directory, _, names in os.walk(root):
        for name in names:
            if name.endswith((".visivo.yml", ".visivo.yaml")):
                path = os.path.join(directory, name)
                with open(path, "rb") as handle:
                    found[path] = handle.read()
    return found
