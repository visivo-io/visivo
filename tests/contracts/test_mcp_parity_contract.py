"""visivo's half of the MCP parity contract.

Core asserts its endpoint against the same cases and the same checker. If a
case had to be written differently for one side, the two endpoints disagree
and that is the finding.
"""

import json

import pytest

from tests.contracts.mcp_parity import check, load_cases
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
    assert len(CASES) >= 12
