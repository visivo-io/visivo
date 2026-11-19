from visivo.agent.mcp_dispatch import respond


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
