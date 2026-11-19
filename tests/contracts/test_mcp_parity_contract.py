"""visivo's half of the MCP parity contract.

Core asserts its endpoint against the same cases and the same checker. If a
case had to be written differently for one side, the two endpoints disagree
and that is the finding.
"""

import json

import pytest

from tests.contracts.mcp_parity import annotation_problems, check, load_cases, reads_by_name
from visivo.agent.mcp_protocol import tool_list
from visivo.agent.tool_types import Annotations, Tool, reads, writes
from visivo.agent.tools import TOOLS

CASES = load_cases()


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_the_local_endpoint_satisfies_the_contract(case, integration_client):
    response = integration_client.post("/api/mcp/", json=case["request"])
    body = None
    if response.data:
        body = json.loads(response.data)

    problems = check(case, response.status_code, body, set(TOOLS))

    assert not problems, "\n".join(problems)


def test_the_contract_is_not_empty():
    """A file that loses its cases would pass on both sides forever."""
    assert len(CASES) >= 13


def test_the_contract_checks_annotations():
    assert any(case["expect"].get("tools_are_annotated") for case in CASES)


class TestEveryToolIsAnnotated:
    @pytest.mark.parametrize("name", sorted(TOOLS))
    def test_the_registry_tool_declares_its_annotations(self, name):
        assert isinstance(TOOLS[name].annotations, Annotations), f"{name} has no annotations"

    @pytest.mark.parametrize("listed", tool_list(), ids=lambda tool: tool["name"])
    def test_the_listed_tool_satisfies_the_contract(self, listed):
        assert annotation_problems(listed) == []

    def test_only_the_write_tools_are_not_read_only(self):
        writers = {t["name"] for t in tool_list() if not t["annotations"]["readOnlyHint"]}

        assert writers == {name for name in TOOLS if name.startswith("write_")}

    def test_every_write_tool_is_destructive(self):
        for listed in tool_list():
            if listed["name"].startswith("write_"):
                assert listed["annotations"]["destructiveHint"] is True, listed["name"]


def _listed(name, annotations):
    listed = {"name": name, "description": "x", "inputSchema": {"type": "object"}}
    if annotations:
        listed["title"] = annotations.title
        listed["annotations"] = annotations.as_mcp()
    return listed


class TestTheAnnotationCheckRefuses:
    def test_a_tool_with_no_annotations(self, monkeypatch):
        bare = Tool("get_bare", "A tool.", {"type": "object", "properties": {}}, lambda a, b: {})
        monkeypatch.setitem(TOOLS, "get_bare", bare)
        listed = next(tool for tool in tool_list() if tool["name"] == "get_bare")

        assert annotation_problems(listed) == ["get_bare has no annotations"]

    def test_a_read_named_tool_that_is_not_read_only(self):
        problems = annotation_problems(_listed("list_things", writes("List things", False)))

        assert problems == ["list_things reads, but readOnlyHint is not true"]

    def test_a_write_tool_that_claims_to_be_read_only(self):
        problems = annotation_problems(_listed("write_thing", reads("Write thing")))

        assert problems == ["write_thing writes, but readOnlyHint is not false"]

    def test_a_name_that_is_neither_read_nor_write_style(self):
        problems = annotation_problems(_listed("frobnicate", reads("Frobnicate")))

        assert len(problems) == 1 and "neither a read-style nor a write-style name" in problems[0]

    def test_a_missing_title(self):
        listed = _listed("get_thing", reads("Get thing"))
        del listed["title"]

        assert "get_thing has no title" in annotation_problems(listed)

    def test_a_missing_hint(self):
        listed = _listed("get_thing", reads("Get thing"))
        del listed["annotations"]["openWorldHint"]

        assert annotation_problems(listed) == ["get_thing does not declare openWorldHint"]

    def test_a_read_only_tool_that_is_destructive(self):
        listed = _listed("get_thing", reads("Get thing"))
        listed["annotations"]["destructiveHint"] = True

        assert annotation_problems(listed) == [
            "get_thing is read-only, but destructiveHint is not false"
        ]

    def test_the_whole_case_fails_on_one_bad_tool(self):
        case = next(c for c in CASES if c["expect"].get("tools_are_annotated"))
        bad = {"name": "get_bare", "description": "x", "inputSchema": {"type": "object"}}
        body = {"jsonrpc": "2.0", "id": 1, "result": {"tools": tool_list() + [bad]}}

        assert check(case, 200, body, set()) == [f"{case['name']}: get_bare has no annotations"]


class TestNamesTellReadsFromWrites:
    @pytest.mark.parametrize("name", ["list_models", "get_run", "query_source", "read_skill"])
    def test_read_style(self, name):
        assert reads_by_name(name) is True

    @pytest.mark.parametrize("name", ["write_model", "start_edit", "create_branch"])
    def test_write_style(self, name):
        assert reads_by_name(name) is False

    def test_neither(self):
        assert reads_by_name("frobnicate") is None


def test_annotations_cannot_be_read_only_and_destructive():
    with pytest.raises(ValueError):
        Annotations(title="Both", read_only=True, destructive=True)
