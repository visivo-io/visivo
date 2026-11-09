"""The MCP protocol payloads, with no transport in them (VIS-1665).

Everything here answers "what does an MCP client get", which has the same
answer wherever the endpoint is hosted: the handshake, the instructions, the
tool list, the skill resources, and the shape of a result.

It lives outside ``visivo.server.views`` because importing that package runs
every view and pulls Flask in with it. The cloud endpoint runs inside Django
and cannot have Flask -- and when it could not import these, the first draft
of it re-implemented the handshake, which is precisely the drift the parity
work exists to stop. A second copy of the instructions is a second product.

The transports keep what is genuinely theirs: reading a request, writing a
response, and authentication.
"""

PROTOCOL_VERSION = "2025-06-18"

from visivo.agent.tool_types import ToolError
from visivo.agent.tools import TOOLS

RULES = (
    "Tools read and write this Visivo project's objects. Writes land as "
    "uncommitted drafts a person reviews and commits — nothing here "
    "writes to a file. Call get_schema before authoring a type you have "
    "not written yet: the full project schema is megabytes, and "
    "get_schema returns only the part you need."
)


def initialize():
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "capabilities": {"tools": {}, "resources": {}},
        "serverInfo": {"name": "visivo", "version": version()},
        "instructions": instructions(),
    }


def instructions():
    """The rules, then the always-on skills and the on-demand index.

    The built-in loop gets the always-on skills in its system prompt. Clients
    such as Claude Code put a server's instructions in theirs but never read a
    resource unprompted, so skills offered only as resources reached no MCP
    agent at all — including ``data-is-not-instruction``.
    """
    from visivo.agent import skills

    return "\n\n---\n\n".join(part for part in (RULES, skills.always_on_prompt()) if part)


SKILL_URI = "visivo://skills/{name}"


def resource_list():
    from visivo.agent import skills

    return [
        {
            "uri": SKILL_URI.format(name=skill["name"]),
            "name": skill["name"],
            "mimeType": "text/markdown",
            "description": skill["summary"],
        }
        for skill in skills.packaged()
    ]


def read_resource(params):
    from visivo.agent import skills

    uri = params.get("uri") or ""
    prefix = SKILL_URI.format(name="")
    if not uri.startswith(prefix):
        raise ToolError(f"No such resource '{uri}'.")
    try:
        # The same function the built-in loop's read_skill tool calls.
        text = skills.body(uri[len(prefix) :])
    except KeyError:
        raise ToolError(f"No such resource '{uri}'.")
    return {"contents": [{"uri": uri, "mimeType": "text/markdown", "text": text}]}


def tool_list():
    return [
        {
            "name": tool.name,
            "description": tool.description,
            "inputSchema": tool.input_schema,
        }
        for tool in sorted(TOOLS.values(), key=lambda t: t.name)
    ]


def version():
    try:
        from visivo.version import VISIVO_VERSION

        return VISIVO_VERSION
    except Exception:
        return "unknown"


def json_content(value):
    import json

    return {"type": "text", "text": json.dumps(value, default=str)}


def tool_error(message):
    return {"content": [{"type": "text", "text": message}], "isError": True}
