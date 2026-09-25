"""Gemini's generateContent API, over plain HTTP.

Two differences from Anthropic that the loop must not have to know about:
Gemini's `parameters` is an OpenAPI subset rather than JSON Schema, and it
matches a function response to its call by NAME, not by id.
"""

import uuid

from visivo.agent.providers.reply import Reply, ToolCall

NAME = "gemini"
API_KEY_ENV = "GEMINI_API_KEY"
DEFAULT_MODEL = "gemini-2.5-pro"
BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

# Keys JSON Schema allows and Gemini's OpenAPI subset rejects. Our tool schemas
# are hand-built and flat, so this is a guard against a future schema picking up
# a validation keyword rather than a transformation anything depends on today.
_UNSUPPORTED = frozenset(
    {"$schema", "$ref", "$defs", "additionalProperties", "definitions", "examples"}
)


def endpoint(model, api_key):
    """(url, headers). The model is part of the path here, and the key is a
    query parameter rather than a header — both hidden behind this so the loop
    builds every provider's call the same way."""
    return (
        f"{BASE_URL}/{model or DEFAULT_MODEL}:generateContent?key={api_key}",
        {"content-type": "application/json"},
    )


def _openapi(schema):
    if not isinstance(schema, dict):
        return schema
    cleaned = {}
    for key, value in schema.items():
        if key in _UNSUPPORTED:
            continue
        if key == "properties" and isinstance(value, dict):
            cleaned[key] = {k: _openapi(v) for k, v in value.items()}
        elif isinstance(value, dict):
            cleaned[key] = _openapi(value)
        else:
            cleaned[key] = value
    return cleaned


def build_request(model, system, messages, tools, max_tokens):
    """`system` is its own field here, not a message — and an empty
    `properties` makes Gemini reject the declaration, so a no-argument tool
    sends no parameters at all."""
    declarations = []
    for tool in tools:
        declaration = {"name": tool.name, "description": tool.description}
        parameters = _openapi(tool.input_schema)
        if parameters.get("properties"):
            declaration["parameters"] = parameters
        declarations.append(declaration)

    return {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": messages,
        "tools": [{"functionDeclarations": declarations}],
        "generationConfig": {"maxOutputTokens": max_tokens},
    }


def parse_reply(payload):
    candidates = payload.get("candidates") or []
    parts = (candidates[0].get("content") or {}).get("parts") or [] if candidates else []
    text = []
    calls = []
    for part in parts:
        if "text" in part:
            text.append(part.get("text") or "")
        elif "functionCall" in part:
            function = part["functionCall"] or {}
            name = function.get("name") or ""
            calls.append(
                ToolCall(
                    # Gemini sends no id; the loop matches results to calls by
                    # name, so one is minted to keep the Reply shape uniform.
                    id=f"{name}-{uuid.uuid4().hex[:8]}",
                    name=name,
                    arguments=function.get("args") or {},
                )
            )
    return Reply(text="".join(text), tool_calls=calls, raw=payload)


def assistant_message(reply):
    candidates = reply.raw.get("candidates") or []
    if not candidates:
        return {"role": "model", "parts": []}
    return {"role": "model", "parts": (candidates[0].get("content") or {}).get("parts") or []}


def tool_result_message(results):
    """Gemini wants a `response` OBJECT, not a string — a bare value is
    rejected, so a non-dict result is wrapped."""
    return {
        "role": "user",
        "parts": [
            {
                "functionResponse": {
                    "name": call.name,
                    "response": (
                        value
                        if isinstance(value, dict)
                        else {"error": value} if is_error else {"result": value}
                    ),
                }
            }
            for call, value, is_error in results
        ],
    }


def user_message(text):
    return {"role": "user", "parts": [{"text": text}]}
