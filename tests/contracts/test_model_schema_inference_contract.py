"""The visivo half of the cross-repo model-schema inference contract.

core reimplements this inference (it cannot import visivo — only the runner
image ships it), so the two can drift silently: both stay green while answering
differently, and the symptom in production is a column list that is right
locally and wrong in cloud, with nothing logged.

``model_schema_inference_cases.json`` is the shared source of truth. This file
asserts visivo's implementation against it;
``core/api/apps/deploys/tests/test_model_schema_contract.py`` asserts core's
against the same file, read from a sibling ``../visivo`` checkout.

Add a case there when you change inference in either repo.
"""

import json
from pathlib import Path

import pytest

from visivo.query.model_schema_inference import infer_model_columns

CASES_FILE = Path(__file__).parent / "model_schema_inference_cases.json"
CASES = json.loads(CASES_FILE.read_text())["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_inference_matches_the_shared_contract(case):
    columns = infer_model_columns(
        sql=case["sql"],
        sqlglot_dialect=case["dialect"],
        model_hash="contract_hash",
        stored_source_schema={
            "sqlglot_schema": case["sqlglot_schema"],
            "metadata": {"default_schema": case.get("default_schema")},
        },
        # The contract describes what the ENDPOINTS answer. The run calls the
        # same function with strict=True so a model whose SQL does not parse
        # fails the run instead of persisting an empty schema.
        strict=False,
    )

    assert columns == case["expected"], (
        f"visivo inference diverged from the shared contract on "
        f"{case['name']!r}. If this change is intentional, update "
        f"{CASES_FILE.name} and core's half of the contract together."
    )


def test_the_contract_file_is_not_empty():
    """A truncated or unparsed fixture would make every case above vacuous."""
    assert len(CASES) >= 8
