"""MCP over the tool registry — the bring-your-own-agent half (VIS-1335).

Transport, and nothing else. Every behaviour lives in ``visivo.agent.tools``;
if something has to be implemented here rather than there, the registry is
wrong. That is the whole point of putting it on ``visivo serve``: the endpoint
in front of the managers is the same shape locally and, later, in cloud —
differing only in host and auth.

The agent's writes stop at the draft tier. The filesystem is still written, by
the server, on commit, through ``ProjectWriter`` — a human's decision, not an
agent's.

## Why not the MCP SDK

The wire surface an HTTP MCP server needs is three JSON-RPC methods, and the
SDK brings a second web framework (starlette/uvicorn) into a Flask app to get
them. The trade is a dependency and a server-inside-a-server against writing
the envelope out. The envelope is written out.

A consequence to accept: a tool that raises is reported as a tool RESULT with
``isError``, not a JSON-RPC error. That is what the protocol asks for, and it
is also what an agent needs — a JSON-RPC error ends the call, while an error
result is something the model can read and correct.
"""

from flask import jsonify, request

from visivo.agent.tools import TOOLS, ToolError, call

PROTOCOL_VERSION = "2025-06-18"

# JSON-RPC 2.0
_PARSE_ERROR = -32700
_INVALID_REQUEST = -32600
_METHOD_NOT_FOUND = -32601


def register_mcp_views(app, flask_app):
    @app.route("/api/mcp/", methods=["POST"])
    def mcp_api():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return _error(None, _PARSE_ERROR, "Expected a JSON-RPC object.")

        method = payload.get("method")
        request_id = payload.get("id")
        if not isinstance(method, str):
            return _error(request_id, _INVALID_REQUEST, "Missing 'method'.")

        # A notification has no id and takes no response body.
        if request_id is None and method.startswith("notifications/"):
            return "", 202

        if method == "initialize":
            return _result(request_id, _initialize())
        if method == "tools/list":
            return _result(request_id, {"tools": _tool_list()})
        if method == "tools/call":
            return _result(request_id, _call(flask_app, payload.get("params") or {}))

        return _error(request_id, _METHOD_NOT_FOUND, f"Unknown method '{method}'.")


def _initialize():
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "capabilities": {"tools": {}},
        "serverInfo": {"name": "visivo", "version": _version()},
        "instructions": (
            "Tools read and write this Visivo project's objects. Writes land as "
            "uncommitted drafts a person reviews and commits — nothing here "
            "writes to a file. Call get_schema before authoring a type you have "
            "not written yet: the full project schema is megabytes, and "
            "get_schema returns only the part you need."
        ),
    }


def _tool_list():
    return [
        {
            "name": tool.name,
            "description": tool.description,
            "inputSchema": tool.input_schema,
        }
        for tool in sorted(TOOLS.values(), key=lambda t: t.name)
    ]


def _call(flask_app, params):
    name = params.get("name")
    arguments = params.get("arguments") or {}
    try:
        value = call(flask_app, name, arguments)
    except ToolError as refused:
        return _tool_error(str(refused))
    except Exception as unexpected:  # noqa: BLE001 — reported, never raised on
        # Anything the agent could not have anticipated still comes back as a
        # result: a 500 tells it nothing, and the session is worth keeping.
        return _tool_error(f"{type(unexpected).__name__}: {unexpected}")
    return {"content": [_json_content(value)], "isError": False}


def _json_content(value):
    import json

    return {"type": "text", "text": json.dumps(value, default=str)}


def _tool_error(message):
    return {"content": [{"type": "text", "text": message}], "isError": True}


def _version():
    try:
        from visivo.version import VISIVO_VERSION

        return VISIVO_VERSION
    except Exception:
        return "unknown"


def _result(request_id, result):
    return jsonify({"jsonrpc": "2.0", "id": request_id, "result": result})


def _error(request_id, code, message):
    return jsonify(
        {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}
    )
