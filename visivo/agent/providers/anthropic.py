"""Anthropic's Messages API, over plain HTTP.

No SDK, for the same reason `mcp_views` carries no MCP SDK: the wire format is
small, and the package would be weight in an executable that is being measured.
`requests` is already a dependency.
"""

import json
import uuid

from visivo.agent.providers.reply import Reply, ToolCall

NAME = "anthropic"
API_KEY_ENV = "ANTHROPIC_API_KEY"
DEFAULT_MODEL = "claude-sonnet-4-5"
URL = "https://api.anthropic.com/v1/messages"
VERSION = "2023-06-01"


def endpoint(model, api_key):
    """(url, headers). The model rides in the body here; Gemini puts it in the
    path. The loop is handed both halves so it never learns which."""
    return URL, {
        "x-api-key": api_key,
        "anthropic-version": VERSION,
        "content-type": "application/json",
    }


def build_request(model, system, messages, tools, max_tokens):
    """Our registry's tool shape is already Anthropic's, less the key name."""
    return {
        "model": model or DEFAULT_MODEL,
        "max_tokens": max_tokens,
        "system": system,
        "messages": messages,
        "tools": [
            {
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.input_schema,
            }
            for tool in tools
        ],
    }


def parse_reply(payload):
    text = []
    calls = []
    for block in payload.get("content") or []:
        if block.get("type") == "text":
            text.append(block.get("text") or "")
        elif block.get("type") == "tool_use":
            calls.append(
                ToolCall(
                    id=block.get("id") or str(uuid.uuid4()),
                    name=block.get("name") or "",
                    arguments=block.get("input") or {},
                )
            )
    return Reply(text="".join(text), tool_calls=calls, raw=payload)


def assistant_message(reply):
    """Echo the turn back verbatim. The API rejects a tool result whose
    `tool_use` it never saw, so the assistant turn has to be replayed exactly
    as it arrived rather than rebuilt from the normalised Reply."""
    return {"role": "assistant", "content": reply.raw.get("content") or []}


def tool_result_message(results):
    """Every result for a turn goes in ONE user message. Anthropic rejects a
    turn that answers only some of the tool_use blocks it was sent."""
    return {
        "role": "user",
        "content": [
            {
                "type": "tool_result",
                "tool_use_id": call.id,
                "content": value if isinstance(value, str) else json.dumps(value),
                **({"is_error": True} if is_error else {}),
            }
            for call, value, is_error in results
        ],
    }


def user_message(text):
    return {"role": "user", "content": text}
