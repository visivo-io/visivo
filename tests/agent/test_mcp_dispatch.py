import pytest

from visivo.agent.mcp_dispatch import internal_error, respond


def test_ping_is_answered_with_an_empty_result(integration_app):
    reply = respond(integration_app, {"jsonrpc": "2.0", "id": 7, "method": "ping"})

    assert reply == {"jsonrpc": "2.0", "id": 7, "result": {}}


def test_a_notification_takes_no_reply(integration_app):
    assert respond(integration_app, {"jsonrpc": "2.0", "method": "notifications/x"}) is None


def test_a_message_that_is_not_an_object_is_a_parse_error(integration_app):
    assert respond(integration_app, [1, 2])["error"]["code"] == -32700


def test_a_message_with_no_method_is_an_invalid_request(integration_app):
    reply = respond(integration_app, {"jsonrpc": "2.0", "id": 3})

    assert reply["id"] == 3
    assert reply["error"]["code"] == -32600


@pytest.mark.parametrize("method", ["tools/list", "tools/call", "ping", "no/such"])
def test_a_message_with_no_id_takes_no_reply_whatever_its_method(integration_app, method):
    assert respond(integration_app, {"jsonrpc": "2.0", "method": method}) is None


def test_a_null_id_is_still_answered(integration_app):
    reply = respond(integration_app, {"jsonrpc": "2.0", "id": None, "method": "ping"})

    assert reply == {"jsonrpc": "2.0", "id": None, "result": {}}


@pytest.mark.parametrize("method", ["tools/call", "resources/read", "tools/list"])
@pytest.mark.parametrize("params", ["oops", ["a"], 3])
def test_params_that_are_not_an_object_are_invalid_params(integration_app, method, params):
    reply = respond(
        integration_app, {"jsonrpc": "2.0", "id": 8, "method": method, "params": params}
    )

    assert reply["id"] == 8
    assert reply["error"]["code"] == -32602


def test_arguments_that_are_not_an_object_are_invalid_params(integration_app):
    params = {"name": "list_sources", "arguments": "oops"}
    reply = respond(
        integration_app, {"jsonrpc": "2.0", "id": 9, "method": "tools/call", "params": params}
    )

    assert reply["id"] == 9
    assert reply["error"]["code"] == -32602


def test_null_params_and_null_arguments_still_call_the_tool(integration_app):
    params = {"name": "list_sources", "arguments": None}
    reply = respond(
        integration_app, {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": params}
    )

    assert reply["result"]["isError"] is False
    assert "result" in respond(
        integration_app, {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": None}
    )


def test_an_internal_error_names_the_id_and_a_notification_gets_none():
    reply = internal_error({"id": 4, "method": "tools/list"}, RuntimeError("boom"))

    assert reply == {
        "jsonrpc": "2.0",
        "id": 4,
        "error": {"code": -32603, "message": "RuntimeError: boom"},
    }
    assert internal_error({"method": "tools/list"}, RuntimeError("boom")) is None
    assert internal_error(None, RuntimeError("boom")) is None
