"""One JSON-RPC message in, one reply out, for every local MCP transport.

The HTTP endpoint and the stdio command both answer through ``respond``, so a
method, an error code or a tool result cannot differ between them. A transport
reads a message, calls ``respond`` and writes what comes back.

A tool that raises is reported as a tool RESULT with ``isError``, not a
JSON-RPC error: an error result is something the model can read and correct.
"""

from visivo.agent.actions import attributed_to
from visivo.agent.images import is_image_result
from visivo.agent.mcp_protocol import (
    initialize,
    json_content,
    read_resource,
    resource_list,
    tool_error,
    tool_list,
)
from visivo.agent.tools import ToolError, call

PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602


def respond(app, payload):
    """The reply to one decoded message, or ``None`` when it takes no reply."""
    if not isinstance(payload, dict):
        return _error(None, PARSE_ERROR, "Expected a JSON-RPC object.")

    method = payload.get("method")
    request_id = payload.get("id")
    if not isinstance(method, str):
        return _error(request_id, INVALID_REQUEST, "Missing 'method'.")

    if request_id is None and method.startswith("notifications/"):
        return None

    if method == "initialize":
        return _result(request_id, initialize())
    if method == "ping":
        return _result(request_id, {})
    if method == "resources/list":
        return _result(request_id, {"resources": resource_list()})
    if method == "resources/read":
        # A resource that does not exist is the caller getting the protocol
        # wrong, not a tool refusing, so it is a JSON-RPC error.
        try:
            return _result(request_id, read_resource(payload.get("params") or {}))
        except ToolError as refused:
            return _error(request_id, INVALID_PARAMS, str(refused))
    if method == "tools/list":
        return _result(request_id, {"tools": tool_list()})
    if method == "tools/call":
        return _result(request_id, _call(app, payload.get("params") or {}))

    return _error(request_id, METHOD_NOT_FOUND, f"Unknown method '{method}'.")


def _call(app, params):
    name = params.get("name")
    arguments = params.get("arguments") or {}
    try:
        with attributed_to("mcp"):
            value = call(app, name, arguments)
    except ToolError as refused:
        return tool_error(str(refused))
    except Exception as unexpected:  # noqa: BLE001 — reported, never raised on
        return tool_error(f"{type(unexpected).__name__}: {unexpected}")
    if is_image_result(value):
        return {"content": _image_content(value), "isError": False}
    return {"content": [json_content(value)], "isError": False}


def _image_content(result):
    """The facts as JSON, then the caption and the image as content blocks.

    JSON-encoding the ``ToolReturn`` itself would hand the client the PNG bytes
    as a several-hundred-kilobyte string it rejects as too large to read.
    """
    import base64

    from pydantic_ai.messages import BinaryContent

    blocks = [json_content(result.return_value)]
    for item in result.content:
        if isinstance(item, BinaryContent):
            data = base64.b64encode(item.data).decode("ascii")
            blocks.append({"type": "image", "data": data, "mimeType": item.media_type})
        else:
            blocks.append({"type": "text", "text": str(item)})
    return blocks


def _result(request_id, result):
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _error(request_id, code, message):
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}
