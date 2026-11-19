"""MCP over stdio: one JSON-RPC message per line in, one per line out.

Transport only. ``visivo.agent.mcp_dispatch`` answers each message, as it does
for the HTTP endpoint.
"""

import json

from visivo.agent.mcp_dispatch import respond


def serve_stdio(app, reader, writer):
    """Answer messages from ``reader`` on ``writer`` until ``reader`` closes."""
    for line in reader:
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
        except ValueError:
            payload = None
        reply = respond(app, payload)
        if reply is not None:
            writer.write(json.dumps(reply, default=str) + "\n")
            writer.flush()
