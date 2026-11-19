"""MCP over HTTP — the bring-your-own-agent half (VIS-1335).

Transport, and nothing else. ``visivo.agent.mcp_dispatch`` answers the
messages, and the stdio command shares it. Every behaviour lives in
``visivo.agent.tools``; if something has to be implemented here rather than
there, the registry is wrong. That is the whole point of putting it on ``visivo serve``: the endpoint
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
"""

from flask import jsonify, request

from visivo.agent.actions import log as action_log
from visivo.agent.mcp_dispatch import respond


def register_mcp_views(app, flask_app):
    @app.route("/api/agent/actions/", methods=["GET"])
    @app.route("/api/projects/<project_id>/agent/actions/", methods=["GET"])
    def agent_actions_api(project_id=None):
        """What agents have done this session, newest first.

        Read-only, and the Agent tab's source: an action is fetchable, so its
        topic polls the same way runs do rather than needing a push channel to
        exist first.

        Dual-mounted so the project-scoped path core can serve works here too —
        `visivo serve` hosts one project and ignores the id.
        """
        try:
            limit = int(request.args.get("limit", 100))
        except (TypeError, ValueError):
            limit = 100
        return jsonify({"actions": action_log().recent(max(1, min(limit, 500)))})

    @app.route("/api/mcp/", methods=["POST"])
    def mcp_api():
        reply = respond(flask_app, request.get_json(silent=True))
        if reply is None:
            return "", 202
        return jsonify(reply)
