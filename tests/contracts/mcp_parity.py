"""Checking one MCP parity case, shared by both halves of the contract.

The cases live in `mcp_parity_cases.json`; this is what `expect` means. It is
here rather than in each repo's test because two readings of the same file
that disagree is the drift the contract exists to catch -- the file would stay
green on both sides while they answered differently.

Core imports this from its sibling visivo checkout, the same way it imports
the cases themselves.
"""

import json
from pathlib import Path

CASES_FILE = Path(__file__).with_name("mcp_parity_cases.json")


def load_cases():
    return json.loads(CASES_FILE.read_text())["cases"]


def check(case, status, body, registry_tool_names):
    """Return a list of failures for one case. Empty means it passed.

    `body` is the parsed response, or None for an empty one. Failures are
    sentences rather than assertions so a caller can report every one of them
    at once instead of the first.
    """
    expect = case["expect"]
    where = case["name"]
    problems = []

    if "status" in expect and status != expect["status"]:
        problems.append(f"{where}: status {status}, expected {expect['status']}")
        # Everything below reads the body, which a wrong status makes moot.
        return problems

    if expect.get("empty_body"):
        if body not in (None, "", {}):
            problems.append(f"{where}: expected an empty body, got {body!r}")
        return problems

    if not isinstance(body, dict):
        problems.append(f"{where}: expected a JSON object, got {type(body).__name__}")
        return problems

    if "jsonrpc_error_code" in expect:
        code = (body.get("error") or {}).get("code")
        if code != expect["jsonrpc_error_code"]:
            problems.append(
                f"{where}: JSON-RPC error {code}, expected {expect['jsonrpc_error_code']}"
            )
        return problems

    if "error" in body:
        problems.append(f"{where}: unexpected JSON-RPC error {body['error']}")
        return problems

    result = body.get("result")
    if result is None:
        problems.append(f"{where}: no result")
        return problems

    for key in expect.get("result_keys", []):
        if key not in result:
            problems.append(f"{where}: result has no '{key}'")

    for key, value in (expect.get("result_equals") or {}).items():
        if result.get(key) != value:
            problems.append(f"{where}: {key} is {result.get(key)!r}, expected {value!r}")

    if "server_name" in expect:
        name = (result.get("serverInfo") or {}).get("name")
        if name != expect["server_name"]:
            problems.append(f"{where}: serverInfo.name is {name!r}")

    for fragment in expect.get("instructions_contain", []):
        if fragment not in (result.get("instructions") or ""):
            problems.append(f"{where}: instructions do not mention {fragment!r}")

    if expect.get("lists_every_registry_tool"):
        listed = {tool["name"] for tool in result.get("tools", [])}
        missing = sorted(set(registry_tool_names) - listed)
        if missing:
            problems.append(f"{where}: tools/list omits {missing}")

    if expect.get("tools_are_well_formed"):
        for tool in result.get("tools", []):
            if not tool.get("description"):
                problems.append(f"{where}: {tool.get('name')} has no description")
            schema = tool.get("inputSchema") or {}
            if schema.get("type") != "object":
                problems.append(f"{where}: {tool.get('name')} schema is not an object")
            for required in schema.get("required", []):
                if required not in (schema.get("properties") or {}):
                    problems.append(
                        f"{where}: {tool.get('name')} requires '{required}' "
                        "but does not describe it"
                    )

    for forbidden in expect.get("no_tool_name_contains", []):
        offenders = [t["name"] for t in result.get("tools", []) if forbidden in t["name"]]
        if offenders:
            problems.append(f"{where}: {offenders} would let a client promote work")

    if expect.get("resources_are_skills"):
        resources = result.get("resources", [])
        if not resources:
            problems.append(f"{where}: no resources offered")
        for resource in resources:
            if not str(resource.get("uri", "")).startswith("visivo://skills/"):
                problems.append(f"{where}: {resource.get('uri')!r} is not a skill URI")

    for fragment in expect.get("text_contains", []):
        text = json.dumps(result)
        if fragment not in text:
            problems.append(f"{where}: result does not mention {fragment!r}")

    if "is_error" in expect:
        if bool(result.get("isError")) is not expect["is_error"]:
            problems.append(
                f"{where}: isError is {result.get('isError')!r}, "
                f"expected {expect['is_error']}"
            )

    return problems
