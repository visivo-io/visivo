"""MCP over stdio: one JSON-RPC message per line in, one per line out.

Transport only. ``visivo.agent.mcp_dispatch`` answers each message, as it does
for the HTTP endpoint.
"""

import json

from visivo.agent.mcp_dispatch import internal_error, respond
from visivo.logger.logger import Logger


def serve_stdio(app, reader, writer):
    """Answer messages from ``reader`` on ``writer`` until ``reader`` closes."""
    for line in reader:
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
        except ValueError:
            payload = None
        try:
            reply = respond(app, payload)
        except Exception as unexpected:  # noqa: BLE001 — one message must not end the session
            Logger.instance().error(f"MCP message failed: {unexpected!r}")
            reply = internal_error(payload, unexpected)
        if reply is not None:
            writer.write(json.dumps(reply, default=str) + "\n")
            writer.flush()
